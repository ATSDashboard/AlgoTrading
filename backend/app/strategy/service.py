"""Strategy CRUD + lifecycle control (start/pause/exit/kill).

Pre-trade RMS checks happen here — hard enforcement of env-configured caps.
Engine loop (monitoring/entering/live) lives in engine.py (M5).
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import BrokerSession, User
from app.common.errors import (
    ActiveStrategiesCapExceeded, LotCapExceeded, RiskViolation,
    TwoPersonApprovalRequired,
)
from app.common.types import StrategyState
from app.config import get_settings
from app.data.models import Instrument
from app.strategy.models import Strategy
from app.strategy.schemas import StrategyCreate
from app.strategy.state_machine import transition

_settings = get_settings()


async def pre_trade_checks(db: AsyncSession, user: User, data: StrategyCreate) -> None:
    """Run hard caps BEFORE strategy is persisted. Raises RiskViolation on breach."""
    if data.quantity_lots > _settings.max_lots_per_strategy:
        raise LotCapExceeded(
            f"{data.quantity_lots} > cap {_settings.max_lots_per_strategy}"
        )

    # Active strategies cap (per-user)
    active_count = await db.scalar(
        select(func.count(Strategy.id)).where(
            Strategy.user_id == user.id,
            Strategy.state.in_([s.value for s in (
                StrategyState.MONITORING, StrategyState.ENTERING,
                StrategyState.LIVE, StrategyState.EXITING,
            )]),
        )
    )
    if (active_count or 0) >= _settings.max_active_strategies_per_user:
        raise ActiveStrategiesCapExceeded(
            f"user has {active_count} active, cap {_settings.max_active_strategies_per_user}"
        )

    # Two-person approval if above threshold
    if data.quantity_lots >= _settings.two_person_approval_min_lots:
        # Enforced later in start() — flagged here via a warning.
        pass


async def create_strategy(db: AsyncSession, user: User, data: StrategyCreate) -> Strategy:
    await pre_trade_checks(db, user, data)

    # Resolve broker session → broker name
    sess = await db.get(BrokerSession, data.broker_session_id)
    if sess is None or sess.user_id != user.id or not sess.is_active:
        raise RiskViolation("invalid or inactive broker session")

    # Resolve main-leg instruments
    ce_inst = await _find_instrument(db, data.underlying, data.expiry_date,
                                      data.ce_strike, "CE")
    pe_inst = await _find_instrument(db, data.underlying, data.expiry_date,
                                      data.pe_strike, "PE")

    ce_hedge_inst = pe_hedge_inst = None
    if data.hedge_enabled:
        ce_hedge_inst = await _find_instrument(db, data.underlying, data.expiry_date,
                                                data.ce_hedge_strike, "CE")
        pe_hedge_inst = await _find_instrument(db, data.underlying, data.expiry_date,
                                                data.pe_hedge_strike, "PE")

    strat = Strategy(
        user_id=user.id,
        broker_session_id=data.broker_session_id,
        demat_account_id=data.demat_account_id,
        underlying=data.underlying,
        expiry_date=data.expiry_date,
        ce_strike=data.ce_strike,
        pe_strike=data.pe_strike,
        ce_instrument_id=ce_inst.id,
        pe_instrument_id=pe_inst.id,
        hedge_enabled=data.hedge_enabled,
        ce_hedge_strike=data.ce_hedge_strike,
        pe_hedge_strike=data.pe_hedge_strike,
        ce_hedge_instrument_id=ce_hedge_inst.id if ce_hedge_inst else None,
        pe_hedge_instrument_id=pe_hedge_inst.id if pe_hedge_inst else None,
        quantity_lots=data.quantity_lots,
        trigger_mode=data.trigger_mode,
        combined_threshold=data.combined_threshold,
        ce_threshold=data.ce_threshold,
        pe_threshold=data.pe_threshold,
        order_type=data.order_type,
        limit_buffer_pct=data.limit_buffer_pct,
        sl_amount=data.sl_amount,
        target_amount=data.target_amount,
        trailing_sl_enabled=data.trailing_sl_enabled,
        trailing_sl_trigger=data.trailing_sl_trigger,
        trailing_sl_step=data.trailing_sl_step,
        lockin_profit_enabled=data.lockin_profit_enabled,
        lockin_profit_amount=data.lockin_profit_amount,
        squareoff_time=data.squareoff_time,
        state=StrategyState.DRAFT.value,
        sebi_algo_tag=_settings.sebi_algo_id or "PAPER",
    )
    db.add(strat)
    await db.commit()
    await db.refresh(strat)
    return strat


async def start_strategy(db: AsyncSession, user: User, strategy_id: int) -> Strategy:
    s = await _load(db, user, strategy_id)

    if (s.quantity_lots >= _settings.two_person_approval_min_lots
            and s.approved_by is None):
        raise TwoPersonApprovalRequired(
            f"strategy with {s.quantity_lots} lots requires 2nd admin approval"
        )

    transition(StrategyState(s.state), StrategyState.MONITORING)
    s.state = StrategyState.MONITORING.value
    s.started_at = datetime.now(UTC)
    await db.commit()
    # Engine task is spawned by routes.py (has access to app.state)
    return s


async def exit_strategy(db: AsyncSession, user: User, strategy_id: int,
                        reason: str = "MANUAL_EXIT") -> Strategy:
    s = await _load(db, user, strategy_id)
    target = (StrategyState.EXITING if s.state == StrategyState.LIVE.value
              else StrategyState.CLOSED)
    transition(StrategyState(s.state), target)
    s.state = target.value
    s.exit_reason = reason
    if target == StrategyState.CLOSED:
        s.closed_at = datetime.now(UTC)
    await db.commit()
    return s


async def kill_strategy(db: AsyncSession, user: User, strategy_id: int) -> Strategy:
    s = await _load(db, user, strategy_id)
    s.state = StrategyState.EMERGENCY_HALT.value
    s.exit_reason = "KILL_SWITCH"
    await db.commit()
    return s


async def list_user_strategies(db: AsyncSession, user: User,
                                active_only: bool = False) -> list[Strategy]:
    q = select(Strategy).where(Strategy.user_id == user.id)
    if active_only:
        q = q.where(Strategy.state.in_([
            s.value for s in (StrategyState.MONITORING, StrategyState.ENTERING,
                              StrategyState.LIVE, StrategyState.EXITING)
        ]))
    q = q.order_by(Strategy.created_at.desc())
    return list(await db.scalars(q))


# ── internal helpers ─────────────────────────────────────────────────────────
async def _load(db: AsyncSession, user: User, strategy_id: int) -> Strategy:
    s = await db.get(Strategy, strategy_id)
    if s is None or s.user_id != user.id:
        raise RiskViolation(f"strategy {strategy_id} not found")
    return s


async def _find_instrument(db: AsyncSession, underlying: str, expiry, strike, opt_type: str) -> Instrument:
    inst = await db.scalar(
        select(Instrument).where(
            Instrument.underlying == underlying,
            Instrument.expiry_date == expiry,
            Instrument.strike == strike,
            Instrument.option_type == opt_type,
            Instrument.is_tradable.is_(True),
        )
    )
    if inst is None:
        raise RiskViolation(f"instrument not found: {underlying} {expiry} {strike} {opt_type}")
    return inst
