"""Iceberg slicer — splits orders above NSE/BSE freeze qty into child orders.

NIFTY freeze qty: 1,800 units (24 lots × 75)
SENSEX freeze qty: 1,000 units (50 lots × 20)
These are env-configurable and re-fetched from security master daily.

Child orders are jittered by ICEBERG_SLICE_JITTER_MS to avoid bursting
through the SEBI 10/sec rate limit on a single signal.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.common.errors import FreezeQtyExceeded
from app.config import get_settings


@dataclass(frozen=True, slots=True)
class Slice:
    index: int
    quantity: int
    delay_ms: int


def slice_for_freeze(
    total_qty: int, freeze_qty: int, jitter_ms: int | None = None,
) -> list[Slice]:
    """Split `total_qty` into chunks <= `freeze_qty`.

    Returns slices in order; each has a cumulative `delay_ms` so the execution
    layer can just `asyncio.sleep(delay_ms/1000)` between sends.
    """
    if total_qty <= 0:
        raise FreezeQtyExceeded(f"invalid total_qty {total_qty}")
    if freeze_qty <= 0:
        raise FreezeQtyExceeded(f"invalid freeze_qty {freeze_qty}")

    settings = get_settings()
    jitter = jitter_ms if jitter_ms is not None else settings.iceberg_slice_jitter_ms

    slices: list[Slice] = []
    remaining = total_qty
    i = 0
    while remaining > 0:
        q = min(freeze_qty, remaining)
        slices.append(Slice(index=i, quantity=q, delay_ms=i * jitter))
        remaining -= q
        i += 1
    return slices
