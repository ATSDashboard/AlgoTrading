"""Strategy engine: MONITORING → ENTERING → LIVE → EXITING loops.

Each strategy runs as an asyncio.Task managed by EngineManager (process-singleton).
Order placement + risk monitoring wired fully in M5+; this file sets up the loop
structure so routes.start_strategy has something to spawn.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import structlog

from app.common.types import StrategyState

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

log = structlog.get_logger(__name__)


class EngineManager:
    """Tracks running strategy tasks; supports start/cancel, heartbeat."""

    def __init__(self) -> None:
        self._tasks: dict[int, asyncio.Task] = {}
        self._subscribers: dict[int, set[asyncio.Queue]] = {}

    # ── Task lifecycle ─────────────────────────────────────────────────────
    def start(self, strategy_id: int, loop_fn: Callable[[int], Awaitable[None]]) -> None:
        if strategy_id in self._tasks and not self._tasks[strategy_id].done():
            return
        task = asyncio.create_task(self._run(strategy_id, loop_fn),
                                    name=f"strategy-{strategy_id}")
        self._tasks[strategy_id] = task

    async def stop(self, strategy_id: int) -> None:
        task = self._tasks.get(strategy_id)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run(self, strategy_id: int,
                    loop_fn: Callable[[int], Awaitable[None]]) -> None:
        try:
            await loop_fn(strategy_id)
        except asyncio.CancelledError:
            log.info("engine.cancelled", strategy_id=strategy_id)
            raise
        except Exception as e:
            log.exception("engine.crashed", strategy_id=strategy_id, err=str(e))
            await self.publish(strategy_id,
                {"type": "log", "data": {"level": "CRITICAL", "msg": str(e)},
                 "ts": datetime.now(UTC).isoformat()})

    # ── WS pub/sub ─────────────────────────────────────────────────────────
    def subscribe(self, strategy_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.setdefault(strategy_id, set()).add(q)
        return q

    def unsubscribe(self, strategy_id: int, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(strategy_id)
        if subs:
            subs.discard(q)

    async def publish(self, strategy_id: int, event: dict) -> None:
        for q in list(self._subscribers.get(strategy_id, set())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow client; drop


engine_manager = EngineManager()


# ── The actual loop (skeleton — filled in M5) ───────────────────────────────
async def run_strategy_loop(strategy_id: int) -> None:
    """Simplified loop for now: just emits premium ticks so UI has something to show.

    M5 will replace this with real premium monitoring, trigger detection, order
    placement via OMS, and transition into LIVE → risk-monitor handoff.
    """
    from app.db import session_scope
    from app.strategy.models import Strategy

    log.info("engine.loop_start", strategy_id=strategy_id)
    await engine_manager.publish(strategy_id, {
        "type": "state_change",
        "data": {"state": StrategyState.MONITORING.value},
        "ts": datetime.now(UTC).isoformat(),
    })

    tick = 0
    while True:
        tick += 1
        # Real premium polling + trigger detection wires up here. The OMS call
        # path (OrderManager.place_basket) is fully implemented in app/execution/;
        # engine fills the monitor→enter→risk handoff in M6 where the risk loop
        # lives. Kept as a tick emitter for UI preview until then.
        async with session_scope() as db:
            s = await db.get(Strategy, strategy_id)
            if s is None or s.state not in (StrategyState.MONITORING.value,
                                             StrategyState.LIVE.value,
                                             StrategyState.ENTERING.value):
                break

        await engine_manager.publish(strategy_id, {
            "type": "premium_tick",
            "data": {"tick": tick, "ce_bid": 42.0, "pe_bid": 38.0, "combined": 80.0},
            "ts": datetime.now(UTC).isoformat(),
        })
        await asyncio.sleep(2)
    log.info("engine.loop_end", strategy_id=strategy_id)
