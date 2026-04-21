"""Runtime RMS loop — unit tests for each exit trigger."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.common.types import ExitReason
from app.risk.runtime import RiskContext, risk_loop


def _ctx(**overrides) -> RiskContext:
    defaults = dict(
        strategy_id=1, user_id=1, state="LIVE",
        sl_amount=Decimal(3000), target_amount=Decimal(2000),
        squareoff_time=time(15, 15),
        trailing_sl_enabled=False, trailing_sl_trigger=None, trailing_sl_step=None,
        lockin_profit_enabled=False, lockin_profit_amount=None,
        mtm_dd_kill_pct=40.0, dead_man_sec=120,
    )
    defaults.update(overrides)
    return RiskContext(**defaults)


@pytest.mark.asyncio
async def test_sl_hit():
    ctx = _ctx(sl_amount=Decimal(1000))
    exit_fn = AsyncMock()
    events: list[dict] = []

    tick = 0
    async def pnl():
        nonlocal tick; tick += 1
        return Decimal(-1500)  # exceeds SL

    cancelled = [False]
    async def hb(): return datetime.now(UTC)
    async def recon(): return True

    await risk_loop(ctx, pnl, hb, recon, exit_fn,
                     lambda e: events.append(e) or asyncio.sleep(0),
                     lambda: cancelled[0])

    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.SL_HIT


@pytest.mark.asyncio
async def test_target_hit():
    ctx = _ctx(target_amount=Decimal(500))
    exit_fn = AsyncMock()

    async def pnl(): return Decimal(600)
    async def hb(): return datetime.now(UTC)
    async def recon(): return True

    await risk_loop(ctx, pnl, hb, recon, exit_fn,
                     AsyncMock(), lambda: False)
    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.TARGET_HIT


@pytest.mark.asyncio
async def test_trailing_sl_raises():
    ctx = _ctx(trailing_sl_enabled=True, trailing_sl_trigger=Decimal(500),
               trailing_sl_step=Decimal(200), sl_amount=Decimal(3000),
               target_amount=None, squareoff_time=None, mtm_dd_kill_pct=None,
               dead_man_sec=None)
    events: list[dict] = []

    pnl_seq = iter([Decimal(600), Decimal(800), Decimal(300)])
    call = 0

    async def pnl():
        nonlocal call; call += 1
        if call <= 3:
            return next(pnl_seq)
        raise asyncio.CancelledError  # stop loop

    async def hb(): return datetime.now(UTC)
    async def recon(): return True

    try:
        await risk_loop(ctx, pnl, hb, recon, AsyncMock(),
                         lambda e: events.append(e) or asyncio.sleep(0),
                         lambda: call > 3)
    except asyncio.CancelledError:
        pass

    # After pnl=600 (>500 trigger), SL should move from 3000 to 600-200=400
    assert ctx.effective_sl == Decimal(600)  # 800 - 200 = 600 (raised again on tick 2)


@pytest.mark.asyncio
async def test_dead_man_switch():
    ctx = _ctx(dead_man_sec=5, target_amount=None, squareoff_time=None, mtm_dd_kill_pct=None)
    exit_fn = AsyncMock()

    async def pnl(): return Decimal(0)
    async def hb(): return datetime.now(UTC) - timedelta(seconds=60)  # stale
    async def recon(): return True

    await risk_loop(ctx, pnl, hb, recon, exit_fn,
                     AsyncMock(), lambda: False)
    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.DEAD_MAN_SWITCH


@pytest.mark.asyncio
async def test_position_mismatch():
    ctx = _ctx(target_amount=None, squareoff_time=None, mtm_dd_kill_pct=None, dead_man_sec=None)
    ctx.last_recon_at = 0  # force immediate recon
    exit_fn = AsyncMock()

    async def pnl(): return Decimal(0)
    async def hb(): return datetime.now(UTC)
    async def recon(): return False  # mismatch!

    await risk_loop(ctx, pnl, hb, recon, exit_fn,
                     AsyncMock(), lambda: False)
    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.POSITION_MISMATCH


@pytest.mark.asyncio
async def test_circuit_breaker():
    ctx = _ctx(target_amount=None, squareoff_time=None, mtm_dd_kill_pct=None, dead_man_sec=None)
    exit_fn = AsyncMock()

    call = 0
    async def pnl():
        nonlocal call; call += 1
        raise ConnectionError("broker down")

    await risk_loop(ctx, pnl, AsyncMock(), AsyncMock(), exit_fn,
                     AsyncMock(), lambda: False)
    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.CIRCUIT_BREAKER


@pytest.mark.asyncio
async def test_mtm_drawdown():
    ctx = _ctx(mtm_dd_kill_pct=30.0, target_amount=None, squareoff_time=None, dead_man_sec=None)
    exit_fn = AsyncMock()

    pnl_seq = iter([Decimal(1000), Decimal(600)])  # peak 1000, then 600 = 40% DD > 30%
    call = 0

    async def pnl():
        nonlocal call; call += 1
        return next(pnl_seq)

    async def hb(): return datetime.now(UTC)
    async def recon(): return True

    await risk_loop(ctx, pnl, hb, recon, exit_fn,
                     AsyncMock(), lambda: False)
    exit_fn.assert_called_once()
    assert exit_fn.call_args[0][0] == ExitReason.MTM_DRAWDOWN
