"""Strategy routes: CRUD + lifecycle + WebSocket stream."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.common.errors import (
    InvalidStateTransition, RiskViolation, TwoPersonApprovalRequired,
)
from app.db import get_db
from app.strategy import service
from app.strategy.engine import engine_manager, run_strategy_loop
from app.strategy.schemas import StrategyCreate, StrategyOut

router = APIRouter()


@router.post("", response_model=StrategyOut, status_code=status.HTTP_201_CREATED)
async def create(body: StrategyCreate,
                  user: User = Depends(get_current_user),
                  db: AsyncSession = Depends(get_db)) -> StrategyOut:
    try:
        s = await service.create_strategy(db, user, body)
    except RiskViolation as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return StrategyOut.model_validate(s)


@router.get("", response_model=list[StrategyOut])
async def list_mine(active_only: bool = False,
                     user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)) -> list[StrategyOut]:
    rows = await service.list_user_strategies(db, user, active_only)
    return [StrategyOut.model_validate(r) for r in rows]


@router.get("/{strategy_id}", response_model=StrategyOut)
async def detail(strategy_id: int, user: User = Depends(get_current_user),
                  db: AsyncSession = Depends(get_db)) -> StrategyOut:
    s = await service._load(db, user, strategy_id)
    return StrategyOut.model_validate(s)


@router.post("/{strategy_id}/start", response_model=StrategyOut)
async def start(strategy_id: int,
                 user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)) -> StrategyOut:
    try:
        s = await service.start_strategy(db, user, strategy_id)
    except TwoPersonApprovalRequired as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e)) from e
    except InvalidStateTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    engine_manager.start(strategy_id, run_strategy_loop)
    return StrategyOut.model_validate(s)


@router.post("/{strategy_id}/exit", response_model=StrategyOut)
async def exit_(strategy_id: int,
                 user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)) -> StrategyOut:
    try:
        s = await service.exit_strategy(db, user, strategy_id, "MANUAL_EXIT")
    except InvalidStateTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    await engine_manager.stop(strategy_id)
    return StrategyOut.model_validate(s)


@router.post("/{strategy_id}/kill", response_model=StrategyOut)
async def kill(strategy_id: int,
                user: User = Depends(get_current_user),
                db: AsyncSession = Depends(get_db)) -> StrategyOut:
    s = await service.kill_strategy(db, user, strategy_id)
    await engine_manager.stop(strategy_id)
    return StrategyOut.model_validate(s)


# ── WebSocket stream ─────────────────────────────────────────────────────────
@router.websocket("/{strategy_id}/stream")
async def stream(ws: WebSocket, strategy_id: int) -> None:
    """Live events: state changes, premium ticks, order updates, pnl, logs.

    TODO M5: authenticate WS via token query param; currently open (dev only).
    """
    await ws.accept()
    q = engine_manager.subscribe(strategy_id)
    await ws.send_json({"type": "hello", "data": {"strategy_id": strategy_id},
                         "ts": datetime.now(UTC).isoformat()})
    try:
        while True:
            event = await q.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        engine_manager.unsubscribe(strategy_id, q)
