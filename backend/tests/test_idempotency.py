"""Idempotency: same inputs → same client_ref_id; order hash chains correctly."""
from decimal import Decimal

from app.brokers.base import Instrument, OrderRequest
from app.common.types import OptionType, OrderAction, OrderType, Underlying
from app.execution.idempotency import client_ref, order_hash
from datetime import date


def _req(price: str = "42.00") -> OrderRequest:
    inst = Instrument(script_id="X1", exchange="NFO", underlying=Underlying.NIFTY,
                      expiry=date(2026, 4, 17), strike=Decimal(25000),
                      option_type=OptionType.CE, lot_size=65, tick_size=Decimal("0.05"),
                      freeze_qty=1800, trading_symbol="NIFTY26APR25000CE")
    return OrderRequest(client_ref_id="ref1", instrument=inst, action=OrderAction.SELL,
                        quantity=65, order_type=OrderType.LIMIT, limit_price=Decimal(price),
                        sebi_algo_tag="NAV-001", demat_account="D1")


def test_client_ref_deterministic() -> None:
    a = client_ref(42, "CE_MAIN", 0, 0)
    b = client_ref(42, "CE_MAIN", 0, 0)
    assert a == b
    # Different attempt → different ref
    assert client_ref(42, "CE_MAIN", 0, 1) != a


def test_client_ref_unique_per_slice() -> None:
    refs = {client_ref(42, "CE_MAIN", i, 0) for i in range(10)}
    assert len(refs) == 10


def test_order_hash_changes_on_content_change() -> None:
    h1 = order_hash(_req("42.00"), None)
    h2 = order_hash(_req("42.05"), None)
    assert h1 != h2


def test_order_hash_chain() -> None:
    h1 = order_hash(_req("42.00"), None)
    h2 = order_hash(_req("42.00"), h1)
    # Same req content, but different prev_hash → different hash
    assert h1 != h2


def test_order_hash_stable() -> None:
    # Two calls with identical inputs must produce identical hash (no timestamps leak)
    assert order_hash(_req(), None) == order_hash(_req(), None)
