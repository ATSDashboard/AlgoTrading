"""Dead-man switch — tracks UI heartbeats and exposes check for runtime RMS.

Frontend POSTs to /health/heartbeat every 30s. If the latest heartbeat is
older than `dead_man_switch_seconds`, the runtime loop triggers square-off.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UIHeartbeat


async def record_heartbeat(
    db: AsyncSession, user_id: int, ip: str | None = None, ua: str | None = None,
) -> None:
    """Upsert the user's heartbeat row."""
    stmt = pg_insert(UIHeartbeat).values(
        user_id=user_id, last_seen_at=datetime.now(UTC), ip_address=ip, user_agent=ua,
    ).on_conflict_do_update(
        index_elements=["user_id"],
        set_={"last_seen_at": datetime.now(UTC), "ip_address": ip, "user_agent": ua},
    )
    await db.execute(stmt)
    await db.commit()


async def get_last_heartbeat(db: AsyncSession, user_id: int) -> datetime | None:
    row = await db.scalar(
        select(UIHeartbeat.last_seen_at).where(UIHeartbeat.user_id == user_id)
    )
    return row
