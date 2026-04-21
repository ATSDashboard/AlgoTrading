# Theta Gainers Algo — Developer Handover

**Target:** production-ready Phase 1 in **15 working days** with 3-4 engineers.
Read this, then `docs/RUNBOOK.md`, `docs/EXTERNAL_AUDIT_PREP.md`, and `docs/GO_LIVE_CHECKLIST.md` for details.

## What's already built (do not rebuild)

- **Full monorepo scaffold** — FastAPI + React 18 + TypeScript + Tailwind + Postgres 15 + Redis 7 + Docker + GitHub Actions CI
- **13-table DB schema + 4 migrations** — users, broker_credentials, demats, strategies, orders, positions, audit_logs (hash-chained + PG triggers blocking UPDATE/DELETE), risk_state, approvals, notifications, ui_heartbeats, eod_reconciliation, instruments, strategy_legs, strategy_templates, ML tables, user_demat_access, strike_selector_presets, strike_selector_evaluations, trade_journal, premarket_checklist
- **Auth** — JWT + TOTP 2FA + IP allowlist + exponential lockout + Fernet-encrypted broker tokens
- **Broker abstraction** — `BrokerClient` ABC + `PaperBroker` (working) + `ZerodhaBroker` (v3 spec, untested live) + stubs for Axis/Monarch/JM
- **Execution OMS** — SEBI rate-limiter (Redis token bucket, 8/s user + 20/s firm), iceberg slicer (NIFTY 1800 / SENSEX 1000 freeze), peg/re-quote engine, Smart Order Router across demats, idempotency + SHA256 hash-chained order log — all unit-tested
- **Risk RMS** — pre-trade 9-check pipeline + runtime 10-check loop (SL, target, time, MTM DD, trailing SL, lock-in, dead-man switch, reconciliation every 30s, circuit breaker, VIX spike), all individually enable/disable/required-by-admin
- **Strike Selector Engine ⭐** — 16 composable filters + AllOf/AnyOf/Not combinators + preset persistence + evaluation log for future ML data + frontend rule-builder UI with live preview
- **Audit** — hash-chained immutable log + chain verification + S3 daily anchor function
- **Notifications** — 5 channels (WhatsApp via Gupshup, Telegram bot, Email via SES, SMS + Voice via Twilio) with severity→channel routing + retry + per-event templates
- **24 frontend pages** — Login, Dashboard, Analytics, Trade (manual + auto rule builder), Trade (Advanced — auto strike selection), Strategy Monitor, Reports (6 tabs), Settings (9 sub-tabs: Profile, Brokers, Risk, Execution, Defaults, Notifications, API Keys, Users, Audit, Health), Admin Console, Audit Browser, Templates, ML Lab (4 sub-tabs), Connect Broker
- **PWA shell** — manifest, service worker, offline page, installable
- **CI/CD** — GitHub Actions: lint + type-check + test + Docker build + ECR push on main
- **~50 tests** — rate limiter, slicer, router, idempotency, auth, Deep OTM engine, strike selector, risk runtime, audit hash chain

## Your 15-day job

### Days 1-3 — make it run
- [ ] Spin up AWS ap-south-1 (EC2×2 across AZs, RDS Postgres Multi-AZ, ElastiCache Redis, S3 for backups/audit anchors, Secrets Manager, SES, CloudWatch, Sentry)
- [ ] Domain + SSL: `algo.thetagainers.in` via Route53 + ACM
- [ ] Replace all frontend mocks with real React Query hooks (hooks file exists at `src/api/hooks.ts`)
- [ ] End-to-end login works: real admin seed → 2FA enrol → connect broker → land on dashboard

### Days 4-7 — brokers live
- [ ] **Zerodha Kite** — code is there; run against sandbox, then live key; verify place/modify/cancel/positions/margin
- [ ] **Axis Direct RAPID** — implement adapter (stub exists)
- [ ] Session handoff UI: daily token expiry notification + one-click reconnect

### Days 8-10 — the headline features
- [ ] Wire Strike Selector evaluate endpoint to real chain data (currently synthetic)
- [ ] Telegram bot + WhatsApp Gupshup push live for 6 events (templates at `backend/app/notify/templates.py`)
- [ ] Analytics page "Give me strike suggestions" → real chain + technical levels (helper at `backend/app/analytics/technicals.py`) + NewsAPI free-tier headlines
- [ ] Trade journal notes field + pre-market checklist gate
- [ ] Mobile responsive polish + PWA install prompt tested on iOS 17 + Android

### Days 11-14 — validation + deploy
- [ ] Load test `tests/load/concurrent_strategies.py`: 10 concurrent strategies, p99 < 300ms
- [ ] **Paper expiry #1** on live market
- [ ] Deploy to production
- [ ] **Paper expiry #2** on live market
- [ ] Bug fixes + runbook walkthrough

### Day 15 — handover
- [ ] Operator video walkthrough
- [ ] On-call rotation set up
- [ ] Go-live gated to 1-lot NIFTY for first 2 weeks

## Explicitly OUT of scope (Phase 1)

Monarch + JM adapters · External security audit (weeks 3-5) · Rolling/Adjustment workflow · Position Health Score · Strategy Playbook UI · Margin Runway stress test · Shadow Mode · Native iOS/Android apps · ML training pipeline · Historical backtester · News sentiment model · Deep OTM analytics with external data

## Phase 2 (post-launch, 6-8 weeks later)

Rolling workflow · Position Health Score · Strategy Playbook · Margin stress test · Shadow Mode · Monarch + JM adapters · Analytics on OWN trading logs (no external data — use `strike_selector_evaluations` table) · Rule-based backtester (only if used >1×/week, otherwise use Cowork ad-hoc)

## Hard rules

1. **No feature merges without tests** — CI enforces coverage ≥ 80%
2. **Broker adapters tested against sandbox before live** — no untested broker code in production
3. **Paper mode first** — every new feature ships to paper for 1 expiry before real money
4. **One-lot first** — real money starts at 1 lot NIFTY for 2 weeks
5. **SEBI algo-ID on every order** — no exceptions
6. **Audit log is append-only** — never UPDATE or DELETE (DB triggers enforce)
7. **Every exit path logged** — if it's not in `audit_logs`, it didn't happen
8. **Deploy only via CI** — no direct SSH pushes to production

## Go-live gate

- 2 paper expiries PASS (fill rate ≥ 99.5%, zero naked positions, zero recon mismatches)
- Load test p99 < 300ms
- Runbook tested by a second person
- External audit engaged for post-launch weeks 3-5

## Key files to read

- `README.md` — project overview + milestone status
- `docs/RUNBOOK.md` — daily ops + incident response
- `docs/EXTERNAL_AUDIT_PREP.md` — what auditors will want
- `docs/GO_LIVE_CHECKLIST.md` — 8-section sign-off
- `backend/app/strike_selector/filters.py` — the 16 filters you'll extend
- `backend/app/execution/order_manager.py` — the OMS heart
- `backend/app/risk/runtime.py` — the 10-check RMS loop
- `backend/tests/load/concurrent_strategies.py` — run before go-live
- `CLAUDE_CODE_BRIEF.md` — original spec (some parts now superseded; this document overrides)

## Contacts

- **Product** (Rohan) — scope questions, broker credential handover, go-live approval
- **Ops runbook owner** — to be assigned from your team
- **External audit firm** — to be engaged weeks 3-5 (suggestions in `EXTERNAL_AUDIT_PREP.md`)

---
**Document version:** 1.0 · **Supersedes:** any earlier "Phase 1/2 plans" in the repo. Build against THIS brief.
