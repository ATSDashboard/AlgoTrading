"""SEBI order-rate limiter (token bucket in Redis).

Hard caps:
- Per-user: 8 orders/sec  (SEBI threshold is 10/sec for non-institutional)
- Global:   20 orders/sec firm-wide

Used by the OMS BEFORE calling broker.place_order. Blocks (with small queue)
when empty; rejects after queue limit to preserve latency guarantees.
"""
from __future__ import annotations

import asyncio
import time

from redis.asyncio import Redis

from app.common.errors import SEBIRateLimitExceeded
from app.config import get_settings


# Lua script: atomic token-bucket decrement.
_LUA_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])    -- tokens per second
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1]) or capacity
local ts = tonumber(data[2]) or now

local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * refill_rate)

if tokens < cost then
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
  redis.call('EXPIRE', key, 60)
  return 0
end

tokens = tokens - cost
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, 60)
return 1
"""


class OrderRateLimiter:
    """Token bucket — per-user AND global checks must both pass."""

    _MAX_QUEUE_WAIT_SEC = 1.5          # after this, reject (SEBI compliance)

    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._script = redis.register_script(_LUA_BUCKET)
        s = get_settings()
        self._per_user_rps = s.orders_per_sec_per_user
        self._global_rps = s.orders_per_sec_global

    async def acquire(self, user_id: int, cost: int = 1) -> None:
        """Block until a token is available; raise if queue wait exceeded."""
        deadline = time.monotonic() + self._MAX_QUEUE_WAIT_SEC
        while True:
            if await self._try(f"rl:user:{user_id}", self._per_user_rps, cost) \
                    and await self._try("rl:global", self._global_rps, cost):
                return
            if time.monotonic() > deadline:
                raise SEBIRateLimitExceeded(
                    f"order rate limit exceeded (user={user_id}, cost={cost})"
                )
            await asyncio.sleep(0.02)

    async def _try(self, key: str, rps: int, cost: int) -> bool:
        result = await self._script(
            keys=[key],
            args=[rps, rps, time.time(), cost],
        )
        return int(result) == 1
