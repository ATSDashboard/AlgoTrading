"""Hash-chained immutable audit log.

Every event is appended to `audit_logs` with:
  entry_hash = SHA256(prev_hash ∥ timestamp ∥ event_type ∥ event_data_json)

The DB trigger blocks UPDATE/DELETE (set up in migration 001). This service
only INSERTs. Daily anchor: last hash of the day is written to S3 as a
tamper-evident checkpoint.

Usage:
    await audit(db, event_type="ORDER_PLACED", data={...}, user_id=1, strategy_id=42)
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.types import AuditSeverity

log = structlog.get_logger(__name__)

# In-memory cache of the latest hash per session (reset on restart; rebuilt from DB)
_last_hash: str | None = None


async def _get_prev_hash(db: AsyncSession) -> str | None:
    """Fetch the most recent entry_hash from the audit_logs table."""
    global _last_hash
    if _last_hash is not None:
        return _last_hash
    row = await db.execute(
        text("SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    )
    result = row.scalar()
    _last_hash = result
    return result


def _compute_hash(prev_hash: str | None, ts: str, event_type: str, data_json: str) -> str:
    h = hashlib.sha256()
    if prev_hash:
        h.update(prev_hash.encode())
    h.update(ts.encode())
    h.update(event_type.encode())
    h.update(data_json.encode())
    return h.hexdigest()


async def audit(
    db: AsyncSession,
    event_type: str,
    data: dict[str, Any],
    severity: AuditSeverity = AuditSeverity.INFO,
    user_id: int | None = None,
    strategy_id: int | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> int:
    """Append one event to the immutable audit log. Returns the new row id."""
    global _last_hash
    ts = datetime.now(UTC).isoformat()
    data_json = json.dumps(data, sort_keys=True, default=str)
    prev = await _get_prev_hash(db)
    entry_hash = _compute_hash(prev, ts, event_type, data_json)

    result = await db.execute(
        text("""
            INSERT INTO audit_logs
                (occurred_at, user_id, strategy_id, event_type, event_data,
                 severity, ip_address, user_agent, prev_hash, entry_hash)
            VALUES
                (:ts, :uid, :sid, :etype, :edata::jsonb,
                 :sev, :ip, :ua, :prev, :hash)
            RETURNING id
        """),
        {
            "ts": ts, "uid": user_id, "sid": strategy_id,
            "etype": event_type, "edata": data_json,
            "sev": severity.value, "ip": ip_address, "ua": user_agent,
            "prev": prev, "hash": entry_hash,
        },
    )
    await db.commit()
    row_id = result.scalar_one()
    _last_hash = entry_hash

    log.info("audit.logged", id=row_id, event=event_type, severity=severity.value,
             strategy_id=strategy_id, user_id=user_id)
    return row_id


async def verify_chain(db: AsyncSession, limit: int = 1000) -> tuple[bool, int, str]:
    """Verify the hash chain is intact for the last `limit` entries.

    Returns (valid, checked_count, first_broken_id_or_empty).
    """
    rows = await db.execute(
        text("SELECT id, occurred_at, event_type, event_data, prev_hash, entry_hash "
             "FROM audit_logs ORDER BY id DESC LIMIT :lim"),
        {"lim": limit},
    )
    entries = list(rows.fetchall())
    entries.reverse()  # oldest first

    checked = 0
    for i, row in enumerate(entries):
        expected_prev = entries[i - 1].entry_hash if i > 0 else row.prev_hash
        if i > 0 and row.prev_hash != expected_prev:
            return False, checked, f"id={row.id}: prev_hash mismatch"

        recomputed = _compute_hash(
            row.prev_hash, row.occurred_at.isoformat() if hasattr(row.occurred_at, 'isoformat') else str(row.occurred_at),
            row.event_type,
            json.dumps(row.event_data, sort_keys=True, default=str) if isinstance(row.event_data, dict) else str(row.event_data),
        )
        if recomputed != row.entry_hash:
            return False, checked, f"id={row.id}: entry_hash tampered"
        checked += 1

    return True, checked, ""


async def daily_anchor_to_s3(db: AsyncSession) -> str | None:
    """Get today's final hash for anchoring to S3. Called by daily scheduler."""
    prev = await _get_prev_hash(db)
    if prev:
        log.info("audit.daily_anchor", hash=prev)
    return prev
