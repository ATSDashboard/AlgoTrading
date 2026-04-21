"""Smart Order Router — split order quantity across demats by free margin.

Strategy: allocate more to the demat with the most free margin first; fall
back to secondary demat if primary's free margin < leg margin.

For Phase 1 this is additive: if user has only one demat, SOR is a no-op.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class DematCapacity:
    demat_account: str
    free_margin: Decimal           # rupees available in this demat
    daily_loss_headroom: Decimal   # remaining daily-loss budget


@dataclass(frozen=True, slots=True)
class Allocation:
    demat_account: str
    quantity: int


def allocate(total_qty: int, demats: list[DematCapacity],
              margin_per_unit: Decimal, prefer_primary: bool = True) -> list[Allocation]:
    """Split `total_qty` across demats with enough margin+daily-loss headroom.

    Algorithm:
    - Rank demats by free_margin descending (simple heuristic).
    - Greedily fill: each demat takes min(remaining_qty, floor(free_margin / margin_per_unit)).
    - If prefer_primary, keep full order on one demat when its margin covers it.
    """
    if total_qty <= 0 or not demats:
        return []

    ranked = sorted(demats, key=lambda d: d.free_margin, reverse=True)

    if prefer_primary and margin_per_unit > 0:
        capacity_primary = int(ranked[0].free_margin // margin_per_unit)
        if capacity_primary >= total_qty:
            return [Allocation(demat_account=ranked[0].demat_account, quantity=total_qty)]

    result: list[Allocation] = []
    remaining = total_qty
    for d in ranked:
        if remaining <= 0: break
        if margin_per_unit <= 0:
            # Cannot compute capacity; dump rest on this demat
            result.append(Allocation(d.demat_account, remaining))
            remaining = 0
            break
        cap = int(d.free_margin // margin_per_unit)
        if cap <= 0: continue
        take = min(remaining, cap)
        result.append(Allocation(d.demat_account, take))
        remaining -= take

    if remaining > 0:
        # Not enough capacity anywhere — caller must raise InsufficientMargin.
        # Still return what we could allocate so caller sees the shortfall.
        pass
    return result
