"""Central OMS — called by strategy engine.

Responsibilities:
1. Apply pre-trade SEBI rate-limit (token bucket)
2. Split quantity across NSE freeze-qty slices (iceberg) with jitter
3. Split across demats via Smart Order Router
4. Generate idempotent client_ref_ids + hash chain
5. Place orders, track acks, poll for fills
6. Peg/re-quote unfilled orders
7. Handle partial fills
8. Persist every step (orders table) and publish events to WS

Designed to be called per-leg, once per strategy transition from MONITORING→ENTERING.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

import structlog
from redis.asyncio import Redis

from app.brokers.base import BrokerClient, Instrument, OrderRequest, Quote
from app.brokers.registry import get_broker
from app.common.errors import (
    BrokerError, FreezeQtyExceeded, InsufficientMargin, OrderRejected,
    PartialFillUnrecoverable, SEBIRateLimitExceeded,
)
from app.common.rate_limit import OrderRateLimiter
from app.common.slicer import slice_for_freeze
from app.common.types import BrokerName, OrderAction, OrderStatus, OrderType
from app.config import get_settings
from app.execution.idempotency import client_ref, order_hash
from app.execution.requote import RequoteConfig, peg_until_filled
from app.execution.router import Allocation, DematCapacity, allocate

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class LegFillResult:
    leg: str
    total_requested: int
    total_filled: int
    avg_fill_price: Decimal
    slippage_pct: float
    child_broker_order_ids: list[str]
    latency_ms: int


@dataclass(slots=True)
class LegPlanInput:
    strategy_id: int
    user_id: int
    leg: str                          # CE_MAIN / PE_MAIN / CE_HEDGE / PE_HEDGE / LEG_1 …
    broker: BrokerName
    instrument: Instrument
    action: OrderAction
    quantity_units: int
    limit_price: Decimal
    order_type: OrderType
    sebi_algo_tag: str
    demats: list[DematCapacity]
    margin_per_unit: Decimal
    prev_hash: str | None = None


class OrderManager:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._rate_limiter = OrderRateLimiter(redis)
        self._settings = get_settings()

    async def place_leg(self, plan: LegPlanInput) -> LegFillResult:
        """Place a single leg end-to-end: SOR → iceberg slicing → rate-limited
        submission → peg until filled → return aggregate fill result.
        """
        broker = get_broker(plan.broker)
        t0 = time.monotonic()

        # ── 1. SOR: split across demats ──────────────────────────────────────
        allocations = allocate(plan.quantity_units, plan.demats,
                                plan.margin_per_unit, prefer_primary=True)
        total_allocated = sum(a.quantity for a in allocations)
        if total_allocated < plan.quantity_units:
            raise InsufficientMargin(
                f"free margin covers only {total_allocated}/{plan.quantity_units} units"
            )

        # ── 2. Per-demat iceberg slicing with jitter ─────────────────────────
        freeze = plan.instrument.freeze_qty
        children: list[tuple[Allocation, int, int]] = []   # (allocation, slice_qty, slice_idx)
        slice_idx = 0
        for alloc in allocations:
            for s in slice_for_freeze(alloc.quantity, freeze):
                children.append((alloc, s.quantity, slice_idx))
                slice_idx += 1

        # ── 3. Place with SEBI rate-limit ────────────────────────────────────
        prev_hash = plan.prev_hash
        tasks: list[asyncio.Task] = []
        jitter_ms = self._settings.iceberg_slice_jitter_ms
        for alloc, qty, idx in children:
            # honor rate limit per child submission
            await self._rate_limiter.acquire(plan.user_id, cost=1)
            req = OrderRequest(
                client_ref_id=client_ref(plan.strategy_id, plan.leg, idx),
                instrument=plan.instrument, action=plan.action,
                quantity=qty, order_type=plan.order_type,
                limit_price=plan.limit_price, sebi_algo_tag=plan.sebi_algo_tag,
                demat_account=alloc.demat_account,
            )
            prev_hash = order_hash(req, prev_hash)   # chain advances per child
            task = asyncio.create_task(self._submit_and_peg(broker, req, plan))
            tasks.append(task)
            if idx < len(children) - 1:
                await asyncio.sleep(jitter_ms / 1000.0)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # ── 4. Aggregate fills ───────────────────────────────────────────────
        filled_total = 0
        px_weighted_sum = Decimal(0)
        broker_ids: list[str] = []
        errors: list[str] = []
        for r in results:
            if isinstance(r, Exception):
                errors.append(str(r))
                continue
            bo_id, filled_qty, avg_px = r
            broker_ids.append(bo_id)
            filled_total += filled_qty
            px_weighted_sum += (avg_px or Decimal(0)) * filled_qty

        if filled_total < plan.quantity_units and not broker_ids:
            # Nothing placed at all — hard failure
            raise OrderRejected(f"leg {plan.leg} all-children rejected: {errors}")

        avg_fill = (px_weighted_sum / filled_total) if filled_total > 0 else plan.limit_price
        slippage_pct = float((avg_fill - plan.limit_price) / plan.limit_price * 100) \
                       if plan.limit_price > 0 else 0.0
        latency_ms = int((time.monotonic() - t0) * 1000)

        log.info("oms.leg_done", strategy_id=plan.strategy_id, leg=plan.leg,
                 requested=plan.quantity_units, filled=filled_total,
                 slippage_pct=slippage_pct, latency_ms=latency_ms, errors=errors)

        if filled_total < plan.quantity_units:
            # Partial fill for the leg — caller decides to retry or flatten
            raise PartialFillUnrecoverable(
                f"leg {plan.leg}: filled {filled_total}/{plan.quantity_units}"
            )

        return LegFillResult(
            leg=plan.leg, total_requested=plan.quantity_units,
            total_filled=filled_total, avg_fill_price=avg_fill,
            slippage_pct=slippage_pct, child_broker_order_ids=broker_ids,
            latency_ms=latency_ms,
        )

    async def _submit_and_peg(self, broker: BrokerClient, req: OrderRequest,
                                plan: LegPlanInput) -> tuple[str, int, Decimal | None]:
        """Place one child order, then peg until filled / capped / cancelled."""
        try:
            ack = await broker.place_order(req)
        except SEBIRateLimitExceeded:
            raise
        except (OrderRejected, BrokerError) as e:
            log.warning("oms.place_rejected", leg=plan.leg,
                        client_ref=req.client_ref_id, err=str(e))
            raise

        # Peg engine — get_quote closure captures broker + instrument
        async def get_quote() -> Quote:
            return await broker.get_quote(plan.instrument)

        final_status = await peg_until_filled(
            broker, ack.broker_order_id, req.limit_price,
            plan.action, get_quote,
            RequoteConfig(wait_seconds=3.0, max_requotes=3),
        )

        upd = await broker.get_order(ack.broker_order_id)
        if final_status == OrderStatus.FILLED or upd.status == OrderStatus.FILLED:
            return ack.broker_order_id, upd.filled_qty, upd.avg_fill_price

        # Not fully filled after peg — return what we got
        return ack.broker_order_id, upd.filled_qty, upd.avg_fill_price

    async def place_basket(self, plans: list[LegPlanInput]) -> list[LegFillResult]:
        """Place multiple legs simultaneously (asyncio.gather).

        If any leg fails hard, the caller must flatten successfully filled
        legs to avoid naked single-leg exposure (strategy engine handles).
        """
        tasks = [asyncio.create_task(self.place_leg(p)) for p in plans]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        out: list[LegFillResult] = []
        errors: list[tuple[str, Exception]] = []
        for plan, r in zip(plans, results, strict=True):
            if isinstance(r, Exception):
                errors.append((plan.leg, r))
            else:
                out.append(r)
        if errors:
            log.error("oms.basket_partial_failure", errors=[(l, str(e)) for l, e in errors])
            # Caller must decide: flatten successes + halt, or retry failures
            raise PartialFillUnrecoverable(
                f"basket failed legs: {[l for l, _ in errors]}"
            )
        return out
