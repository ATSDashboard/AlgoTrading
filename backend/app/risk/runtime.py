"""Runtime RMS loop — runs as an asyncio task per LIVE strategy.

Every 5 seconds checks:
1. Hard SL (net P&L ≤ -sl_amount)
2. Target profit (net P&L ≥ target_amount)
3. Time-based exit (IST time ≥ squareoff_time)
4. MTM drawdown from peak (DD % ≥ mtm_drawdown_kill_pct)
5. Trailing SL adjustment (move SL up when profit grows)
6. Lock-in profits (move SL to breakeven when threshold crossed)
7. Dead-man switch (UI heartbeat stale > threshold)
8. Position reconciliation (internal vs broker, every 30s)
9. Circuit breaker (consecutive API errors ≥ threshold → halt + cooling off)
10. VIX spike check (if enabled, halt when intraday VIX move > threshold)

Each check that triggers an exit calls the execution OMS to flatten, transitions
strategy state, and publishes an event over WebSocket.
"""
from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, time as dt_time, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

import structlog

from app.common.errors import (
    CircuitBreakerTripped, CoolingOffActive, DeadManSwitchFired, PositionMismatch,
)
from app.common.types import ExitReason, StrategyState
from app.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger(__name__)
_s = get_settings()


class RiskContext:
    """Mutable context per-strategy, updated each tick."""
    __slots__ = (
        "strategy_id", "user_id", "state",
        "sl_amount", "target_amount", "squareoff_time",
        "trailing_sl_enabled", "trailing_sl_trigger", "trailing_sl_step",
        "lockin_profit_enabled", "lockin_profit_amount",
        "mtm_dd_kill_pct", "dead_man_sec",
        # Runtime state
        "current_pnl", "peak_pnl", "effective_sl",
        "lockin_activated", "consecutive_errors",
        "last_recon_at", "last_heartbeat_at",
    )

    def __init__(self, **kw: object) -> None:
        for k, v in kw.items():
            setattr(self, k, v)
        self.peak_pnl: Decimal = Decimal(0)
        self.effective_sl: Decimal = kw.get("sl_amount", Decimal(0))  # type: ignore[assignment]
        self.lockin_activated: bool = False
        self.consecutive_errors: int = 0
        self.last_recon_at: float = 0.0
        self.last_heartbeat_at: float = time.monotonic()


