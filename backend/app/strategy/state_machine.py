"""Strategy state machine. Illegal transitions raise InvalidStateTransition."""
from __future__ import annotations

from app.common.errors import InvalidStateTransition
from app.common.types import StrategyState as S

_ALLOWED: dict[S, set[S]] = {
    S.DRAFT:          {S.MONITORING, S.CLOSED},                   # operator cancels draft
    S.MONITORING:     {S.ENTERING, S.CLOSED, S.EMERGENCY_HALT},   # pause→back to MONITORING handled separately
    S.ENTERING:       {S.LIVE, S.EMERGENCY_HALT, S.EXITING},      # EXITING if partial-fill unrecoverable
    S.LIVE:           {S.EXITING, S.EMERGENCY_HALT},
    S.EXITING:        {S.CLOSED, S.EMERGENCY_HALT},
    S.CLOSED:         set(),
    S.EMERGENCY_HALT: {S.CLOSED},                                 # admin resolves → CLOSED
}


def transition(current: S, target: S) -> None:
    if target not in _ALLOWED.get(current, set()):
        raise InvalidStateTransition(f"{current} → {target} not allowed")


def is_terminal(s: S) -> bool:
    return s == S.CLOSED


def is_active(s: S) -> bool:
    return s in {S.MONITORING, S.ENTERING, S.LIVE, S.EXITING}
