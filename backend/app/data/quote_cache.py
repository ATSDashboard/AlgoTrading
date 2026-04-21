"""Quote cache — Redis-backed, 1s TTL. Avoids hammering broker rate limits.

Strategy engines call `get_quote(broker, instrument_id)`; the cache coalesces
concurrent reads within the TTL window. Cache key includes broker so multi-broker
strategies don't pollute each other's data.
"""
from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal

from redis.asyncio import Redis

from app.brokers.base import Instrument as BrokerInstrument
from app.brokers.base import Quote
from app.brokers.registry import get_broker
from app.common.types import BrokerName, OptionType, Underlying

_TTL_SECONDS = 1


class QuoteCache:
    """Thin coalescing cache over BrokerClient.get_quotes."""

    def __init__(self, redis: Redis) -> None:
        self._r = redis
        self._inflight: dict[str, asyncio.Task[Quote]] = {}

    @staticmethod
    def _key(broker: BrokerName, trading_symbol: str) -> str:
        return f"quote:{broker.value}:{trading_symbol}"

    async def get(self, broker: BrokerName, instrument: BrokerInstrument) -> Quote:
        key = self._key(broker, instrument.trading_symbol)
        cached = await self._r.get(key)
        if cached:
            return self._decode(cached, instrument)

        # Single-flight: if another coroutine is already fetching the same key,
        # await that task instead of firing a second broker call.
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fetch_and_store(broker, instrument, key))
            self._inflight[key] = task
        try:
            return await task
        finally:
            self._inflight.pop(key, None)

    async def get_many(
        self, broker: BrokerName, instruments: list[BrokerInstrument],
    ) -> list[Quote]:
        """Batched read: hit cache first, batch-fetch only misses."""
        keys = [self._key(broker, i.trading_symbol) for i in instruments]
        cached_vals = await self._r.mget(keys)

        missing_idx = [i for i, v in enumerate(cached_vals) if v is None]
        out: list[Quote | None] = [None] * len(instruments)

        for i, v in enumerate(cached_vals):
            if v is not None:
                out[i] = self._decode(v, instruments[i])

        if missing_idx:
            client = get_broker(broker)
            fresh = await client.get_quotes([instruments[i] for i in missing_idx])
            pipe = self._r.pipeline()
            for i, q in zip(missing_idx, fresh, strict=True):
                out[i] = q
                pipe.set(self._key(broker, instruments[i].trading_symbol),
                         self._encode(q), ex=_TTL_SECONDS)
            await pipe.execute()

        return [q for q in out if q is not None]

    async def _fetch_and_store(
        self, broker: BrokerName, instrument: BrokerInstrument, key: str,
    ) -> Quote:
        client = get_broker(broker)
        q = await client.get_quote(instrument)
        await self._r.set(key, self._encode(q), ex=_TTL_SECONDS)
        return q

    @staticmethod
    def _encode(q: Quote) -> str:
        return json.dumps({
            "script_id": q.script_id,
            "ltp": str(q.ltp), "bid": str(q.bid), "ask": str(q.ask),
            "bid_qty": q.bid_qty, "ask_qty": q.ask_qty,
            "volume": q.volume, "oi": q.oi,
            "ts": q.ts.isoformat(),
        })

    @staticmethod
    def _decode(raw: bytes | str, inst: BrokerInstrument) -> Quote:
        d = json.loads(raw)
        return Quote(
            instrument_id=0,
            script_id=d["script_id"],
            ltp=Decimal(d["ltp"]), bid=Decimal(d["bid"]), ask=Decimal(d["ask"]),
            bid_qty=d["bid_qty"], ask_qty=d["ask_qty"],
            volume=d["volume"], oi=d["oi"],
            ts=datetime.fromisoformat(d["ts"]),
        )
