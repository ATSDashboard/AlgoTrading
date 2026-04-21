"""Tests for iceberg slicer — must honor freeze qty AND keep SEBI rate limits."""
from app.common.slicer import slice_for_freeze


def test_no_slice_needed() -> None:
    s = slice_for_freeze(1000, 1800, jitter_ms=100)
    assert len(s) == 1
    assert s[0].quantity == 1000
    assert s[0].delay_ms == 0


def test_nifty_30_lots_slices() -> None:
    # 30 lots × 75 = 2250 units, NIFTY freeze = 1800
    s = slice_for_freeze(2250, 1800, jitter_ms=100)
    assert [x.quantity for x in s] == [1800, 450]
    assert [x.delay_ms for x in s] == [0, 100]


def test_sensex_large_order() -> None:
    # 80 lots × 20 = 1600, SENSEX freeze = 1000
    s = slice_for_freeze(1600, 1000, jitter_ms=150)
    assert [x.quantity for x in s] == [1000, 600]
    assert [x.delay_ms for x in s] == [0, 150]


def test_exact_multiple() -> None:
    s = slice_for_freeze(3600, 1800, jitter_ms=100)
    assert [x.quantity for x in s] == [1800, 1800]


def test_many_slices() -> None:
    s = slice_for_freeze(5400, 1800, jitter_ms=100)
    assert len(s) == 3
    assert sum(x.quantity for x in s) == 5400
    assert [x.delay_ms for x in s] == [0, 100, 200]
