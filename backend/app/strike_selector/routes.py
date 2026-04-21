"""Strike selector API — list filters, save presets, evaluate live."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.db import get_db
from app.strike_selector.filters import list_filters

router = APIRouter()


class PresetCreate(BaseModel):
    name: str
    description: str | None = None
    rule: dict
    is_favorite: bool = False


class PresetOut(BaseModel):
    id: int
    name: str
    description: str | None
    rule: dict
    is_favorite: bool
    created_at: str


@router.get("/filters")
async def get_filters(_: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    """Every filter class available — UI uses this to build the picker."""
    return list_filters()


@router.post("/presets", response_model=PresetOut)
async def create_preset(body: PresetCreate, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> dict:
    row = await db.execute(
        text("""INSERT INTO strike_selector_presets
                  (user_id, name, description, rule, is_favorite)
                VALUES (:uid, :n, :d, :r, :f)
                RETURNING id, name, description, rule, is_favorite, created_at"""),
        {"uid": user.id, "n": body.name, "d": body.description,
         "r": __import__("json").dumps(body.rule), "f": body.is_favorite},
    )
    await db.commit()
    return dict(row.first()._mapping)


@router.get("/presets", response_model=list[PresetOut])
async def list_presets(user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await db.execute(
        text("""SELECT id, name, description, rule, is_favorite, created_at
                 FROM strike_selector_presets
                 WHERE user_id=:uid ORDER BY is_favorite DESC, created_at DESC"""),
        {"uid": user.id},
    )
    return [dict(r._mapping) for r in rows]


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(
        text("DELETE FROM strike_selector_presets WHERE id=:id AND user_id=:uid"),
        {"id": preset_id, "uid": user.id},
    )
    await db.commit()
    return {"deleted": preset_id}


class EvaluateRequest(BaseModel):
    underlying: str = "NIFTY"
    expiry: str | None = None        # ISO date; default nearest
    rule: dict                        # the full rule expression
    mode: str = "PAIR"                # 'PAIR' | 'SINGLE_SIDE'
    target_side: str = "BOTH"         # 'CE' | 'PE' | 'BOTH' for SINGLE_SIDE


@router.post("/evaluate")
async def evaluate(body: EvaluateRequest,
                    _: User = Depends(get_current_user)) -> dict[str, Any]:
    """Evaluate a rule against the live option chain; return ranked candidates."""
    # Import inside to avoid circular and to use the live data service
    from app.strike_selector.service import evaluate_live
    return await evaluate_live(body.underlying, body.expiry, body.rule,
                                body.mode, body.target_side)
