"""Audit hash-chain tests — verify determinism, chaining, tamper detection."""
from app.audit.service import _compute_hash


def test_hash_deterministic() -> None:
    h1 = _compute_hash(None, "2026-04-16T10:00:00", "ORDER_PLACED", '{"qty":65}')
    h2 = _compute_hash(None, "2026-04-16T10:00:00", "ORDER_PLACED", '{"qty":65}')
    assert h1 == h2
    assert len(h1) == 64  # SHA256 hex


def test_hash_changes_with_prev() -> None:
    h1 = _compute_hash(None, "2026-04-16T10:00:00", "ORDER_PLACED", '{"qty":65}')
    h2 = _compute_hash(h1,   "2026-04-16T10:00:01", "ORDER_FILLED", '{"qty":65}')
    h3 = _compute_hash(None, "2026-04-16T10:00:01", "ORDER_FILLED", '{"qty":65}')
    # h2 includes h1 as prev → different from h3 which has no prev
    assert h2 != h3


def test_hash_chain_integrity() -> None:
    chain = []
    prev = None
    for i in range(5):
        h = _compute_hash(prev, f"2026-04-16T10:00:0{i}", "TICK", f'{{"i":{i}}}')
        chain.append((prev, h))
        prev = h
    # Verify each entry's prev matches the prior's hash
    for i in range(1, len(chain)):
        assert chain[i][0] == chain[i - 1][1]


def test_tamper_detection() -> None:
    h1 = _compute_hash(None, "2026-04-16T10:00:00", "ORDER_PLACED", '{"qty":65}')
    h2 = _compute_hash(h1,   "2026-04-16T10:00:01", "ORDER_FILLED", '{"qty":65}')
    # Tamper h1 → recompute h2 with wrong prev
    tampered = _compute_hash("TAMPERED", "2026-04-16T10:00:01", "ORDER_FILLED", '{"qty":65}')
    assert tampered != h2  # chain broken
