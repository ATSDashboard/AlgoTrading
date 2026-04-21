"""Security master sync. Called at startup and 08:30 IST daily via APScheduler.

Uses the active BrokerClient for each enabled broker, upserts into `instruments`.
Also caches a broker-indexed lookup in Redis for hot-path reads.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.brokers.base import Instrument as BrokerInstrument
from app.brokers.registry import get_broker, list_brokers
from app.common.types import BrokerName, OptionType, Underlying
from app.data.models import Instrument
from app.db import session_scope

log = structlog.get_logger(__name__)


async def sync_all_brokers() -> dict[str, int]:
    """Sync security master from every enabled broker. Returns {broker: count}."""
    results: dict[str, int] = {}
    for broker_name in list_brokers():
        try:
            count = await _sync_one(broker_name)
            results[broker_name.value] = count
            log.info("security_master.synced", broker=broker_name.value, count=count)
        except Exception as e:
            log.error("security_master.sync_failed", broker=broker_name.value, err=str(e))
            results[broker_name.value] = -1
    return results


async def _sync_one(broker_name: BrokerName) -> int:
    client = get_broker(broker_name)
    instruments = await client.fetch_security_master()
    if not instruments:
        return 0

    rows = [
        {
            "broker": broker_name.value,
            "script_id": i.script_id,
            "exchange": i.exchange,
            "underlying": i.underlying.value,
            "expiry_date": i.expiry,
            "strike": i.strike,
            "option_type": i.option_type.value,
            "lot_size": i.lot_size,
            "tick_size": i.tick_size,
            "freeze_qty": i.freeze_qty,
            "trading_symbol": i.trading_symbol,
            "is_tradable": True,
        }
        for i in instruments
    ]

    async with session_scope() as db:
        stmt = insert(Instrument).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["broker", "script_id"],
            set_={
                "expiry_date": stmt.excluded.expiry_date,
                "strike": stmt.excluded.strike,
                "lot_size": stmt.excluded.lot_size,
                "freeze_qty": stmt.excluded.freeze_qty,
                "trading_symbol": stmt.excluded.trading_symbol,
                "is_tradable": stmt.excluded.is_tradable,
                "synced_at": Instrument.synced_at.default.arg,
            },
        )
        await db.execute(stmt)
    return len(rows)


async def find_instrument(
    broker: BrokerName, underlying: Underlying, expiry: date,
    strike: Decimal, option_type: OptionType,
) -> Instrument | None:
    """Lookup helper used by strategy creation. Cached in Redis (1d TTL) in M3+."""
    async with session_scope() as db:
        return await db.scalar(
            select(Instrument).where(
                Instrument.broker == broker.value,
                Instrument.underlying == underlying.value,
                Instrument.expiry_date == expiry,
                Instrument.strike == strike,
                Instrument.option_type == option_type.value,
                Instrument.is_tradable.is_(True),
            )
        )


async def list_expiries(broker: BrokerName, underlying: Underlying) -> list[date]:
    async with session_scope() as db:
        rows = await db.scalars(
            select(Instrument.expiry_date)
            .where(Instrument.broker == broker.value,
                   Instrument.underlying == underlying.value,
                   Instrument.is_tradable.is_(True))
            .distinct().order_by(Instrument.expiry_date)
        )
        return list(rows)


async def list_strikes(
    broker: BrokerName, underlying: Underlying, expiry: date, option_type: OptionType,
) -> list[Decimal]:
    async with session_scope() as db:
        rows = await db.scalars(
            select(Instrument.strike)
            .where(Instrument.broker == broker.value,
                   Instrument.underlying == underlying.value,
                   Instrument.expiry_date == expiry,
                   Instrument.option_type == option_type.value,
                   Instrument.is_tradable.is_(True))
            .distinct().order_by(Instrument.strike)
        )
        return list(rows)
