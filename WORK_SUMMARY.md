# Theta Gainers Algo — Full Work Summary

> **Audience:** Rohan (product owner), team reviewers.
> **Scope:** Everything built across all sessions, current state of the repo.
> **Last updated:** 2026-05-05

---

## 1. Where to find what

| If you want… | Open this |
|---|---|
| Product spec (no code) — to share with a new developer | [`SCOPE.md`](./SCOPE.md) |
| Codebase tour + architecture + audit | [`HANDOFF.md`](./HANDOFF.md) |
| 30-minute review checklist | [`REVIEW_GUIDE.md`](./REVIEW_GUIDE.md) |
| One-page brief sent originally | [`../DEVELOPER_ASSIGNMENT.md`](../DEVELOPER_ASSIGNMENT.md) |
| Repo overview + arch diagram | [`README.md`](./README.md) |
| This file — what was built | **`WORK_SUMMARY.md`** (you're here) |

GitHub: <https://github.com/ATSDashboard/AlgoTrading>

---

## 2. What's working today

### 2.1 The Trade page (`/trade`) — primary workflow

Top-to-bottom on a single screen:

1. **Free margin strip** — live, refreshes every 15s. Total / Used by active / Blocked / Free + usage bar.
2. **Broker & Demat picker** — three modes:
   - Single broker + single demat (default)
   - Single broker + multi-demat (SOR within broker)
   - Multi-broker + multi-demat (full SOR fan-out)
3. **Margin allocation** (when multi-* is on) — single-sentence shape:
   *"Deploy [X] Cr · keep [Y]% or [Z]₹ free per demat"*. Live preview of per-demat allocation.
4. **Default Strategy CTA** — one-click "sell deep-OTM strangle ≥ 2.5% OTM, target ₹5K/Cr margin". Symbol picker (NIFTY/SENSEX), lots picker, Load + Load+Execute buttons.
5. **Strategy basics** — name, underlying (NIFTY/SENSEX).
6. **Strike Selection mode toggle** — Manual or Automatic (Rule Builder).
7. **Legs table** — `∑ · B/S · Expiry · Strike± · Type · Lots · Order · LTP · Trade Price · Actions`. Expanded view shows Bid/Ask/OI/IV/Greeks/intraday snapshots.
8. **Entry Time Window** — restrict entries to an IST window. Quick presets (Open/Morn/Mid/Aft/All).
9. **Premium Trigger** — 4 modes:
   - **Combined ∑**: sum of CE+PE bid ≥ ₹X
   - **Per ₹1Cr**: yield-on-margin ratio ≥ ₹X/Cr
   - **Per-leg**: each leg's bid ≥ its Trade Price (linked or independent firing)
   - **Enter now**: bypass trigger, place LIMIT immediately
10. **Exit Rules** — Stop Loss · Target · Square-off · MTM-DD kill · Trailing SL toggle · Lock-in profits toggle · **Spot-approaches-strike defensive exit** (points OR %, leg-only OR both-legs). Dead-man switch under Advanced.
11. **Live margin gauge** — compares this trade's required margin to free margin. Red + disables submit when over.
12. **Sticky action bar** — Cancel · Save Draft · Start (Monitor) / Execute Now.

### 2.2 The Algos page (`/algos`) — multi-step algo builder

**Tab 1: Pre-built** — Manipulation Harvest card (read-only summary of the canonical 4-phase SENSEX Thursday strategy with empirical EV from analysis 014).

**Tab 2: Custom builder** — interactive composer:
- **Schedule:** day-of-week pills + daily time window
- **Steps:** add **BUY** or **SELL** steps; each step has a name, time range, and recipe
- **Strike selection** (5 modes inside every BUY/SELL):
  - Manual list (per-leg side, strike, price, qty)
  - % away from spot (CE/PE distance arrays + uniform price)
  - Points away from spot (same shape)
  - Target premium (system picks all strikes with LTP ≤ X)
  - Strike range (CE from-to and/or PE from-to)
- **Exit spec** (TP for BUY, cover for SELL):
  - At ₹ price (absolute)
  - × entry avg (multiplier)
  - Don't auto-exit (let it expire / manual close)
- **Capital cap** per step (₹, 0 = no cap)
- **Hard rules** at algo level (max capital, VIX skip, spot emergency, no-orders-after)
- **Action bar** — Save · Replay vs last 8 weeks · Reset · Activate

Pre-loaded with the 2-step Manipulation Harvest template (BUY basket + SELL limits).

### 2.3 Supporting pages

| Path | What it does |
|---|---|
| `/` (Dashboard) | KPI cards, active strategies, P&L curve, recent activity |
| `/strategy/:id` | Live monitor for one running strategy |
| `/templates` | Saved strategy presets + built-ins |
| `/analytics` | Deep OTM strike scoring board |
| `/reports/*` | Trades · Strategies · By Demat · By Portfolio · Tax (5 tabs) |
| `/settings/*` | Brokers · Risk · Execution · Users · Notifications |
| `/admin/audit` | Hash-chain audit browser (Admin only) |
| `/connect-broker` | First-time broker session setup |

---

## 3. What changed since the initial brief

### 3.1 New product requirements you added (and where they landed)

| Requirement | Implementation |
|---|---|
| Default Strategy one-click CTA | Top of `/trade`, gated by `default_only` permission |
| Some traders see Default only (restricted mode) | `default_only` flag in user permissions; hides manual builder |
| Broker & Demat applies to whole page | Promoted to top of `/trade`, single source for all order routing |
| Multi-broker SOR + multi-demat allocation | Two toggles, allocator with budget + cushion (% or ₹ floor) |
| "Per ₹1Cr margin" premium trigger | Added as 4th mode in Premium Trigger card |
| Strike round **further from spot** (CE↑, PE↓) | Code already does it; rule made explicit in UI + concrete example |
| CE & PE can have independent strike rules | Primary criteria toggle: Same / Independent |
| Trade Price renamed + linked to per-leg trigger | One field = LIMIT price AND per-leg threshold; disabled in Combined / Per-Cr modes |
| Combined / Per-Cr modes lock to 2 legs | Add Leg disabled at 2; extras auto-trim with toast |
| Entry Time Window with presets | New section before Premium Trigger |
| Dead-man switch is overkill for Deep OTM | Moved to Advanced collapsible with explicit "not recommended" copy |
| Confirm modals with full details on every action | 5 confirms (Load Default · Load+Execute · Start · Execute Now · Save Draft · Cancel) |
| Live margin gauge per trade | New section above action bar; red + submit-disable when over |
| Exit when spot approaches strike (NEW) | New exit rule: points OR %, leg-only OR both-legs |
| Multi-step algo builder | New `/algos` page with Custom Builder |

### 3.2 Things you removed / simplified

- **MARGIN_RECYCLE** recipe — squaring off existing positions is a separate flow, not part of building an algo
- **SETTLE** recipe — dropped (BUY's TP / SELL's cover handle exits)
- **SPIKE_MONITOR & TAKE_PROFIT** as standalone recipes — folded into BUY/SELL
- Custom Algo Builder now has only **2 recipe types** (BUY, SELL) instead of 6

---

## 4. Code health (before → after)

| Metric | Before | After |
|---|---:|---:|
| `pages/NewStrategy.tsx` size | 1,443 lines | **708 lines (−51%)** |
| Trade subcomponents | 0 | **9 focused files** |
| Algos subcomponents | 0 | **3 files** |
| Empty directories | 5 | 0 |
| Superseded root docs | 2 | 0 (archived in git history) |
| TypeScript errors | clean | clean |

### Frontend file layout (`frontend/src/components/`)

```
components/
├── CommandPalette.tsx
├── ConfirmModal.tsx
├── FormModal.tsx
├── Layout.tsx
├── StrikeSelectorBuilder.tsx
├── Toast.tsx
├── algos/                          ← multi-step algo builder
│   ├── CustomAlgoBuilder.tsx       (629 lines)
│   ├── ManipulationHarvestCard.tsx (260 lines)
│   └── types.ts                    (190 lines)
└── trade/                          ← Trade page subcomponents
    ├── BrokerDematPicker.tsx       (277 lines)
    ├── DefaultStrategyCTA.tsx      (96 lines)
    ├── EntryTimeWindow.tsx         (73 lines)
    ├── ExitRules.tsx               (162 lines)
    ├── LegsTable.tsx               (330 lines)
    ├── MarginStatusStrip.tsx       (65 lines)
    ├── PremiumTrigger.tsx          (205 lines)
    ├── shared.tsx                  (14 lines)
    └── types.ts                    (18 lines)
```

### Backend modules (`backend/app/`)

```
backend/app/
├── main.py                    FastAPI entrypoint
├── config.py                  Pydantic Settings (env-driven)
├── db.py                      Async SQLAlchemy engine
├── admin/                     Phase 2 stubs — user permissions
├── analytics/                 /analytics — Deep OTM scoring
├── audit/                     Hash-chained event log
├── auth/                      Login, TOTP, JWT, IP allowlist
├── brokers/                   Pluggable adapters (paper, zerodha live, axis/monarch/jm stubs) + /broker stubs
├── common/                    Shared types, errors
├── data/                      Security master, quote cache
├── execution/                 OMS — idempotency, iceberg, peg
├── health/                    Liveness + per-broker status
├── notify/                    Multi-channel alerts
├── risk/                      Pre-trade + runtime RMS
├── strategy/                  CRUD + lifecycle + WebSocket stream + preview-margin + execute-now
└── strike_selector/           /strike-selector — engine + filters
```

### Backend endpoints (post-Phase 2)

| Endpoint | Status | Purpose |
|---|---|---|
| `GET /health/*` | ✅ live | Health checks |
| `POST /auth/login`, `POST /auth/refresh`, `POST /auth/totp` | ✅ live | Auth |
| `GET /broker/list` | ✅ stub | Connected brokers |
| `GET /broker/{broker}/demats` | ✅ stub | Demats per broker (assigned to me) |
| `GET /broker/margin/summary` | ✅ stub | Free margin strip |
| `POST /broker/margin/allocate` | ✅ stub | Per-demat allocation preview |
| `POST /strategy` | ✅ live | Create strategy |
| `GET /strategy` | ✅ live | List my strategies |
| `POST /strategy/preview-margin` | ✅ stub | Live margin gauge |
| `POST /strategy/{id}/start` | ✅ live | Start (Monitor) |
| `POST /strategy/{id}/execute-now` | ✅ stub | Execute Now bypass |
| `POST /strategy/{id}/exit`, `POST /strategy/{id}/kill` | ✅ live | Exit / Kill |
| `WS /strategy/{id}/stream` | partial | Live monitor updates |
| `POST /strike-selector/preview` | partial | Live preview against chain |
| `GET /analytics/*` | ✅ live | Deep OTM scoring + market snapshot |
| `GET /admin/me/permissions` | ✅ stub | Self-service UI gate |
| `GET/PUT /admin/users/{id}/permissions` | ✅ stub | Admin manages flags |

**Stub semantics:** route exists with correct shape + Pydantic schemas; mock data today; swap with live broker / DB later. Frontend contracts are stable.

### React Query hooks wired

`useBrokerList` · `useDemats(broker)` · `useMarginSummary` (15s refetch) · `usePreviewAllocation` · `usePreviewMargin` · `useExecuteNow` · `useMyPermissions` (drives default-only mode) — all in `frontend/src/api/hooks.ts`.

---

## 5. Commit log highlights (most recent 36 commits)

```
6fa9f23 Custom Algo Builder v3: simplify to BUY + SELL only
8cb4376 Custom Algo Builder v2: 5 strike-selection modes, exit specs, drop SETTLE
ff4c096 Build the real Custom Algo Builder — interactive multi-step composer
891ea74 Add Algos module: Manipulation Harvest hardcoded card + Custom Builder proposal
98a0b7c Add SCOPE.md — complete product spec with no code references
26e904e Add 'Exit when spot approaches strike' defensive exit rule
045f466 Add REVIEW_GUIDE.md and refresh README for team review
04b4988 Update HANDOFF: Phase 3 done, NewStrategy 1443->708 lines, all major components extracted
6ad0385 Phase 3 wiring: React Query hooks for /broker, /strategy/preview-margin, /admin/me
e32e86e Refactor batch 3: extract LegsTable (largest piece) + drop orphan helpers
1b0e31c Phase 2 backend: execute-now, preview-margin, admin permissions
59679c1 Refactor batch 2: extract PremiumTrigger + Legs grid formatting
1eccbdf Refactor batch 1: extract EntryTimeWindow, ExitRules, DefaultStrategyCTA
c08e843 Phase 2: extract BrokerDematPicker + add /broker backend stubs
45c6738 Audit pass 1: HANDOFF doc, dead-dir cleanup, first refactor (MarginStatusStrip)
684ac45 Link per-leg Trade Price to per-leg Premium Trigger; rename Price column
2053f89 Premium Trigger: add 'Per Rs 1Cr' mode (yield-on-margin trigger)
a7a5df8 Simplify margin allocation: one-line 'Deploy X · keep Y free per demat'
a6e4deb Multi-broker SOR + live margin gauge + per-demat allocation controller
04c8917 Move dead-man switch to Advanced collapsible — not useful for Deep OTM intraday
d6498af Polish pass: tighter cards, softer borders, segmented toggles, header cleanup
406cd90 Trade page UI cleanup pass: kill chip noise, table-style grids
0f340be Trade page: free-margin strip, entry time window, default-only mode, Combined ∑ locks 2 legs
03fbe85 Add detail-rich confirm modals + symbol picker in Default Strategy
9ba53d4 Make strike-rounding rule explicit in UI: snap further from spot
00599ed Foreground distance-based primary criteria + add per-leg premium independence
53bfb8b Split Strike Selector into independent CE/PE rules + decouple from Premium
6a22039 Promote Broker & Demat to global page-level scope
01e0d51 Add one-click Default Strategy CTA on Trade page
e149694 Restore Deep OTM Analytics page to main trading app
af56bb6 Add 1-page developer assignment brief
b7759f7 Move CI workflow to template path (PAT scope workaround)
c908169 Full QA pass: wire every dead button to modal/toast/navigation
c96f525 Initial Phase 1 handover — scaffold + strike selector + PWA + docs
```

---

## 6. Dead code / files removed in this cleanup

- Empty directories: `frontend/src/lib/`, `docs/screenshots/`
- Earlier sweep removed: `pages/Settings/`, `pages/Admin/`, `components/ui/` (all empty)
- Superseded docs: `CLAUDE_CODE_BRIEF.md`, `DEVELOPER_HANDOVER.md` — replaced by `SCOPE.md` + `HANDOFF.md` (git history preserved)
- `components/algos/CustomAlgoBuilderProposal.tsx` — replaced by the real interactive builder
- Orphan helpers from `NewStrategy.tsx`: `QuoteStat`, `Adjust`, `Field`, inline `KV2` — moved into the trade subcomponents that actually use them
- Unused `NumberFilter` helper from `CustomAlgoBuilder.tsx` — superseded by the new selector
- Dead branch in `NewStrategy.tsx` (commented-out leg map after the LegsTable extraction)

All deletions kept in git history if anyone ever needs to recover.

---

## 7. What's still pending (won't block a developer handoff)

### Frontend
- Extract `ConfirmModals.tsx` from `NewStrategy.tsx` (~200 lines) — easy split, low priority
- Extract `PreviewSummary.tsx` (~50 lines) — trivial
- Replace `BROKER_DEMATS` constant in `BrokerDematPicker` with `useDemats(broker).data` — one-line swap when live broker auth lands
- Add an `<ErrorBoundary>` around lazy routes

### Backend
- Persist permissions to `User.permissions JSONB` column (currently in-memory)
- SPAN+ELM live margin calculation (currently uses flat `₹105K/lot` heuristic)
- Wire `WS /strategy/{id}/stream` end to end
- `POST /strike-selector/preview` honour the primary-criteria block
- Persist algos: `POST /algos`, `GET /algos`, `POST /algos/{id}/activate`

### Open product questions (tracked in HANDOFF §11)
1. Default Strategy CTA also on `/strategy/new` or only `/trade`?
2. Multi-broker SOR — broker dark mid-execution: cancel & re-route, or pause?
3. Per ₹1Cr trigger — margin denominator: current required, or projected at fill?
4. Entry time window — gate trigger only, or also force-exit positions outside the window?
5. Margin allocation cushion — released back to "free" when position closes, or stay reserved?

---

## 8. How a new developer joins the build

1. Read **`SCOPE.md`** (25 min) — full product spec, no code.
2. Skim **`HANDOFF.md`** (10 min) — architecture + audit findings + what NOT to do.
3. Open the repo locally (`HANDOFF.md` §7 has commands) — click through `/trade`, `/algos`, `/reports`, `/admin/audit`.
4. Pick one of:
   - Continue this codebase → start with the "Where to extend things" table in HANDOFF §9.
   - Build their own backend → use SCOPE.md, reuse this UI/UX as the visual spec, swap the backend with their own implementation. The frontend's React Query hook layer is the contract — they implement matching endpoints.

Either path delivers the same product. This repo stays as the reference / fallback / merge target.

---

## 9. Numbers at a glance

- **36 commits** on `main` over the build period
- **NewStrategy.tsx:** 1,443 → 708 lines (−735, −51%)
- **9 Trade subcomponents** under `components/trade/`
- **3 Algos subcomponents** under `components/algos/`
- **18 backend endpoints** registered (live + stubs)
- **7 React Query hooks** wiring frontend ↔ backend
- **5 root docs** (SCOPE, HANDOFF, REVIEW_GUIDE, README, WORK_SUMMARY) — was 8 before cleanup
- **6 backend stubs** added for the new Trade-page contracts (`/broker/*`, `/strategy/preview-margin`, `/strategy/{id}/execute-now`, `/admin/users/*/permissions`, `/admin/me/permissions`)

---

## 10. Sign-off

The codebase is in the cleanest state it has been. Either the existing developer continues here (everything they need is in `HANDOFF.md`), or a new developer builds parallel from scratch using `SCOPE.md` as the spec and this UI as the visual reference. Both paths converge.

— Generated 2026-05-05 · Theta Gainers Algo
