"""ORM for strategies + orders."""
from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
    String, Text, Time, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    broker_session_id: Mapped[int] = mapped_column(ForeignKey("broker_sessions.id"))
    demat_account_id: Mapped[int] = mapped_column(ForeignKey("demat_accounts.id"))

    underlying: Mapped[str] = mapped_column(String(20))
    expiry_date: Mapped[Date] = mapped_column(Date)
    ce_strike: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    pe_strike: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    ce_instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))
    pe_instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))

    hedge_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ce_hedge_strike: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    pe_hedge_strike: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    ce_hedge_instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))
    pe_hedge_instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))

    quantity_lots: Mapped[int] = mapped_column(Integer)

    trigger_mode: Mapped[str] = mapped_column(String(20))
    combined_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    ce_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    pe_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    order_type: Mapped[str] = mapped_column(String(30), default="LIMIT_WITH_BUFFER")
    limit_buffer_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("2.0"))

    sl_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    target_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    trailing_sl_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    trailing_sl_trigger: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    trailing_sl_step: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    lockin_profit_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    lockin_profit_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))

    squareoff_time: Mapped[time] = mapped_column(Time, default=time(15, 15))

    state: Mapped[str] = mapped_column(String(25), default="DRAFT")
    exit_reason: Mapped[str | None] = mapped_column(String(30))
    final_pnl: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    peak_pnl: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)

    sebi_algo_tag: Mapped[str | None] = mapped_column(String(50))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"))
    parent_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    leg: Mapped[str] = mapped_column(String(10))
    action: Mapped[str] = mapped_column(String(10))
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    order_type: Mapped[str] = mapped_column(String(30))
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    client_ref_id: Mapped[str] = mapped_column(String(100), unique=True)
    parent_hash: Mapped[str | None] = mapped_column(String(64))
    order_hash: Mapped[str] = mapped_column(String(64))

    broker_order_id: Mapped[str | None] = mapped_column(String(100))
    broker_response: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")

    requested_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    filled_qty: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    slippage_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))

    sebi_algo_tag: Mapped[str | None] = mapped_column(String(50))
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requote_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
