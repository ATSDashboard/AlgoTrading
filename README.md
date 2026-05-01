# Theta Gainers Algo

Production-grade multi-broker NIFTY/SENSEX options selling platform with enterprise RMS, OMS, and SEBI compliance.

> 👉 **Building the product?** Read [**`SCOPE.md`**](./SCOPE.md) — it's the complete product spec with no code references.
> 👉 **Reading this codebase?** Read [`HANDOFF.md`](./HANDOFF.md) — it covers architecture, audit findings, and what NOT to do.

---

## Quick links

| Doc | Audience | Purpose |
|---|---|---|
| **[SCOPE.md](./SCOPE.md)** | Developer building the product | Full functional spec, all requirements numbered (REQ-T01..) |
| **[HANDOFF.md](./HANDOFF.md)** | Engineer continuing this codebase | Architecture + audit + extension guide |
| [REVIEW_GUIDE.md](./REVIEW_GUIDE.md) | Reviewers | 30-min review checklist |
| [DEVELOPER_ASSIGNMENT.md](../DEVELOPER_ASSIGNMENT.md) | Original brief | One-page brief sent originally |
| [README.md](./README.md) | Anyone landing on the repo | This file — overview + arch diagram |

---

## What this is

Two trader workflows on one screen:

1. **Default Strategy** — one-click "sell deep-OTM strangle, ≥ 2.5% OTM, target ₹5,000 premium per ₹1Cr margin". Recommended for traders who shouldn't make manual decisions; admin can also restrict specific users to **Default-only** mode.
2. **Manual builder** — pick strikes, lots, premium trigger (4 modes: Combined ∑ / Per ₹1Cr / Per-leg / Enter now), entry time window, exit rules, and place a custom multi-leg order.

Multi-broker SOR routing + per-demat margin allocation + 3-layer pre-trade margin defense + hash-chained audit log + SEBI rate cap + freeze-qty iceberg slicer.

## Architecture at a glance

```
React 18 + Vite + TS + Tailwind + Zustand + React Query     (frontend/)
        │  HTTPS + WebSocket
        ▼
FastAPI + asyncio + SQLAlchemy 2.0 + Pydantic v2            (backend/)
  ├── auth        JWT + TOTP 2FA + IP allowlist
  ├── brokers     Paper, Zerodha (live), Axis/Monarch/JM (stubs)
  ├── strategy    State machine + WebSocket stream
  ├── execution   OMS: idempotency, iceberg, peg/re-quote, SOR
  ├── risk        Pre-trade + runtime RMS
  ├── audit       Hash-chained immutable log
  ├── notify      WhatsApp/Telegram/Email/SMS
  ├── analytics   Deep OTM strike scoring
  ├── admin       User permissions, audit browser
  └── data        Market data + security master

PostgreSQL 15 (state + audit)  •  Redis 7 (cache + rate-limit)
```

## Compliance hard-coded

| Rule | Implementation |
|---|---|
| SEBI ≤ 10 orders/sec | Token bucket in Redis, hard cap **8/sec** per user, 20/sec global |
| SEBI algo-ID tagging | Every order carries `SEBI_ALGO_ID`; rejected if missing |
| OTR monitoring | Live; auto-halt at OTR=100 (under NSE's penalty threshold) |
| NIFTY freeze 1,800 | Auto-iceberg slice with 100ms jitter |
| SENSEX freeze 1,000 | Auto-iceberg slice |
| No MARKET on options | Backend rejects MARKET; LIMIT only |
| Hash-chained audit | PG triggers block UPDATE/DELETE on `audit_log` |
| Two-person approval | Required when lots ≥ 5 |

## Dev quickstart (paper mode, local)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000          # terminal 1

# Frontend
cd ../frontend
npm install
npm run dev                                         # terminal 2

# → http://localhost:5173
```

Required env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `FERNET_KEY`,
`KITE_API_KEY`, `KITE_API_SECRET`, `APP_ENV`. See `app/config.py`.

If backend is offline you can still see the UI — see HANDOFF §7.3 for the
dev login bypass + default-only mode toggles.

## Recent work (highlights)

- ✅ NewStrategy.tsx refactored from **1443 → 708 lines** (−51%); split into
  9 focused components under `frontend/src/components/trade/`
- ✅ Trade page features: Default Strategy CTA, multi-broker SOR, per-demat
  margin allocation, 4-mode premium trigger, entry time window, default-only
  trader mode, live margin gauge, full confirm modals on every action
- ✅ Backend stubs for `/broker/*`, `/strategy/preview-margin`,
  `/strategy/{id}/execute-now`, `/admin/users/{id}/permissions`
- ✅ React Query hooks wiring frontend ↔ backend with offline fallback
- ✅ Strike rounding rule: CE↑ / PE↓ on the underlying's grid, never closer
  than the rule asks

See full file map and audit findings in [HANDOFF.md](./HANDOFF.md).

## Repos

- **App (this repo):** https://github.com/ATSDashboard/AlgoTrading
- **Backtest engine (separate):** https://github.com/ATSDashboard/ThetaBackTest

## Contact

- **Product owner:** Rohan Shah · `rohan@navingroup.in`
