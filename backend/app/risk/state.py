"""Risk state helpers — daily counters, OTR, cooling-off, circuit breaker.

Reads/writes `risk_state` table (one row per user per trade_date; NULL user_id = global).
Every pre-trade RMS check calls one of these; runtime RMS updates them on SL hits, halts, etc.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

_s = get_settings()


async def _upsert_today(db: AsyncSession, user_id: int) -> None:
    """Ensure a row exists for (user_id, today)."""
    await db.execute(
        text("""
            INSERT INTO risk_state (user_id, trade_date, updated_at)
            VALUES (:uid, :d, NOW())
            ON CONFLICT (user_id, trade_date) DO NOTHING
        """),
        {"uid": user_id, "d": date.today()},
    )


async def get_daily_loss(db: AsyncSession, user_id: int) -> Decimal:
    row = await db.execute(
        text("SELECT COALESCE(daily_loss_total, 0) FROM risk_state "
             "WHERE user_id=:uid AND trade_date=:d"),
        {"uid": user_id, "d": date.today()},
    )
    v = row.scalar()
    return Decimal(str(v or 0))


async def is_cooling_off(db: AsyncSession, user_id: int) -> bool:
    row = await db.execute(
        text("SELECT cooling_off_until FROM risk_state "
             "WHERE user_id=:uid AND trade_date=:d"),
        {"uid": user_id, "d": date.today()},
    )
    until = row.scalar()
    return until is not None and until > datetime.now(UTC)


async def get_otr(db: AsyncSession, user_id: int) -> float:
    """Order-to-trade ratio for today. Target: keep well under SEBI's 500 threshold."""
    row = await db.execute(
        text("""SELECT
                    CASE WHEN COALESCE(orders_filled,0) > 0
                         THEN orders_placed::numeric / orders_filled
                         ELSE 0 END AS otr
                FROM risk_state WHERE user_id=:uid AND trade_date=:d"""),
        {"uid": user_id, "d": date.today()},
    )
    v = row.scalar()
    return float(v or 0)


async def increment_orders(db: AsyncSession, user_id: int, count: int = 1) -> None:
    await _upsert_today(db, user_id)
    await db.execute(
        text("""UPDATE risk_state SET orders_placed = orders_placed + :n,
                                       updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"n": count, "uid": user_id, "d": date.today()},
    )
    await db.commit()


async def increment_fills(db: AsyncSession, user_id: int, count: int = 1) -> None:
    await _upsert_today(db, user_id)
    await db.execute(
        text("""UPDATE risk_state SET orders_filled = orders_filled + :n,
                                       updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"n": count, "uid": user_id, "d": date.today()},
    )
    await db.commit()


async def record_loss(db: AsyncSession, user_id: int, amount: Decimal) -> None:
    """Positive amount = loss. Called when strategy closes in red."""
    await _upsert_today(db, user_id)
    await db.execute(
        text("""UPDATE risk_state SET
                   daily_loss_total = daily_loss_total + :amt,
                   realized_pnl = realized_pnl - :amt,
                   updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"amt": float(amount), "uid": user_id, "d": date.today()},
    )
    await db.commit()


async def record_profit(db: AsyncSession, user_id: int, amount: Decimal) -> None:
    await _upsert_today(db, user_id)
    await db.execute(
        text("""UPDATE risk_state SET
                   realized_pnl = realized_pnl + :amt,
                   updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"amt": float(amount), "uid": user_id, "d": date.today()},
    )
    await db.commit()


async def set_halt(
    db: AsyncSession, user_id: int, reason: str,
    cooling_off_minutes: int | None = None,
) -> None:
    """Mark user halted with optional cooling-off period."""
    await _upsert_today(db, user_id)
    cool_until = None
    if cooling_off_minutes:
        cool_until = datetime.now(UTC) + timedelta(minutes=cooling_off_minutes)
    await db.execute(
        text("""UPDATE risk_state SET
                   halted = TRUE, halted_reason = :r, halted_at = NOW(),
                   cooling_off_until = :c, updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"r": reason, "c": cool_until, "uid": user_id, "d": date.today()},
    )
    await db.commit()


async def clear_halt(db: AsyncSession, user_id: int) -> None:
    """Admin manually resolves halt."""
    await db.execute(
        text("""UPDATE risk_state SET
                   halted = FALSE, halted_reason = NULL, halted_at = NULL,
                   cooling_off_until = NULL, updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"uid": user_id, "d": date.today()},
    )
    await db.commit()


async def bump_consecutive_errors(db: AsyncSession, user_id: int) -> int:
    await _upsert_today(db, user_id)
    row = await db.execute(
        text("""UPDATE risk_state SET
                   consecutive_errors = consecutive_errors + 1,
                   updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d
                RETURNING consecutive_errors"""),
        {"uid": user_id, "d": date.today()},
    )
    await db.commit()
    return int(row.scalar() or 0)


async def reset_consecutive_errors(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        text("""UPDATE risk_state SET consecutive_errors = 0, updated_at = NOW()
                WHERE user_id=:uid AND trade_date=:d"""),
        {"uid": user_id, "d": date.today()},
    )
    await db.commit()
