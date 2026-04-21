"""Data API: expiries, strikes, quote, manual sync (admin)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user, require_admin
from app.auth.models import User
from app.common.types import BrokerName, OptionType, Underlying
from app.data.security_master import (
    find_instrument, list_expiries, list_strikes, sync_all_brokers,
)

router = APIRouter()


@router.get("/expiries")
async def expiries(broker: BrokerName, underlying: Underlying,
                   _: User = Depends(get_current_user)) -> list[date]:
    return await list_expiries(broker, underlying)


@router.get("/strikes")
async def strikes(broker: BrokerName, underlying: Underlying, expiry: date,
                  option_type: OptionType,
                  _: User = Depends(get_current_user)) -> list[Decimal]:
    return await list_strikes(broker, underlying, expiry, option_type)


@router.get("/instrument")
async def instrument(broker: BrokerName, underlying: Underlying, expiry: date,
                     strike: Decimal, option_type: OptionType,
                     _: User = Depends(get_current_user)) -> dict:
    inst = await find_instrument(broker, underlying, expiry, strike, option_type)
    if inst is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "instrument not found")
    return {
        "id": inst.id, "script_id": inst.script_id, "trading_symbol": inst.trading_symbol,
        "exchange": inst.exchange, "lot_size": inst.lot_size,
        "freeze_qty": inst.freeze_qty, "tick_size": str(inst.tick_size),
    }


@router.post("/sync", dependencies=[Depends(require_admin)])
async def sync_now() -> dict[str, int]:
    return await sync_all_brokers()
