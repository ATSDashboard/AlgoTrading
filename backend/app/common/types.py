"""Shared domain types and enums. Single source of truth — import everywhere."""
from __future__ import annotations

from enum import StrEnum


class Underlying(StrEnum):
    NIFTY = "NIFTY"
    SENSEX = "SENSEX"


class OptionType(StrEnum):
    CE = "CE"
    PE = "PE"


class OrderAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(StrEnum):
    LIMIT = "LIMIT"
    LIMIT_WITH_BUFFER = "LIMIT_WITH_BUFFER"
    # MARKET intentionally excluded — backend rejects it on options.


class OrderStatus(StrEnum):
    PENDING = "PENDING"          # created, not yet sent to broker
    SUBMITTED = "SUBMITTED"      # sent, awaiting ack
    OPEN = "OPEN"                # live on exchange, not filled
    PARTIAL = "PARTIAL"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    ERROR = "ERROR"


class StrategyState(StrEnum):
    DRAFT = "DRAFT"
    MONITORING = "MONITORING"
    ENTERING = "ENTERING"
    LIVE = "LIVE"
    EXITING = "EXITING"
    CLOSED = "CLOSED"
    EMERGENCY_HALT = "EMERGENCY_HALT"


class TriggerMode(StrEnum):
    COMBINED = "COMBINED"        # (ce_bid + pe_bid) ≥ threshold
    SEPARATE = "SEPARATE"        # ce_bid ≥ X AND pe_bid ≥ Y


class ExitReason(StrEnum):
    SL_HIT = "SL_HIT"
    TARGET_HIT = "TARGET_HIT"
    TIME_EXIT = "TIME_EXIT"
    MANUAL_EXIT = "MANUAL_EXIT"
    KILL_SWITCH = "KILL_SWITCH"
    DEAD_MAN_SWITCH = "DEAD_MAN_SWITCH"
    CIRCUIT_BREAKER = "CIRCUIT_BREAKER"
    MTM_DRAWDOWN = "MTM_DRAWDOWN"
    POSITION_MISMATCH = "POSITION_MISMATCH"
    BROKER_DOWN = "BROKER_DOWN"


class BrokerName(StrEnum):
    PAPER = "paper"
    AXIS = "axis"
    ZERODHA = "zerodha"
    MONARCH = "monarch"
    JM = "jm"


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    TRADER = "TRADER"
    VIEWER = "VIEWER"
    AUDITOR = "AUDITOR"
    RISK_OFFICER = "RISK_OFFICER"


class AuditSeverity(StrEnum):
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"
