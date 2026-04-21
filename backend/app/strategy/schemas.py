"""Pydantic request/response for strategy endpoints."""
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class StrategyCreate(BaseModel):
    broker_session_id: int
    demat_account_id: int

    underlying: Literal["NIFTY", "SENSEX"]
    expiry_date: date
    ce_strike: Decimal
    pe_strike: Decimal

    quantity_lots: int = Field(ge=1, le=100)  # hard cap from env applied in service

    trigger_mode: Literal["COMBINED", "SEPARATE"] = "COMBINED"
    combined_threshold: Decimal | None = None
    ce_threshold: Decimal | None = None
    pe_threshold: Decimal | None = None

    order_type: Literal["LIMIT", "LIMIT_WITH_BUFFER"] = "LIMIT_WITH_BUFFER"
    limit_buffer_pct: Decimal = Decimal("2.0")

    sl_amount: Decimal = Field(gt=0)
    target_amount: Decimal | None = None

    trailing_sl_enabled: bool = False
    trailing_sl_trigger: Decimal | None = None
    trailing_sl_step: Decimal | None = None
    lockin_profit_enabled: bool = False
    lockin_profit_amount: Decimal | None = None

    hedge_enabled: bool = False
    ce_hedge_strike: Decimal | None = None
    pe_hedge_strike: Decimal | None = None

    squareoff_time: time = time(15, 15)

    @model_validator(mode="after")
    def _validate_triggers(self) -> StrategyCreate:
        if self.trigger_mode == "COMBINED" and self.combined_threshold is None:
            raise ValueError("combined_threshold required when trigger_mode=COMBINED")
        if self.trigger_mode == "SEPARATE" and (self.ce_threshold is None
                                                or self.pe_threshold is None):
            raise ValueError("ce_threshold and pe_threshold required when trigger_mode=SEPARATE")
        if self.hedge_enabled and (self.ce_hedge_strike is None or self.pe_hedge_strike is None):
            raise ValueError("hedge strikes required when hedge_enabled")
        return self


class StrategyOut(BaseModel):
    id: int
    state: str
    underlying: str
    expiry_date: date
    ce_strike: Decimal
    pe_strike: Decimal
    quantity_lots: int
    hedge_enabled: bool
    trigger_mode: str
    combined_threshold: Decimal | None
    sl_amount: Decimal
    target_amount: Decimal | None
    squareoff_time: time
    final_pnl: Decimal | None
    exit_reason: str | None
    created_at: datetime
    started_at: datetime | None
    entered_at: datetime | None
    closed_at: datetime | None

    class Config:
        from_attributes = True


class StrategyPreview(BaseModel):
    """Pre-trade check result shown to operator BEFORE they click START."""
    ce_quote: dict
    pe_quote: dict
    ce_hedge_quote: dict | None = None
    pe_hedge_quote: dict | None = None
    estimated_premium: Decimal
    estimated_credit: Decimal              # quantity_units × (ce_bid + pe_bid)
    margin_required: Decimal
    margin_available: Decimal
    hedge_benefit: Decimal
    requires_two_person_approval: bool
    validation_warnings: list[str]


class WSEvent(BaseModel):
    """WebSocket message format."""
    type: Literal[
        "state_change", "premium_tick", "order_update", "pnl_tick", "log",
    ]
    data: dict
    ts: datetime
