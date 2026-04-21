"""Paper (mock) broker. Always available. Used for dev, CI, and paper-trading mode.

Simulates realistic behavior:
- Orders ack instantly, fill after 50-500ms based on LIMIT vs bid.
- Slippage: 0-1% random on fills.
- 1% random rejection rate in stress mode.
- Quotes seeded from a simple BS-ish model or replayed from recorded tape.
"""
from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from app.brokers.base import (
    BrokerClient, Instrument, MarginInfo, OrderAck, OrderRequest,
    OrderUpdate, Position, Quote,
)
from app.common.errors import OrderRejected
from app.common.types import (
    BrokerName, OptionType, OrderAction, OrderStatus, Underlying,
)


class PaperBroker(BrokerClient):
    name = BrokerName.PAPER

    def __init__(self) -> None:
        self._orders: dict[str, dict[str, Any]] = {}
        self._positions: dict[str, Position] = {}
        self._quote_cache: dict[str, Quote] = {}

    # ── Auth ─────────────────────────────────────────────────────────────
    async def login_url(self, state: str) -> str:
        return f"/paper-broker/auto-login?state={state}"

    async def exchange_code(self, code: str, state: str) -> dict[str, Any]:
        return {
            "token": f"paper-{uuid.uuid4()}",
            "refresh": f"paper-rt-{uuid.uuid4()}",
            "expires_at": datetime.now(UTC) + timedelta(hours=8),
        }

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        return await self.exchange_code("", "")

    # ── Security master ──────────────────────────────────────────────────
    async def fetch_security_master(self) -> list[Instrument]:
        """Generate a synthetic NIFTY+SENSEX option chain for the nearest expiry."""
        out: list[Instrument] = []
        next_expiry = self._next_thursday()
        for und, spot, step, lot, freeze in [
            (Underlying.NIFTY, 24800, 50, 65, 1800),
            (Underlying.SENSEX, 81200, 100, 20, 1000),
        ]:
            for offset in range(-30, 31):
                strike = Decimal(spot + offset * step)
                for opt in (OptionType.CE, OptionType.PE):
                    out.append(Instrument(
                        script_id=f"PAPER-{und.value}-{next_expiry:%d%b%y}-{int(strike)}{opt.value}",
                        exchange="NFO" if und == Underlying.NIFTY else "BFO",
                        underlying=und,
                        expiry=next_expiry,
                        strike=strike,
                        option_type=opt,
                        lot_size=lot,
                        tick_size=Decimal("0.05"),
                        freeze_qty=freeze,
                        trading_symbol=f"{und.value}{next_expiry:%y%b}{int(strike)}{opt.value}".upper(),
                    ))
        return out

    @staticmethod
    def _next_thursday() -> date:
        today = date.today()
        days_ahead = (3 - today.weekday()) % 7 or 7
        return today + timedelta(days=days_ahead)

    # ── Quotes ───────────────────────────────────────────────────────────
    async def get_quote(self, instrument: Instrument) -> Quote:
        ltp = self._synthetic_price(instrument)
        spread = ltp * Decimal("0.01")  # 1% bid-ask
        return Quote(
            instrument_id=0,
            script_id=instrument.script_id,
            ltp=ltp,
            bid=(ltp - spread / 2).quantize(Decimal("0.05")),
            ask=(ltp + spread / 2).quantize(Decimal("0.05")),
            bid_qty=instrument.lot_size * 10,
            ask_qty=instrument.lot_size * 10,
            volume=random.randint(1000, 100000),
            oi=random.randint(10000, 500000),
            ts=datetime.now(UTC),
        )

    async def get_quotes(self, instruments: list[Instrument]) -> list[Quote]:
        return [await self.get_quote(i) for i in instruments]

    def _synthetic_price(self, inst: Instrument) -> Decimal:
        """Cheap BS-ish approximation — just enough variation for realistic dev."""
        spot = Decimal(24800 if inst.underlying == Underlying.NIFTY else 81200)
        intrinsic = max(Decimal(0),
                        spot - inst.strike if inst.option_type == OptionType.CE
                        else inst.strike - spot)
        distance = abs(float(spot - inst.strike))
        time_decay = max(1.0, 20.0 - distance / 100.0)
        price = float(intrinsic) + time_decay + random.uniform(-0.5, 0.5)
        return Decimal(str(max(0.05, round(price, 2))))

    # ── Orders ───────────────────────────────────────────────────────────
    async def place_order(self, req: OrderRequest) -> OrderAck:
        # Idempotency: same client_ref_id returns the same broker_order_id
        if req.client_ref_id in self._orders:
            existing = self._orders[req.client_ref_id]
            return OrderAck(existing["broker_order_id"], OrderStatus(existing["status"]),
                            existing["raw"])

        if random.random() < 0.005:       # 0.5% synthetic reject for realism
            raise OrderRejected("paper: synthetic reject for testing")

        bo_id = f"PAPER-{uuid.uuid4().hex[:12].upper()}"
        record: dict[str, Any] = {
            "broker_order_id": bo_id,
            "req": req, "status": OrderStatus.SUBMITTED.value,
            "filled_qty": 0, "avg_fill_price": None,
            "placed_at": datetime.now(UTC),
            "raw": {"mock": True, "client_ref_id": req.client_ref_id},
        }
        self._orders[req.client_ref_id] = record
        asyncio.create_task(self._simulate_fill(req.client_ref_id))
        return OrderAck(bo_id, OrderStatus.SUBMITTED, record["raw"])

    async def _simulate_fill(self, client_ref: str) -> None:
        await asyncio.sleep(random.uniform(0.05, 0.5))
        rec = self._orders[client_ref]
        req: OrderRequest = rec["req"]
        slippage = Decimal(str(random.uniform(-0.005, 0.01)))   # small adverse bias
        fill_px = (req.limit_price * (Decimal(1) + slippage)).quantize(Decimal("0.05"))
        rec.update(status=OrderStatus.FILLED.value,
                   filled_qty=req.quantity,
                   avg_fill_price=fill_px,
                   filled_at=datetime.now(UTC))
        # Update positions (short if SELL, long if BUY)
        qty = req.quantity if req.action == OrderAction.BUY else -req.quantity
        key = req.instrument.script_id
        existing = self._positions.get(key)
        if existing is None:
            self._positions[key] = Position(script_id=key, quantity=qty,
                                            avg_price=fill_px, ltp=fill_px,
                                            mtm_pnl=Decimal(0))
        else:
            new_qty = existing.quantity + qty
            self._positions[key] = Position(script_id=key, quantity=new_qty,
                                            avg_price=fill_px, ltp=fill_px,
                                            mtm_pnl=Decimal(0))

    async def modify_order(self, broker_order_id: str, new_price: Decimal) -> OrderAck:
        for rec in self._orders.values():
            if rec["broker_order_id"] == broker_order_id:
                rec["req"] = OrderRequest(**{**rec["req"].__dict__, "limit_price": new_price})
                return OrderAck(broker_order_id, OrderStatus(rec["status"]), rec["raw"])
        raise OrderRejected(f"unknown order {broker_order_id}")

    async def cancel_order(self, broker_order_id: str) -> OrderAck:
        for rec in self._orders.values():
            if rec["broker_order_id"] == broker_order_id:
                if rec["status"] in (OrderStatus.FILLED.value, OrderStatus.CANCELLED.value):
                    return OrderAck(broker_order_id, OrderStatus(rec["status"]), rec["raw"])
                rec["status"] = OrderStatus.CANCELLED.value
                rec["cancelled_at"] = datetime.now(UTC)
                return OrderAck(broker_order_id, OrderStatus.CANCELLED, rec["raw"])
        raise OrderRejected(f"unknown order {broker_order_id}")

    async def get_order(self, broker_order_id: str) -> OrderUpdate:
        for rec in self._orders.values():
            if rec["broker_order_id"] == broker_order_id:
                return OrderUpdate(
                    broker_order_id=broker_order_id,
                    status=OrderStatus(rec["status"]),
                    filled_qty=rec["filled_qty"],
                    avg_fill_price=rec["avg_fill_price"],
                    rejection_reason=None,
                    ts=datetime.now(UTC),
                )
        raise OrderRejected(f"unknown order {broker_order_id}")

    async def get_positions(self, demat_account: str) -> list[Position]:
        return list(self._positions.values())

    async def get_margin(
        self, demat_account: str, orders: list[OrderRequest]
    ) -> MarginInfo:
        # Very rough: 15% of notional for sells, 5% for hedge buys, hedge benefit 60%
        notional = sum(o.limit_price * o.quantity for o in orders)
        short_notional = sum(o.limit_price * o.quantity for o in orders
                             if o.action == OrderAction.SELL)
        span = short_notional * Decimal("0.10")
        exposure = short_notional * Decimal("0.05")
        has_hedge = any(o.action == OrderAction.BUY for o in orders)
        hedge_benefit = (span + exposure) * Decimal("0.6") if has_hedge else Decimal(0)
        required = span + exposure - hedge_benefit
        return MarginInfo(
            available=Decimal(1_000_000),   # paper: effectively unlimited
            required=required,
            span_margin=span,
            exposure_margin=exposure,
            hedge_benefit=hedge_benefit,
        )

    async def ping(self) -> bool:
        return True
