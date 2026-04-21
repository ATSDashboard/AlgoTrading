"""Abstract broker interface. Every broker adapter MUST implement this contract.

Strategy and execution modules depend only on this ABC — they never import a
specific broker. Adding a new broker = implement this class, register it.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.common.types import (
    BrokerName, OptionType, OrderAction, OrderStatus, OrderType, Underlying,
)


# ── DTOs (broker-agnostic) ───────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class Instrument:
    script_id: str
    exchange: str                 # NFO | BFO
    underlying: Underlying
    expiry: date
    strike: Decimal
    option_type: OptionType
    lot_size: int
    tick_size: Decimal
    freeze_qty: int
    trading_symbol: str


@dataclass(frozen=True, slots=True)
class Quote:
    instrument_id: int
    script_id: str
    ltp: Decimal
    bid: Decimal
    ask: Decimal
    bid_qty: int
    ask_qty: int
    volume: int
    oi: int
    ts: datetime


@dataclass(frozen=True, slots=True)
class OrderRequest:
    """Input to `place_order`. Immutable — enables retry with same client_ref_id."""
    client_ref_id: str            # idempotency key (required)
    instrument: Instrument
    action: OrderAction
    quantity: int
    order_type: OrderType
    limit_price: Decimal
    sebi_algo_tag: str            # attached to every broker order
    demat_account: str            # which sub-account to book against


@dataclass(frozen=True, slots=True)
class OrderAck:
    broker_order_id: str
    status: OrderStatus
    raw_response: dict[str, Any]


@dataclass(frozen=True, slots=True)
class OrderUpdate:
    broker_order_id: str
    status: OrderStatus
    filled_qty: int
    avg_fill_price: Decimal | None
    rejection_reason: str | None
    ts: datetime


@dataclass(frozen=True, slots=True)
class Position:
    script_id: str
    quantity: int                  # signed: negative = short
    avg_price: Decimal
    ltp: Decimal
    mtm_pnl: Decimal


@dataclass(frozen=True, slots=True)
class MarginInfo:
    available: Decimal
    required: Decimal              # for the order(s) being sized
    span_margin: Decimal
    exposure_margin: Decimal
    hedge_benefit: Decimal


# ── ABC ─────────────────────────────────────────────────────────────────────
class BrokerClient(ABC):
    """All broker adapters implement this contract."""
    name: BrokerName

    # ── Auth / session ───────────────────────────────────────────────────
    @abstractmethod
    async def login_url(self, state: str) -> str:
        """Return the broker login/SSO URL for user redirect."""

    @abstractmethod
    async def exchange_code(self, code: str, state: str) -> dict[str, Any]:
        """Exchange OAuth-style code for tokens. Returns {token, refresh, expires_at}."""

    @abstractmethod
    async def refresh_token(self, refresh_token: str) -> dict[str, Any]: ...

    # ── Instruments & data ────────────────────────────────────────────────
    @abstractmethod
    async def fetch_security_master(self) -> list[Instrument]:
        """Full option-chain instrument list. Called daily at 08:30 IST."""

    @abstractmethod
    async def get_quote(self, instrument: Instrument) -> Quote: ...

    @abstractmethod
    async def get_quotes(self, instruments: list[Instrument]) -> list[Quote]:
        """Batched quote fetch — preferred over N single calls."""

    # ── Orders ────────────────────────────────────────────────────────────
    @abstractmethod
    async def place_order(self, req: OrderRequest) -> OrderAck:
        """Place an order. MUST be idempotent wrt client_ref_id."""

    @abstractmethod
    async def modify_order(self, broker_order_id: str, new_price: Decimal) -> OrderAck:
        """For peg/re-quote engine."""

    @abstractmethod
    async def cancel_order(self, broker_order_id: str) -> OrderAck: ...

    @abstractmethod
    async def get_order(self, broker_order_id: str) -> OrderUpdate: ...

    @abstractmethod
    async def get_positions(self, demat_account: str) -> list[Position]: ...

    @abstractmethod
    async def get_margin(
        self, demat_account: str, orders: list[OrderRequest]
    ) -> MarginInfo:
        """Pre-trade margin check for the given basket."""

    # ── Health ────────────────────────────────────────────────────────────
    @abstractmethod
    async def ping(self) -> bool:
        """Lightweight health check for per-broker circuit breaker."""
