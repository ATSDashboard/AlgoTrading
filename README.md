# Theta Gainers Algo

Production-grade multi-broker options selling platform for NIFTY/SENSEX with enterprise RMS, OMS, and compliance.

**Phase 1 build in progress.** See `CLAUDE_CODE_BRIEF.md` for the full specification.

## Architecture at a glance

```
React 18 + Vite + TS + Tailwind + shadcn/ui  (frontend/)
        │  HTTPS + WebSocket
        ▼
FastAPI + asyncio + SQLAlchemy 2.0 + Pydantic v2  (backend/)
  ├── auth        JWT + TOTP 2FA + IP allowlist
  ├── brokers     Pluggable adapters (Paper, Axis, Zerodha*, Dhan*, Angel*)
  ├── strategy    State machine + WebSocket stream
  ├── execution   OMS: idempotency, iceberg slicing, peg/re-quote, SOR
  ├── risk        Pre-trade + runtime RMS, dead-man switch, circuit breaker
  ├── data        Security master + quote cache
  ├── audit       Hash-chained immutable log + S3 anchoring
  ├── notify      WhatsApp/Telegram/Email/SMS/Phone
  ├── health      Heartbeat + per-broker health
  └── admin       Risk console, user mgmt, EOD recon

PostgreSQL 15 (state + audit)  •  Redis 7 (cache + rate-limit bucket)

*  adapter interface ready, implementation in Phase 1.5
```

## Compliance rules hard-coded in the system

| Rule | Implementation |
|------|----------------|
| SEBI 10 orders/sec (non-institutional) | Token bucket in Redis, hard cap at **8/sec per user**, 20/sec global |
| SEBI algo-ID tagging | Every order carries `SEBI_ALGO_ID` from env; rejected if missing |
| Order-to-Trade ratio | Monitored live; auto-halt at OTR=100 (well under NSE's penalty threshold) |
| NSE freeze qty NIFTY | 1,800 units/order max → auto-iceberg slice with 100ms jitter |
| BSE freeze qty SENSEX | 1,000 units/order max → auto-iceberg slice |
| No MARKET on OTM | Backend rejects MARKET orders on options; LIMIT only |

## Dev quickstart (paper mode, local)

```bash
cp .env.example .env
docker compose up -d postgres redis
cd backend && uv sync && uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000   # terminal 1
cd ../frontend && pnpm install && pnpm dev          # terminal 2
open http://localhost:5173
```

Default admin: `admin / admin` — change on first login. 2FA setup shown after first auth.

## Directory map

```
backend/
  app/
    main.py           FastAPI entrypoint
    config.py         Pydantic Settings (env-driven)
    db.py             Async SQLAlchemy engine
    auth/             Login, TOTP, JWT, IP allowlist, broker sessions
    brokers/          Pluggable broker adapters
      base.py         Abstract BrokerClient
      paper.py        Mock broker (always available)
      axis.py         Axis Direct RAPID adapter
      registry.py     Broker registry / factory
    strategy/         Strategy CRUD + state machine + WS stream
    execution/        OMS: order placer, iceberg, peg/re-quote
    risk/             Pre-trade + runtime RMS, dead-man switch
    data/             Security master, quote cache
    audit/            Hash-chained event log
    notify/           Multi-channel alerts
    health/           Health + liveness + per-broker status
    admin/            Admin console, EOD recon, user mgmt
    common/           Shared types, errors, constants
  alembic/            Migrations
  tests/              pytest
frontend/
  src/
    pages/            Login, ConnectBroker, Dashboard, NewStrategy, Monitor, History, Settings/*, Admin/*
    components/ui/    shadcn primitives
    api/              React Query hooks
    stores/           Zustand global state (auth, broker session)
docs/
  ARCHITECTURE.md, RUNBOOK.md, API.md, COMPLIANCE.md
infra/
  nginx/              Reverse proxy + SSL
```

## Build milestones

- [x] M1 — Scaffold + config + DB schema + broker abstraction + paper broker
- [x] M2 — Auth module (login, 2FA, JWT, sessions, broker connect flow)
- [x] M3 — Data module (security master sync + Redis quote cache + Zerodha adapter)
- [ ] M3.5 — Remaining broker adapters (Axis, Monarch, JM) when API docs available
- [ ] M4 — Strategy CRUD + state machine + WebSocket stream
- [x] M5 — Execution OMS (idempotency + hash chain, iceberg dispatch, peg/re-quote, SOR, SEBI rate-limit wired)
- [x] M6 — Risk RMS (pre-trade 9-check pipeline, runtime 10-check loop, dead-man switch, circuit breaker, MTM DD, trailing SL, lock-in, reconciliation)
- [x] M7 — Audit (hash-chained append-only log, chain verification, S3 daily anchor) + Notify (WhatsApp/Telegram/Email/SMS/Voice with severity routing + retry)
- [ ] M8 — Frontend: Login, ConnectBroker, Dashboard, NewStrategy, Monitor
- [ ] M9 — Frontend: History, Settings/*, Admin/*, EOD Report
- [x] M10 — Paper trading harness + load tests + CI/CD + external audit prep + runbook + go-live checklist
```
