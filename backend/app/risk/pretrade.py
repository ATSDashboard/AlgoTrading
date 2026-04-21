"""Pre-trade risk checks — called BEFORE any order hits the broker.

Every check either passes silently or raises a typed RiskViolation.
Checks are ordered from cheapest to most expensive (margin check last
because it may require a broker API call).
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import DematAccount
from app.brokers.base import BrokerClient, OrderRequest
from app.common.errors import (
    ActiveStrategiesCapExceeded, CoolingOffActive, DailyLossCapExceeded,
    FatFingerGuard, FreezeQtyExceeded, IlliquidStrike, InsufficientMargin,
    LotCapExceeded, OTRThresholdBreached,
)
from app.common.types import StrategyState
from app.config import get_settings
from app.strategy.models import Strategy

_s = get_settings()


async def run_all(
    db: AsyncSession, user_id: int, broker: BrokerClient,
    legs: list[OrderRequest], demat_ids: list[int],
    quantity_lots: int,
) -> list[str]:
    """Run every pre-trade check. Returns list of warnings (non-blocking).
    Raises on hard violations.
    """
    warnings: list[str] = []

    # 1. Lot cap
    if quantity_lots > _s.max_lots_per_strategy:
        raise LotCapExceeded(f"{quantity_lots} lots > cap {_s.max_lots_per_strategy}")

    # 2. Active strategies cap
    active = await db.scalar(
        select(func.count(Strategy.id)).where(
            Strategy.user_id == user_id,
            Strategy.state.in_([s.value for s in (
                StrategyState.MONITORING, StrategyState.ENTERING,
                StrategyState.LIVE, StrategyState.EXITING)]),
        )
    ) or 0
    if active >= _s.max_active_strategies_per_user:
        raise ActiveStrategiesCapExceeded(f"{active} active ≥ cap {_s.max_active_strategies_per_user}")

    # 3. Daily loss cap
    from app.risk.state import get_daily_loss
    daily_loss = await get_daily_loss(db, user_id)
    if daily_loss >= Decimal(str(_s.max_daily_loss_per_user)):
        raise DailyLossCapExceeded(f"daily loss ₹{daily_loss} ≥ cap ₹{_s.max_daily_loss_per_user}")

    # 4. Cooling off
    from app.risk.state import is_cooling_off
    if await is_cooling_off(db, user_id):
        raise CoolingOffActive("user is in cooling-off period after halt")

    # 5. OTR threshold
    from app.risk.state import get_otr
    otr = await get_otr(db, user_id)
    if otr >= _s.otr_halt_threshold:
        raise OTRThresholdBreached(f"OTR {otr} ≥ {_s.otr_halt_threshold}")

    # 6. Fat-finger: combined premium too high
    total_premium = sum(r.limit_price * r.quantity for r in legs)
    if total_premium > Decimal("500") * max(r.quantity for r in legs):
        raise FatFingerGuard(f"combined notional ₹{total_premium} looks unusually high")

    # 7. Freeze qty per leg
    for r in legs:
        freeze = r.instrument.freeze_qty
        if r.quantity > freeze:
            # Slicer handles this downstream, but warn
            warnings.append(f"{r.instrument.trading_symbol}: qty {r.quantity} > freeze {freeze}, will be sliced")

    # 8. Liquidity: bid-ask spread + min OI
    for r in legs:
        q = await broker.get_quote(r.instrument)
        if q.ltp > 0:
            spread_pct = float((q.ask - q.bid) / q.ltp * 100)
            if spread_pct > 5.0:
                raise IlliquidStrike(f"{r.instrument.trading_symbol}: bid-ask spread {spread_pct:.1f}% > 5%")
        if q.oi < 10_000:
            warnings.append(f"{r.instrument.trading_symbol}: OI {q.oi} < 10,000 — illiquid")

    # 9. Margin check (broker API — most expensive, do last)
    for demat_id in demat_ids:
        demat = await db.get(DematAccount, demat_id)
        if demat is None:
            continue
        margin = await broker.get_margin(demat.account_number, legs)
        if margin.required > margin.available:
            raise InsufficientMargin(
                f"demat {demat.account_number}: need ₹{margin.required}, have ₹{margin.available}"
            )
        if margin.hedge_benefit > 0:
            warnings.append(f"hedge benefit ₹{margin.hedge_benefit} applied on {demat.account_number}")

    return warnings
