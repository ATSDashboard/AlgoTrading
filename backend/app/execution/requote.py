"""Peg / re-quote engine — if a LIMIT order sits unfilled past a deadline,
modify the price by a step and retry; give up after max_requotes.

Key design: we only widen pricing in the trader-adverse direction by tiny
increments (default 1 tick, up to buffer%). Never cross the spread by more
than the configured max_slippage — safer than switching to MARKET.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from decimal import Decimal

import structlog

from app.brokers.base import BrokerClient, Quote
from app.common.errors import OrderRejected
from app.common.types import OrderAction, OrderStatus

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class RequoteConfig:
    wait_seconds: float = 3.0          # time to wait before first re-quote
    max_requotes: int = 3              # total modify attempts
    tick_size: Decimal = Decimal("0.05")
    max_slippage_pct: Decimal = Decimal("1.0")   # never cross mid by more than this


async def peg_until_filled(
    broker: BrokerClient, broker_order_id: str,
    original_price: Decimal, action: OrderAction,
    get_quote: callable, cfg: RequoteConfig | None = None,
) -> OrderStatus:
    """
    Poll order status every `wait_seconds`. If still OPEN, modify price by
    one tick in the adverse direction (SELL → lower, BUY → higher). Stop
    when filled, cancelled, max retries hit, or cumulative slip cap reached.
    """
    cfg = cfg or RequoteConfig()
    current_price = original_price
    max_slip = original_price * cfg.max_slippage_pct / Decimal(100)

    for attempt in range(cfg.max_requotes + 1):
        await asyncio.sleep(cfg.wait_seconds)

        upd = await broker.get_order(broker_order_id)
        if upd.status in (OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED):
            return upd.status
        if upd.status == OrderStatus.PARTIAL:
            # Partial fill — caller handles; peg tries to fill the rest
            pass

        if attempt == cfg.max_requotes:
            log.warning("peg.max_requotes_hit", broker_order_id=broker_order_id)
            return upd.status

        quote: Quote = await get_quote()
        if action == OrderAction.SELL:
            # Improve our ask by lowering toward bid by one tick
            new_price = max(quote.bid, current_price - cfg.tick_size)
            slipped = original_price - new_price
        else:  # BUY
            new_price = min(quote.ask, current_price + cfg.tick_size)
            slipped = new_price - original_price

        if slipped > max_slip:
            log.warning("peg.slippage_cap_hit",
                        broker_order_id=broker_order_id,
                        slipped=str(slipped), cap=str(max_slip))
            return upd.status

        try:
            await broker.modify_order(broker_order_id, new_price)
            current_price = new_price
            log.info("peg.requoted", broker_order_id=broker_order_id,
                     attempt=attempt + 1, new_price=str(new_price))
        except OrderRejected as e:
            log.warning("peg.modify_rejected", err=str(e),
                        broker_order_id=broker_order_id)
            return OrderStatus.ERROR

    return OrderStatus.OPEN
