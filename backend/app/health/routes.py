"""Health checks — liveness, readiness, per-broker status, UI heartbeat."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.brokers.registry import get_broker, list_brokers
from app.config import get_settings
from app.db import get_db
from app.risk.heartbeat import record_heartbeat

router = APIRouter()
settings = get_settings()


@router.get("/livez")
async def livez() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/readyz")
async def readyz() -> dict[str, object]:
    results: dict[str, bool] = {}
    for name in list_brokers():
        try:
            results[name.value] = await asyncio.wait_for(get_broker(name).ping(), 2.0)
        except Exception:
            results[name.value] = False
    healthy = all(results.values())
    return {"status": "ready" if healthy else "degraded",
            "brokers": results,
            "env": settings.app_env,
            "ts": datetime.now(UTC).isoformat()}


@router.post("/heartbeat")
async def heartbeat(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Frontend calls this every 30s. Dead-man switch reads it."""
    await record_heartbeat(
        db, user.id,
        ip=request.client.host if request.client else None,
        ua=request.headers.get("user-agent"),
    )
    return {"status": "ok", "dead_man_timeout_sec": str(settings.dead_man_switch_seconds)}