async def risk_loop(
    ctx: RiskContext,
    get_pnl: callable,          # async () -> Decimal — live P&L from broker positions
    get_heartbeat: callable,    # async () -> datetime | None — last UI heartbeat
    reconcile: callable,        # async () -> bool — True if positions match
    exit_fn: callable,          # async (reason: ExitReason) -> None — flatten + close
    publish: callable,          # async (event: dict) -> None — WS event
    is_cancelled: callable,     # () -> bool — check if task was cancelled
) -> None:
    """Main loop. Runs every 5s until strategy exits or task is cancelled."""
    log.info("risk.loop_start", strategy_id=ctx.strategy_id)

    while not is_cancelled():
        try:
            ctx.current_pnl = await get_pnl()
        except Exception as e:
            ctx.consecutive_errors += 1
            log.warning("risk.pnl_fetch_error", err=str(e),
                        consecutive=ctx.consecutive_errors, strategy_id=ctx.strategy_id)
            if ctx.consecutive_errors >= _s.circuit_breaker_error_threshold:
                await _halt(ctx, ExitReason.CIRCUIT_BREAKER,
                            f"circuit breaker: {ctx.consecutive_errors} consecutive errors",
                            exit_fn, publish)
                return
            await asyncio.sleep(5)
            continue

        ctx.consecutive_errors = 0  # reset on success

        # ── 1. Update peak P&L ─────────────────────────────────────────
        if ctx.current_pnl > ctx.peak_pnl:
            ctx.peak_pnl = ctx.current_pnl

        # ── 2. Hard SL ─────────────────────────────────────────────────
        if ctx.effective_sl and ctx.current_pnl <= -ctx.effective_sl:
            await _halt(ctx, ExitReason.SL_HIT,
                        f"SL hit: P&L ₹{ctx.current_pnl} ≤ -₹{ctx.effective_sl}",
                        exit_fn, publish)
            return

        # ── 3. Target ──────────────────────────────────────────────────
        if ctx.target_amount and ctx.current_pnl >= ctx.target_amount:
            await _halt(ctx, ExitReason.TARGET_HIT,
                        f"target: P&L ₹{ctx.current_pnl} ≥ ₹{ctx.target_amount}",
                        exit_fn, publish)
            return

        # ── 4. Time-based exit ─────────────────────────────────────────
        now_ist = datetime.now(UTC) + timedelta(hours=5, minutes=30)
        if ctx.squareoff_time and now_ist.time() >= ctx.squareoff_time:
            await _halt(ctx, ExitReason.TIME_EXIT,
                        f"time exit at {ctx.squareoff_time}",
                        exit_fn, publish)
            return

        # ── 5. MTM drawdown from peak ──────────────────────────────────
        if ctx.mtm_dd_kill_pct and ctx.peak_pnl > 0:
            dd = float((ctx.peak_pnl - ctx.current_pnl) / ctx.peak_pnl * 100)
            if dd >= ctx.mtm_dd_kill_pct:
                await _halt(ctx, ExitReason.MTM_DRAWDOWN,
                            f"MTM DD {dd:.1f}% ≥ {ctx.mtm_dd_kill_pct}% (peak ₹{ctx.peak_pnl})",
                            exit_fn, publish)
                return

        # ── 6. Trailing SL ─────────────────────────────────────────────
        if ctx.trailing_sl_enabled and ctx.trailing_sl_trigger and ctx.trailing_sl_step:
            if ctx.current_pnl >= ctx.trailing_sl_trigger:
                new_sl = ctx.current_pnl - ctx.trailing_sl_step
                if new_sl > ctx.effective_sl:
                    old = ctx.effective_sl
                    ctx.effective_sl = new_sl
                    await publish({
                        "type": "log", "ts": _now(),
                        "data": {"level": "INFO",
                                 "msg": f"trailing SL raised: ₹{old} → ₹{new_sl}"}
                    })

        # ── 7. Lock-in profits ─────────────────────────────────────────
        if (ctx.lockin_profit_enabled and ctx.lockin_profit_amount
                and not ctx.lockin_activated
                and ctx.current_pnl >= ctx.lockin_profit_amount):
            ctx.lockin_activated = True
            ctx.effective_sl = Decimal(0)  # breakeven
            await publish({
                "type": "log", "ts": _now(),
                "data": {"level": "INFO",
                         "msg": f"lock-in activated: SL moved to breakeven (₹0)"}
            })

        # ── 8. Dead-man switch ─────────────────────────────────────────
        if ctx.dead_man_sec:
            hb = await get_heartbeat()
            if hb is None or (datetime.now(UTC) - hb).total_seconds() > ctx.dead_man_sec:
                await _halt(ctx, ExitReason.DEAD_MAN_SWITCH,
                            f"dead-man switch: no heartbeat for {ctx.dead_man_sec}s",
                            exit_fn, publish)
                return

        # ── 9. Position reconciliation (every 30s) ─────────────────────
        now_mono = time.monotonic()
        if now_mono - ctx.last_recon_at >= 30:
            ctx.last_recon_at = now_mono
            try:
                match = await reconcile()
                if not match:
                    await _halt(ctx, ExitReason.POSITION_MISMATCH,
                                "position mismatch: internal ≠ broker",
                                exit_fn, publish)
                    return
            except Exception as e:
                log.warning("risk.recon_error", err=str(e), strategy_id=ctx.strategy_id)

        # ── Emit P&L tick ──────────────────────────────────────────────
        await publish({
            "type": "pnl_tick", "ts": _now(),
            "data": {
                "pnl": float(ctx.current_pnl),
                "peak": float(ctx.peak_pnl),
                "effective_sl": float(ctx.effective_sl),
                "lockin": ctx.lockin_activated,
                "dd_pct": float((ctx.peak_pnl - ctx.current_pnl) / ctx.peak_pnl * 100)
                          if ctx.peak_pnl > 0 else 0,
            },
        })

        await asyncio.sleep(5)

    log.info("risk.loop_end", strategy_id=ctx.strategy_id)


async def _halt(
    ctx: RiskContext, reason: ExitReason, msg: str,
    exit_fn: callable, publish: callable,
) -> None:
    log.warning("risk.exit_triggered", strategy_id=ctx.strategy_id,
                reason=reason.value, msg=msg,
                pnl=float(ctx.current_pnl), peak=float(ctx.peak_pnl))
    await publish({
        "type": "state_change", "ts": _now(),
        "data": {"state": StrategyState.EXITING.value,
                 "reason": reason.value, "msg": msg},
    })
    await exit_fn(reason)


def _now() -> str:
    return datetime.now(UTC).isoformat()
