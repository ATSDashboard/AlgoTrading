# Load Tests

Simulates 50 concurrent strategies hitting the OMS/RMS to verify:
- SEBI rate limiter holds firm at 8 orders/sec/user and 20/sec global
- Iceberg slicer + SOR + peg engine behave under contention
- No order leaks, no naked legs, no double-fills
- DB + Redis keep up without blocking event loop
- WebSocket fan-out handles 50 subscribers

## Run

```bash
# 1. Start backend + postgres + redis
docker compose up -d postgres redis
cd backend && uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000 &

# 2. Run load test
uv run python -m tests.load.concurrent_strategies --users 10 --strategies-per-user 5 --duration 300
```

## Scripts

- `concurrent_strategies.py` — spawn N fake users × M strategies, fire orders, watch for failures
- `tick_to_trade_latency.py` — measure signal → ack → fill latency percentiles (p50/p95/p99)
- `rate_limit_stress.py` — intentionally exceed SEBI cap, verify graceful rejection
- `failover.py` — kill primary broker mid-run, verify fallback + recovery
