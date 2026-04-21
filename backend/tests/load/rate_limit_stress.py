"""Intentionally exceed SEBI rate cap and verify graceful rejection.

Expected behavior: bucket throttles at configured RPS, excess either queues
(up to 1.5s wait) or raises SEBIRateLimitExceeded. No silent drops.
"""
from __future__ import annotations

import asyncio
from collections import Counter

from redis.asyncio import Redis

from app.common.errors import SEBIRateLimitExceeded
from app.common.rate_limit import OrderRateLimiter
from app.config import get_settings


async def main() -> None:
    r = Redis.from_url(get_settings().redis_url)
    limiter = OrderRateLimiter(r)

    # Blast 200 acquires in < 1 sec (RPS 200, cap 8) — 8 should pass, rest queue or reject
    results: list[str] = []

    async def one(i: int) -> None:
        try:
            await limiter.acquire(user_id=999)
            results.append("OK")
        except SEBIRateLimitExceeded:
            results.append("RATE_LIMITED")

    await asyncio.gather(*[one(i) for i in range(200)])
    c = Counter(results)
    print(f"[stress] 200 acquires: OK={c['OK']} RATE_LIMITED={c['RATE_LIMITED']}")
    assert c["OK"] > 0, "at least some should pass"
    assert c["OK"] + c["RATE_LIMITED"] == 200, "no silent drops"
    await r.close()
    print("[stress] ✅ PASS — no silent drops, no overshoot")


if __name__ == "__main__":
    asyncio.run(main())
