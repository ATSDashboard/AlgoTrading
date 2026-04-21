"""Demat-level RBAC — enforces which demats each user can access.

Usage in routes:
    demats = await user_demat_ids(db, user.id)
    if target_demat not in demats:
        raise HTTPException(403)

Or the query-builder pattern (preferred):
    q = select(Strategy).where(Strategy.demat_account_id.in_(
        await user_demat_ids(db, user.id)))
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User


async def user_demat_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Every demat this user is authorized to view/trade on.

    Admins implicitly see all demats. Other roles are restricted to
    user_demat_access rows with permission != 'NONE'.
    """
    user = await db.get(User, user_id)
    if user is None:
        return set()
    if user.role == "ADMIN" or user.role == "AUDITOR":
        row = await db.execute(text("SELECT id FROM demat_accounts"))
        return {r[0] for r in row.fetchall()}

    row = await db.execute(
        text("""SELECT demat_account_id FROM user_demat_access
                WHERE user_id=:uid AND permission <> 'NONE'"""),
        {"uid": user_id},
    )
    return {r[0] for r in row.fetchall()}


async def can_trade_demat(db: AsyncSession, user_id: int, demat_id: int) -> bool:
    """True if user has EDIT or FULL permission on this demat."""
    user = await db.get(User, user_id)
    if user is None:
        return False
    if user.role == "ADMIN":
        return True
    row = await db.execute(
        text("""SELECT permission FROM user_demat_access
                WHERE user_id=:uid AND demat_account_id=:did"""),
        {"uid": user_id, "did": demat_id},
    )
    perm = row.scalar()
    return perm in ("EDIT", "FULL")


async def demat_limits(db: AsyncSession, user_id: int, demat_id: int) -> dict | None:
    """Per-demat trading limits assigned by admin."""
    row = await db.execute(
        text("""SELECT max_lots_per_strategy, max_daily_loss, allowed_strategies,
                        trading_window_start, trading_window_end
                 FROM user_demat_access
                 WHERE user_id=:uid AND demat_account_id=:did"""),
        {"uid": user_id, "did": demat_id},
    )
    r = row.first()
    if r is None:
        return None
    return {
        "max_lots_per_strategy": r[0],
        "max_daily_loss": r[1],
        "allowed_strategies": r[2] or [],
        "trading_window_start": r[3],
        "trading_window_end": r[4],
    }
