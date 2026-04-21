"""ORM for the `instruments` table (security master)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(primary_key=True)
    broker: Mapped[str] = mapped_column(String(20))
    script_id: Mapped[str] = mapped_column(String(100))
    exchange: Mapped[str] = mapped_column(String(10))
    underlying: Mapped[str] = mapped_column(String(20))
    expiry_date: Mapped[date] = mapped_column(Date)
    strike: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    option_type: Mapped[str] = mapped_column(String(2))
    lot_size: Mapped[int] = mapped_column(Integer)
    tick_size: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    freeze_qty: Mapped[int] = mapped_column(Integer)
    trading_symbol: Mapped[str] = mapped_column(String(100))
    is_tradable: Mapped[bool] = mapped_column(Boolean, default=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
