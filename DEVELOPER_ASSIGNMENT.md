# Theta Gainers Algo — Developer Assignment

**Repo:** https://github.com/ATSDashboard/AlgoTrading · **Contact:** Rohan · **Timeline:** 15 working days for Phase 1

---

## Phase 1 — Production-ready trading module (15 days, 3-4 engineers)

### Already built (do NOT rebuild — just finish + wire)
- Backend: FastAPI + Postgres + Redis skeleton · auth (JWT + TOTP 2FA + lockout) · 21 DB tables · Strike Selector Engine (16 composable filters + AllOf/AnyOf/Not) · Execution OMS (SEBI rate-limit + iceberg + peg/re-quote + SOR) · Risk RMS (pre-trade + 10-check runtime loop) · hash-chained immutable audit log · 5-channel notification service · 55 unit tests
- Frontend: 24 pages · dark mode · command palette (⌘K) · form/confirm modals · toast notifications · PWA manifest + service worker + offline page · Strike Selector rule builder inside Quick Trade
- Paper broker (fully working) · Zerodha Kite adapter (coded, untested live)
- Docs: `DEVELOPER_HANDOVER.md` (detailed) · `docs/RUNBOOK.md` · `docs/EXTERNAL_AUDIT_PREP.md` · `docs/GO_LIVE_CHECKLIST.md` · `docs/CI_SETUP.md`

### Your deliverables — Phase 1
**Days 1-3 — Foundation**
- [ ] AWS ap-south-1 provisioned: 2× EC2 across AZs · RDS Multi-AZ · ElastiCache · S3 (backups + audit anchors) · Secrets Manager · SES · Sentry · CloudWatch
- [ ] Domain + SSL: `algo.thetagainers.in` via Route53 + ACM
- [ ] CI/CD activated (move `docs/ci-workflow.yml.template` → `.github/workflows/ci.yml`)
- [ ] Replace all frontend mocks with real React Query hooks · real login end-to-end (admin seed → 2FA enroll → connect broker → dashboard)

**Days 4-7 — Brokers live**
- [ ] Zerodha Kite: sandbox + live test (place, modify, cancel, positions, margin)
- [ ] Axis Direct RAPID adapter (stub exists)
- [ ] Session handoff UI (token expiry notification + one-click reconnect)

**Days 8-10 — Headline features**
- [ ] Strike Selector `/evaluate` endpoint wired to real option chain (currently synthetic)
- [ ] Telegram bot + WhatsApp (Gupshup) live for 6 events (templates exist in `backend/app/notify/templates.py`): trade entered, trade exited, SL hit, kill switch, hourly P&L, daily summary
- [ ] Analytics "Give me strike suggestions" on-demand: live chain + technical levels (helper at `backend/app/analytics/technicals.py`) + NewsAPI free-tier headlines (news injection + 1-view summary)
- [ ] Trade journal free-text notes · Pre-market checklist acknowledge-gate · Mobile PWA tested on iOS 17 + Android

**Days 11-14 — Validation + deploy**
- [ ] Load test: `backend/tests/load/concurrent_strategies.py` — 10 concurrent strategies, p99 < 300ms, zero leaked orders
- [ ] Paper expiry #1 on live market (Thursday/Tuesday)
- [ ] Deploy to production
- [ ] Paper expiry #2 · bug fixes · runbook walkthrough

**Day 15 — Handover**
- [ ] Operator video walkthrough · on-call rotation · go-live with **1-lot NIFTY only** for first 2 weeks

### OUT of Phase 1 scope (explicitly deferred)
Monarch + JM adapters · external security audit (weeks 3-5) · rolling/adjustment workflow · position health score · strategy playbook UI · margin runway stress test · shadow mode · native iOS/Android apps · ML training · backtesting · news sentiment

---

## Phase 2 — Advanced analytics + backtest (6-8 weeks, only after Phase 1 runs live for 3+ months)

1. **Backtest Engine** — standalone Parquet + DuckDB project already scaffolded in `05 - Backtest Engine (separate)/`. Builds on the Phase 1 Strike Selector rules — runs the identical rule expressions against your 1-year historical data. Phase-1 discovery script ready; confirm schema → build ingestion → analyze.
2. **Rolling / adjustment workflow** — one-click roll leg to next expiry / ±N strikes
3. **Position Health Score** (0-100 composite) · **Strategy Playbook** (per-strategy text rules shown at entry) · **Margin Runway Stress Test** (VIX+N%, NIFTY±M%)
4. **Monarch + JM broker adapters**
5. **Shadow Mode** — every LIVE strategy spawns paper twin with same rules
6. **Analytics on own trading logs** — using `strike_selector_evaluations` table (collected in Phase 1) as the future ML dataset
7. **ML training pipeline** — only after 3 months of live evaluation logs; no external data purchase needed

---

## Hard rules (both phases)
1. No feature merge without tests · CI coverage floor 80%
2. Every broker adapter tested against sandbox before live — no untested broker code in prod
3. Every new feature ships to paper for 1 expiry before real money
4. First 2 weeks live = **1 lot NIFTY only** — no multi-strategy, no SENSEX
5. SEBI algo-ID on every order · audit log never UPDATE/DELETE (DB triggers enforce) · deploy only via CI

## Go-live gate (all must hold)
☐ 2 paper expiries PASS (fill rate ≥ 99.5%, zero naked positions, zero recon mismatches)
☐ Load test p99 < 300ms
☐ Runbook tested by a 2nd person
☐ External audit engaged for post-launch weeks 3-5

## First files to read (in order)
1. `DEVELOPER_HANDOVER.md` (root) — detailed version of this brief
2. `docs/RUNBOOK.md` — daily ops + incidents
3. `docs/GO_LIVE_CHECKLIST.md` — sign-off
4. `backend/app/strike_selector/filters.py` — the filter engine you'll extend
5. `backend/app/execution/order_manager.py` — OMS heart
6. `backend/app/risk/runtime.py` — 10-check RMS loop

## Repo
```
git clone https://github.com/ATSDashboard/AlgoTrading.git
cd AlgoTrading/frontend && npm install && npm run dev   # UI on :5173
```
CI activation is the first thing you'll do (see `docs/CI_SETUP.md`).

---

**Acceptance** (sign here)
Developer: ______________________  Date: __________
Rohan:     ______________________  Date: __________
