"""Idempotency primitives — client_ref_id + hash chain per strategy.

- client_ref_id: deterministic, unique, safe to retry. Format:
    nav-{strategy_id}-{leg}-{slice_idx}-{attempt}-{hash4}
  Includes attempt counter so a retried place_order can be distinguished
  from a second logical order while staying idempotent at the broker.

- order_hash: SHA256 over (prev_hash + canonical_order_content). Chained
  per strategy so audit log ordering is tamper-evident.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict

from app.brokers.base import OrderRequest


def client_ref(strategy_id: int, leg: str, slice_idx: int, attempt: int = 0) -> str:
    base = f"nav-{strategy_id}-{leg}-{slice_idx}-{attempt}"
    h = hashlib.sha1(base.encode()).hexdigest()[:4]
    return f"{base}-{h}"


def canonical_order_bytes(req: OrderRequest) -> bytes:
    """Deterministic serialization for hashing — sorted keys, no timestamps."""
    payload = {
        "client_ref_id": req.client_ref_id,
        "script_id": req.instrument.script_id,
        "action": req.action.value,
        "quantity": req.quantity,
        "order_type": req.order_type.value,
        "limit_price": str(req.limit_price),
        "demat": req.demat_account,
        "algo_tag": req.sebi_algo_tag,
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def order_hash(req: OrderRequest, prev_hash: str | None) -> str:
    h = hashlib.sha256()
    if prev_hash:
        h.update(prev_hash.encode())
    h.update(canonical_order_bytes(req))
    return h.hexdigest()
