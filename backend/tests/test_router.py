"""Smart Order Router — margin-aware allocation across demats."""
from decimal import Decimal

from app.execution.router import DematCapacity, allocate


def _cap(acct: str, fm: int) -> DematCapacity:
    return DematCapacity(demat_account=acct, free_margin=Decimal(fm),
                          daily_loss_headroom=Decimal(fm))


def test_single_demat_full_allocation() -> None:
    out = allocate(100, [_cap("A", 1_000_000)], Decimal(1000))
    assert out == [type(out[0])(demat_account="A", quantity=100)]


def test_prefers_primary_when_it_covers() -> None:
    out = allocate(50, [_cap("A", 1_000_000), _cap("B", 500_000)],
                     Decimal(1000))
    # Whole order on A (highest margin, prefer_primary=True)
    assert len(out) == 1 and out[0].demat_account == "A" and out[0].quantity == 50


def test_splits_across_demats_when_primary_insufficient() -> None:
    out = allocate(150, [_cap("A", 100_000), _cap("B", 80_000)],
                     Decimal(1000))
    # A can take 100 (100k/1k), B can take 80 → 100 + 50 = 150
    assert sum(a.quantity for a in out) == 150
    assert out[0].demat_account == "A"
    assert out[0].quantity == 100
    assert out[1].demat_account == "B"
    assert out[1].quantity == 50


def test_insufficient_total_returns_partial() -> None:
    out = allocate(500, [_cap("A", 100_000), _cap("B", 50_000)],
                     Decimal(1000))
    # Can fit 100 + 50 = 150 only; caller handles the shortfall.
    assert sum(a.quantity for a in out) == 150


def test_empty_demats() -> None:
    assert allocate(100, [], Decimal(1000)) == []


def test_zero_qty() -> None:
    assert allocate(0, [_cap("A", 100_000)], Decimal(1000)) == []
