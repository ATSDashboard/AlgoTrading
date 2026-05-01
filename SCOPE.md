# Theta Gainers Algo — Product Scope Document

> **Audience:** the developer building the trading platform.
> **Purpose:** complete functional + UX specification with no code references.
> **Source of truth:** this doc supersedes any prior brief if there's a conflict.
> **Last updated:** 2026-04-30
> **Owner:** Rohan Shah (`rohan@navingroup.in`)

---

## How to read this document

1. Sections **1–4** are the product overview, glossary and personas. Read once.
2. Section **5 (Trade)** is the heart of the product — read carefully.
3. Sections **6 (Dashboard)** and **7 (Reports)** are the other two priorities.
4. Sections **8–14** cover supporting features.
5. Section **15** lists every business rule and formula.
6. Section **16** is the SEBI compliance checklist — non-negotiable.
7. Section **17** is the acceptance test list.

When ASCII layouts appear, they show *relative position*, not pixel-precise design. The reference implementation (in this repo) is the visual spec — open `/trade` in the browser to see how it should feel.

---

# 1. Product overview

We sell **deep-OTM index options** (NIFTY, SENSEX) for premium decay, intraday and short-DTE. The platform must:

- Place orders into **multiple Indian brokers** from one screen (Axis Direct, Zerodha, Monarch, JM Financial; Paper for testing).
- Route orders across **multiple demat accounts** the trader has access to.
- Enforce SEBI compliance (rate cap, OTR, algo-ID tagging, freeze-qty iceberg slicing).
- Run a **Default Strategy** the trader can fire with one click — eliminates manual mistakes.
- Run a **Manual builder** for traders who want full control over strikes, lots, triggers and exits.
- Show a **live margin gauge** so the trader never overcommits capital.
- Hash-chain every state change for audit (pre-trade, fills, exits, kill events).
- Send multi-channel alerts (WhatsApp / Telegram / Email / SMS) on key events.

---

# 2. Glossary

| Term | Meaning |
|---|---|
| **Underlying** | NIFTY or SENSEX index. |
| **Spot** | Current value of the underlying (e.g. NIFTY 24,812). |
| **Strike** | The strike price of an option contract (e.g. 25,600 CE). |
| **CE / PE** | Call / Put option. |
| **Lot size** | Exchange-defined units per lot. NIFTY = 65, SENSEX = 20 (current). |
| **Strike grid** | Allowed strike interval. NIFTY = 50, SENSEX = 100. |
| **Freeze qty** | Max units per single order. NIFTY = 1,800, SENSEX = 1,000. |
| **OTM** | Out-of-the-money. CE is OTM if strike > spot. PE is OTM if strike < spot. |
| **Premium** | The price (₹) you receive for selling an option. |
| **Margin** | Capital blocked by the broker to support a short position. |
| **SOR** | Smart Order Routing — splitting orders across brokers/demats. |
| **OTR** | Order-to-Trade Ratio — SEBI watches this, penalty above ~250. |
| **Algo-ID** | A code SEBI requires every algo order to carry. |
| **Iceberg** | Splitting a single order > freeze qty into multiple sub-orders. |
| **Strangle** | Selling 1 OTM CE + 1 OTM PE simultaneously. |

---

# 3. User personas & permissions

Three trader profiles. Same login screen; UI changes based on `permissions` returned by `/admin/me/permissions`.

### 3.1 Default-only Trader (most restrictive)

- Sees: Free margin strip, Broker/Demat picker, **Default Strategy CTA only**, Cancel.
- Cannot see: Manual leg builder, custom triggers, custom exits, Save Draft, Start Monitor, Execute Now.
- Use case: junior team member; risk-controlled; one-click trader.

### 3.2 Full Trader (default for senior team)

- Sees everything in the Trade page: Default + Manual builder + all configurability.
- Can set custom triggers, exit rules, multi-broker SOR, allocations.
- Approval required if any leg has lots ≥ 5 (configurable).

### 3.3 Admin

- Same as Full Trader **plus** Settings (brokers, risk, execution, users), Admin (audit browser, user permissions).
- Can grant / revoke `default_only` flag on any user.
- Can act as second approver for ≥ 5-lot orders.
- Can access kill-switch on any running strategy.

---

# 4. Top-level navigation

Sidebar layout (left rail), persistent across all pages:

```
┌──────────────────┐
│  Theta Gainers   │
│  v1.0.0  [PAPER] │
├──────────────────┤
│ ▣ Dashboard      │  ← P&L, active strategies summary
│ ⊕ Trade          │  ← THE main page
│ ✦ Templates      │  ← saved strategy presets
│ ✦ Analytics      │  ← Deep OTM strike recommendations
│ ▦ Reports        │  ← live + paper, by strategy/demat
│ ⚙ Settings       │  ← brokers, risk, execution, users
│ 🛡 Admin (admin)  │  ← audit browser, permissions
├──────────────────┤
│ [theme toggle]   │
│ Signed in as     │
│  rohan · ADMIN   │
│ [ Logout ]       │
└──────────────────┘
```

Top bar (above content):
- Live market strip: NIFTY · SENSEX · BANKNIFTY · VIX with % change, MaxPain, FII/DII, PCR
- Auto-scrolling news ticker (NSE / SEBI / Reuters / Mint / Quantsapp)
- Header: connected broker chip (`PAPER · PAPER-001`), SEBI rate counter (`SEBI 0/8`), OTR (`OTR 2.1`)

---

# 5. Trade page (the heart of the product)

Path: `/trade` (also `/strategy/new` aliased to same page).

Vertical stack of sections, top to bottom:

```
[ Page header: "Trade" + Save as Template / Load Template ]

┌─ Free margin strip ──────────────────────────────────────────────────┐
│  Free margin: ₹6.30L (usable for new strategy)                       │
│  Total ₹10.00L · Used (active) −₹3.25L · Blocked (pending) −₹0.45L  │
│  [ ████████░░░░░░░░░░░░ 63% free ]                                   │
│  New strategies are sized only against free margin.                  │
└──────────────────────────────────────────────────────────────────────┘

┌─ Broker & Demat (global — applies to every order on this page) ─────┐
│  ☐ Multi-broker SOR    ☐ Multi-demat                                 │
│  Broker: [Zerodha (Kite Connect)  ▾]  Demat: [ZD12345 ▾]             │
│  ─────────────                                                       │
│  Margin allocation (when multi-* on):                                │
│  Deploy [   ] Cr · keep [5]% or [500000]₹ free per demat             │
│  → Pulls weighted: ZD12345 ₹2.1L, ZD67890 ₹3.9L, MN98765 ₹0.5L       │
└──────────────────────────────────────────────────────────────────────┘

┌─ Default Strategy CTA (recommended path) ───────────────────────────┐
│  🚀 Default Strategy · Deep OTM Strangle                             │
│                                                                      │
│  Spot 24,812  CE strike 25,600  PE strike 24,050  Distance ≥ 2.5% OTM│
│  Lot 65u  Margin/lot ~₹105K  Target ₹5K/Cr  Routes via ZERODHA·ZD12345│
│  Strikes round further from spot on the 50-pt grid.                  │
│                                              ┌──────────────┐        │
│                                              │ Symbol [NIFTY]│        │
│                                              │ Lots   [1]    │        │
│                                              │[Load Strategy]│        │
│                                              │[Load + Execute]│       │
│                                              └──────────────┘        │
└──────────────────────────────────────────────────────────────────────┘

(Manual builder — hidden if user is Default-only)

┌─ Strategy basics ───────────────────────────────────────────────────┐
│  Strategy Name [Short Strangle · NIFTY 17-Apr]                       │
│  Underlying: ⊙ NIFTY  ○ SENSEX                                       │
│  Portfolio:  [Default Portfolio ▾]                                   │
└──────────────────────────────────────────────────────────────────────┘

┌─ Strike Selection mode: [Manual]  [Automatic (Rule Builder)] ───────┐
│  (Manual selected)                                                   │
└──────────────────────────────────────────────────────────────────────┘

┌─ Legs (2) ─────────────────────────────────────[ + Add Leg ]────────┐
│  ∑    B/S   Expiry      Strike       Type    Lots  Order  LTP  Trade Price  Actions │
│  ─────────────────────────────────────────────────────────────────  │
│  ☑   [B|S]  17 Apr ▾   [−][25,600][+]  CE/PE   [1]  LIMIT  18.40  [18.40]    📊 ⎘ 🗑│
│  ☑   [B|S]  17 Apr ▾   [−][24,050][+]  CE/PE   [1]  LIMIT  22.85  [22.85]    📊 ⎘ 🗑│
│                                                                      │
│  [Adjust: Shift / Width / Hedge]      Multiplier [1▾]                │
│                                                                      │
│  Footer: Legs in ∑ 2/2 · Net Qty 130u · Credit ₹5,200 · iceberg n/a  [↻ Reset Prices]│
└──────────────────────────────────────────────────────────────────────┘

(Click 📊 on a leg to expand: shows Bid/Ask/Spread/OI/Volume + OHLC + intraday snapshots)

┌─ Entry Time Window ─────────────────────[ ☑ Restrict by time ]─────┐
│  Entry from [09:30]  Entry to [10:30]                                │
│  Presets: [Open] [Morn] [Mid] [Aft] [All]                            │
└──────────────────────────────────────────────────────────────────────┘

┌─ Premium Trigger ───────[ Combined ∑ ][ Per ₹1Cr ][ Per-leg ][ Enter now ]─┐
│  (Per ₹1Cr selected, for example)                                          │
│  Combined premium per ₹1Cr margin ≥ ₹ [5000]                               │
│  Live ratio: ₹4,650/Cr · Threshold ₹5,000/Cr · [Waiting]                   │
│  Formula: (Σ leg credit × 65) ÷ margin × ₹1Cr.                             │
└────────────────────────────────────────────────────────────────────────────┘

┌─ Exit Rules & Kill Switches ─────────────────────────────────────────┐
│  Stop Loss [3000]  Target [2000]  Square-off [15:15]  MTM-DD [40]%   │
│                                                                      │
│  ☐ Trailing SL  (when on: Activate after profit ₹ + Step ₹)          │
│  ☐ Lock-in profits  (when on: when profit ≥ ₹X, move SL to BE)       │
│  ☐ Exit when spot approaches strike  ← NEW                            │
│      Distance type: [Points] [%]                                     │
│      Threshold: [150] pts (or [0.5] %)                               │
│      When triggered: [Exit that leg only] [Exit both legs]           │
│                                                                      │
│  ▸ Advanced — Dead-man switch (off by default; HFT only)              │
└──────────────────────────────────────────────────────────────────────┘

┌─ Live Margin Gauge ─────────────────────────────────────────────────┐
│  This strategy will use ₹2.10L of ₹6.30L free                         │
│  [ ████░░░░░░░░░░░░░░░░ 33% of free margin ]   ₹4.20L will remain    │
│  (Red bar + warning if exceeds free margin; submit buttons disable)  │
└──────────────────────────────────────────────────────────────────────┘

┌─ Sticky action bar (bottom) ─────────────────────────────────────────┐
│  2 legs · 130u · Credit ₹5,200 · Waiting for combined trigger        │
│                                  [Cancel] [Save Draft] [Start (Monitor)]│
└──────────────────────────────────────────────────────────────────────┘
```

### 5.1 Free margin strip (top)

**REQ-T01.** Always shows: Free / Total / Used by active / Blocked by pending. Live, refreshes every 15 s.
**REQ-T02.** Bar shows used (solid) + blocked (translucent) overlay; the "free %" label sits above the bar.
**REQ-T03.** Footer note: *"New strategies are sized only against free margin. Pre-trade RMS rejects orders that exceed it."*

### 5.2 Broker & Demat (global)

**REQ-T10.** Two toggles, top-right of the section:
  - **Multi-broker SOR** (off by default)
  - **Multi-demat** (off by default; auto-enables when Multi-broker is on)

**REQ-T11.** When **both off:** single broker dropdown + single demat dropdown.

**REQ-T12.** When **multi-demat on (single broker):** demats render as a checkbox list with cap badges. SOR splits across selected demats by free margin.

**REQ-T13.** When **multi-broker on:** brokers render as expandable rows; checking a broker reveals its demats inline. Selected broker × demat combinations all participate in SOR.

**REQ-T14.** Selection routes **every** order from this page — Default, Manual, Execute Now, trigger-based starts.

**REQ-T15.** Margin allocation row appears only when multi-* is on. Single sentence shape:
  *"Deploy [X] Cr · keep [Y]% or [Z]₹ free per demat"*
  Below: live preview line listing allocated ₹ per demat.

**REQ-T16.** Cushion math: per demat, reserve = `max(balance × Y%, Z₹)`. Deployable = balance − reserve. Total cap = `min(deployable across all selected, X Cr)`. Allocation = weighted by deployable.

**REQ-T17.** Bottom note: *"This selection routes every order placed from this page."*

### 5.3 Default Strategy CTA (recommended path)

**REQ-T20.** Card with subtle accent tint (not a loud banner). Sub-title: *"Deep OTM Strangle"*.

**REQ-T21.** Left column shows 8-cell key-value grid:
  Spot · CE strike · PE strike · Distance · Lot size · Margin/lot · Target · Routes via.

**REQ-T22.** Strike rule (text + behaviour):
  - CE rounds **up** to next grid (further from spot above)
  - PE rounds **down** to next grid (further from spot below)
  - Never closer than `DEFAULT_DISTANCE_PCT` (default 2.5%).
  - Concrete example shown in HANDOFF / SCOPE: *3% = 24,535 → 24,600 CE; 21,230 → 21,200 PE.*

**REQ-T23.** Right column has 4 controls:
  1. **Symbol** dropdown: NIFTY (lot 65, grid 50) / SENSEX (lot 20, grid 100). Switching updates spot, lot, grid, margin.
  2. **Lots** dropdown: 1 / 2 / 3 / 5 / 10 / 15 / 20.
  3. Primary button: **Load Strategy** (loads pre-fill, no orders).
  4. Danger button: **Load + Execute** (loads + immediately fires Execute Now confirm).

**REQ-T24.** Both buttons open a confirm modal with full details (see §5.10).

**REQ-T25.** When user is **default-only**, this is the only action area visible on the page (manual builder hidden, sticky bar shows Cancel only).

### 5.4 Strategy basics

**REQ-T30.** Editable fields: Strategy Name (free text), Underlying (NIFTY / SENSEX radio), Portfolio (assigned per user).

### 5.5 Strike Selection mode

**REQ-T40.** Two-button toggle: **Manual** (default) or **Automatic (Rule Builder)**.

**REQ-T41.** Manual mode: legs table directly editable.

**REQ-T42.** Automatic mode reveals a rule builder above the legs table:
  - **Primary criteria** card (the focal point):
    - Distance metric: **% away** / **Points** / **Delta** (radio)
    - Same for CE & PE *or* Independent CE / PE (toggle)
    - Single big input (or two side-by-side inputs when Independent)
  - **Advanced filters** collapsible (off by default): rule tree of OI, spread, volume, IV rank, regime, time window etc. with ALL-of / ANY-of / NOT combinators. CE & PE rules can mirror or be independent.
  - **Live Preview** panel shows candidate strikes with PASS/FAIL badges, price, OI, "Use" button to load into legs.

**REQ-T43.** Auto-trade fires only when both **strike rule** AND **premium trigger** are satisfied.

### 5.6 Legs table

**REQ-T50.** Table columns (centred where relevant):
  ∑ · B/S · Expiry · Strike−+ · Type · Lots · Order · LTP · Trade Price · Actions.

**REQ-T51.** Column behaviours:
  - **∑** checkbox: include this leg in the combined-premium trigger sum.
  - **B/S**: 2-button toggle (Buy/Sell) with red SELL / green BUY tint.
  - **Expiry**: dropdown of available weeklies + monthly.
  - **Strike**: − / value / + with grid increment from underlying (50 NIFTY / 100 SENSEX).
  - **Type**: 2-button toggle CE / PE with red CE / blue PE tint.
  - **Lots**: integer dropdown 1–30.
  - **Order**: LIMIT / LIMIT+buf / MARKET (MARKET disabled with tooltip — SEBI safety).
  - **LTP**: read-only, live price.
  - **Trade Price**: editable LIMIT price; **also serves as the per-leg premium threshold** when trigger mode is "Per-leg". Disabled in Combined ∑ / Per ₹1Cr modes (tooltip explains why). Accent border in Per-leg mode.
  - **Actions**: 📊 expand · ⎘ duplicate · 🗑 remove.

**REQ-T52.** Add Leg button disabled in Combined ∑ / Per ₹1Cr modes when there are already 2 legs (lock to CE+PE strangle); tooltip explains.

**REQ-T53.** When trigger mode switches *to* Combined ∑ or Per ₹1Cr, extra legs auto-trim to 2 with a toast.

**REQ-T54.** Expanded view (click 📊) shows three sub-rows:
  1. **Live Quote**: Bid / Ask / Bid Qty / Ask Qty / Spread % / OI / Volume.
  2. **Today's Range**: Open / High / Low / Prev Close / % Chg / IV / Delta / Theta.
  3. **Intraday Snapshots (IST)**: prices at 09:20 / 09:45 / 10:30 / 11:00 / 12:00.
  4. **Per-leg threshold input** (only in Per-leg mode): bid ≥ ₹X.

**REQ-T55.** Footer summary: Legs in ∑ count / Net Qty / Credit-Debit / iceberg chip if needed / **Reset Prices** button.

### 5.7 Entry Time Window

**REQ-T60.** Toggle "Restrict by time" (default ON, value 09:30–10:30).

**REQ-T61.** From / To time inputs (24h IST).

**REQ-T62.** Quick presets: Open (09:15–09:30), Morn (09:30–10:30), Mid (11:00–13:00), Aft (13:30–14:30), All (09:15–15:15).

**REQ-T63.** When off, Premium Trigger description picks up the change: *"No time restriction — entries can fire anytime trigger conditions are met."*

### 5.8 Premium Trigger

Four modes, segmented toggle top-right:

#### 5.8.1 Combined ∑

**REQ-T70.** Threshold input: *Combined ≥ ₹X (sum of ∑-marked legs)*.

**REQ-T71.** Live displays:
  - Live sum of N legs: `₹A.BB`
  - Threshold: `₹X`
  - Status chip: **MET** (green) / **Waiting** (yellow), with pulsing icon when MET.

**REQ-T72.** Formula: `Σ(SELL leg bid) − Σ(BUY leg ask)` for ∑-marked legs.

**REQ-T73.** Locks to 2 legs (CE + PE strangle).

#### 5.8.2 Per ₹1Cr

**REQ-T80.** Threshold input: *Combined premium per ₹1Cr margin ≥ ₹X* (default 5,000).

**REQ-T81.** Live ratio displayed as `₹A,BCD / Cr`. Status chip same as Combined.

**REQ-T82.** Formula: `(Σ leg credit × lot_size) / margin_required × ₹1Cr`.

**REQ-T83.** Locks to 2 legs (same as Combined).

**REQ-T84.** This is the trader's primary discipline: yield-on-margin. Mirrors the Default Strategy's ₹5K/Cr target so manual mode can replicate.

#### 5.8.3 Per-leg

**REQ-T90.** No duplicate threshold inputs in this section. Instead, a read-only summary listing each leg's live threshold (pulled from the leg's **Trade Price** in the Legs table — single source of truth).

**REQ-T91.** Execution sub-toggle:
  - **Both legs together** (default): both CE and PE must be at threshold simultaneously to fire the strategy.
  - **Each leg independent**: each leg fires on its own when its threshold is met; the other leg can wait.

**REQ-T92.** "Examples" collapsible panel maps the trader's three concrete cases to the right combination of strike + trigger settings.

#### 5.8.4 Enter now

**REQ-T95.** Bypass trigger; place LIMIT immediately (subject to RMS + margin check).

#### Trigger / time / strike interaction

**REQ-T96.** Trigger evaluation only runs **inside the entry time window** (when restricted) AND when **strike rule passes** (auto mode). All three must agree before an order fires.

### 5.9 Exit Rules & Kill Switches

**REQ-T100.** Default-visible row (always editable):
  - Stop Loss (₹)
  - Target (₹)
  - Square-off time (IST) — defaults to 15:15
  - MTM Drawdown kill (% from peak) — default 40%

**REQ-T101.** Trailing SL toggle row:
  - When on: "Activate after profit ₹X" + "Step ₹Y".
  - Move SL up by step every X profit reached.

**REQ-T102.** Lock-in profits toggle row:
  - When on: "When profit ≥ ₹X, move SL to breakeven".

**REQ-T103.** **Exit when spot approaches strike** toggle row (NEW — defensive exit):
  - **Distance type:** Points / %
  - **Threshold:** e.g. 150 pts or 0.5 %
  - **When triggered:** *Exit that leg only* / *Exit both legs*
  - Helper text walks through example: *"Sold CE 25,600, proximity 150 pts (leg-only). If spot rises to 25,450, this leg auto-exits."*
  - Math: points → `|spot − strike| ≤ threshold`. Percent → `|spot − strike|/strike × 100 ≤ threshold`.

**REQ-T104.** Advanced collapsible: **Dead-man switch** (off by default). Helper text says *"Not recommended for Deep OTM strangle — your SL, MTM-DD kill, and square-off time already cover unattended cases without false-trigger risk from network blips or laptop sleep."*

### 5.10 Confirm modals

Every action that places orders or persists state shows a confirm modal. Each modal includes:
- Underlying, Spot
- Broker · Demat (from global selection)
- Strategy name, exact strikes, lots, units per leg
- Trigger config summary
- Estimated credit/debit, margin required, free margin
- Exit rules summary
- Two-person approval warning when lots ≥ 5

#### Modal types

**REQ-T110.** **Load Default Strategy** confirm: title *"Load Default Strategy?"* (info tone). Body lists pre-fill plan. Confirm label: *"Load configuration"*.

**REQ-T111.** **Load + Execute** confirm: title *"Default Strategy — Execute Now?"* (danger tone). Confirm requires typing **EXECUTE** to enable submit.

**REQ-T112.** **Start (Monitor)** confirm: title *"Start Strategy?"* (info tone). Body explains engine will poll quotes every 2 s and submit when trigger met.

**REQ-T113.** **Execute Now** (manual, from sticky bar) confirm: title *"Execute Now — place orders immediately?"* (danger tone). Body says *"This bypasses the trigger and places all leg orders right now at LIMIT prices. Real money."* Type **EXECUTE** to enable.

**REQ-T114.** **Save Draft** confirm: small modal, info tone, confirms name. Strategy persists in DRAFT state.

**REQ-T115.** **Cancel** confirm: warn tone, *"Discard changes?"*.

### 5.11 Sticky action bar

**REQ-T120.** Always visible at bottom of viewport.

**REQ-T121.** Left side summary: legs · units · credit/debit · trigger status text.

**REQ-T122.** Right side actions:
  - Cancel (always)
  - Save Draft (hidden in default-only mode)
  - Start (Monitor) **OR** Execute Now (depends on trigger mode; hidden in default-only)
  - Buttons disable when over-margin with tooltip showing required vs free.

### 5.12 Live margin gauge

**REQ-T130.** Sits between exit rules and sticky bar. Compares this strategy's required margin to free margin.

**REQ-T131.** Coloured progress bar:
  - Green: < 80% of free margin used.
  - Amber: 80–100%.
  - Red: > 100% (over budget). Submit disabled.

**REQ-T132.** Right-side label: "₹X.XL will remain" (positive cushion) or "OVER by ₹X.XL".

**REQ-T133.** Hidden in default-only mode (those traders use Default CTA which has its own margin display).

### 5.13 Templates / Save / Load

**REQ-T140.** Top-right of page: **Save as Template** + **Load Template…** dropdown.

**REQ-T141.** Built-in templates (provided): Short Strangle, Iron Condor, Bull Put Spread, Calendar Spread.

**REQ-T142.** Saved templates listed in `/templates` page; loadable from any time.

---

# 6. Dashboard

Path: `/`

The home page. Read-only summary; no order placement happens here.

```
┌─ Header strip ───────────────────────────────────────────────────────┐
│  Welcome back, Rohan · 30 Apr 2026 · NIFTY 24,812 (+0.32%)           │
└──────────────────────────────────────────────────────────────────────┘

┌─ KPI cards (4-up grid) ──────────────────────────────────────────────┐
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐       │
│  │ Today P&L │  │ Open      │  │ Margin    │  │ Win rate (30)│       │
│  │ +₹14,250  │  │ Strategies│  │ Free      │  │ 68% · 17/25  │       │
│  │ ▲ 1.42%   │  │ 3 active  │  │ ₹6.30L    │  │ trades       │       │
│  └───────────┘  └───────────┘  └───────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────────────┘

┌─ Active Strategies ──────────────────────────[ View All → ]─────────┐
│  ID   Name                      State     P&L     Trigger    Actions│
│  S-42 Short Strangle NIFTY      LIVE      +₹2.4K  filled     [Exit] │
│  S-43 Default · SENSEX          MONITORING n/a    waiting    [Exit] │
│  S-44 Iron Condor NIFTY         EXITING   −₹0.8K  partial    [-]    │
└──────────────────────────────────────────────────────────────────────┘

┌─ Today's P&L curve ─────────────────────────────────────────────────┐
│  [intraday line chart, 1-min ticks, with entry/exit markers]         │
│  Peak +₹18,200 · Trough +₹2,100 · MTM-DD 12% (well under kill)       │
└──────────────────────────────────────────────────────────────────────┘

┌─ Quick stats (3-up) ─────────────────────────────────────────────────┐
│  Risk usage 31%  ·  OTR 2.1  ·  SEBI orders today 18/640             │
└──────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────[ View All → ]─────────┐
│  10:32  Strategy S-43 entered MONITORING                              │
│  10:31  Trade fired: SELL 1× 25,600 CE @ ₹18.40 · ZD12345            │
│  10:30  Strategy S-43 created (Default · SENSEX)                     │
│  10:18  S-42 trailing SL moved to ₹2,500 (was ₹3,000)                │
└──────────────────────────────────────────────────────────────────────┘

┌─ Notifications inbox (last 5) ──────────────────────────────────────┐
│  [📱 ✉ 💬]  Today 10:31 — Strategy S-43 entered MONITORING            │
│  ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Dashboard requirements

**REQ-D01.** **Today P&L** card: signed ₹ value + intraday % return + trend arrow. Refreshes every 5 s.

**REQ-D02.** **Open Strategies** card: count of strategies in {DRAFT, MONITORING, LIVE, EXITING}. Click → /reports filtered to active.

**REQ-D03.** **Margin Free** card: same number as the Trade page strip. Click → /trade.

**REQ-D04.** **Win rate (30 days)** card: % of profitable closed strategies in last 30 trading days + raw counts.

**REQ-D05.** Active Strategies table:
  - Columns: ID · Name · State · P&L (signed, coloured) · Trigger status · Actions (Exit / Kill).
  - Sortable by any column. Default sort: P&L descending (winners on top).
  - Each row links to `/strategy/:id` for live monitor.
  - **Kill** action requires confirmation typing the strategy ID.

**REQ-D06.** P&L curve:
  - Line chart, intraday minute-level data.
  - Entry/exit markers on the curve.
  - Annotations: Peak, Trough, current MTM drawdown %.
  - Below the chart: today's all-strategies aggregate, not per-strategy.

**REQ-D07.** Quick stats strip:
  - **Risk usage** = used_margin / total_margin × 100.
  - **OTR** = orders / trades for today (live counter).
  - **SEBI orders today** = orders sent today / 640 (8/sec × ~80 sec/min × 80 min budget).

**REQ-D08.** Recent activity feed: chronological, top 10 events, links to source (strategy detail, audit entry).

**REQ-D09.** Notifications inbox: last 5 notifications across all channels with channel icons. Click → full inbox view.

**REQ-D10.** Auto-refresh: KPIs every 5 s; tables every 15 s; chart streams via WebSocket.

---

# 7. Reports

Path: `/reports/*`

Reporting is **algo-only** in this app (paper + live). The separate F&O reporting tool is a different product.

### 7.1 Tab structure

```
[ Trades ]  [ Strategies ]  [ By Demat ]  [ By Portfolio ]  [ Tax ]
```

### 7.2 Trades tab

```
┌─ Filters ────────────────────────────────────────────────────────────┐
│  Date: [01 Apr] – [30 Apr]   Mode: [All] [Live] [Paper]              │
│  Underlying: [All] [NIFTY] [SENSEX]                                   │
│  Strategy: [All ▾]  Demat: [All ▾]  Direction: [All] [BUY] [SELL]    │
│  [Apply]    [Reset]    [⤓ Export CSV]    [⤓ Export PDF]               │
└──────────────────────────────────────────────────────────────────────┘

┌─ Summary strip ──────────────────────────────────────────────────────┐
│  Trades 142  ·  Net P&L +₹38,400  ·  Brokerage −₹2,140  ·  Net +₹36,260│
│  Live 84  ·  Paper 58  ·  Win rate 64%  ·  Avg trade +₹270            │
└──────────────────────────────────────────────────────────────────────┘

┌─ Trades table ───────────────────────────────────────────────────────┐
│  Ts        Strat  Demat   Sym    Strike  Type Side Lots Px    P&L     Mode│
│  10:32:14  S-42   ZD12345 NIFTY  25,600  CE   S    1   18.40 +₹820   LIVE│
│  ...                                                                      │
│  (paginated, 50/page; each row links to audit entry)                     │
└──────────────────────────────────────────────────────────────────────┘
```

**REQ-R10.** Filters: date range, mode, underlying, strategy, demat, direction.

**REQ-R11.** Live + Paper **clearly distinguished** — same table, **Mode** column always visible, paper rows muted (low contrast).

**REQ-R12.** Summary strip shows: Trade count, Gross P&L, Brokerage estimate, Net P&L, Live/Paper split, Win rate, Avg trade.

**REQ-R13.** Export: CSV (raw rows) and PDF (formatted summary + table).

**REQ-R14.** Each trade row links to its audit-log entry (full hash chain visible).

### 7.3 Strategies tab

```
┌─ Strategies table ───────────────────────────────────────────────────┐
│  ID  Name           State   Open       Closed     Net P&L  Avg Hold Mode│
│  S-42 Short Strang  CLOSED  10:30      14:55      +₹2,400  4h 25m  LIVE│
│  ...                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**REQ-R20.** One row per strategy run.

**REQ-R21.** Click strategy → drill-down: leg-by-leg fills, all events on timeline, exit reason, slippage, brokerage breakdown.

**REQ-R22.** Group-by toggles: by day / by week / by underlying / by demat / by mode.

### 7.4 By Demat tab

**REQ-R30.** Aggregate P&L per demat, per broker, with charge breakdown (brokerage, STT, exchange, GST, SEBI fee, stamp).

**REQ-R31.** Visualised as horizontal bar chart of net P&L per demat for the selected period.

**REQ-R32.** Reconciliation column showing app-computed P&L vs broker-reported P&L; diff highlighted.

### 7.5 By Portfolio tab

**REQ-R40.** When portfolios are set up in Settings → Users, group strategies by portfolio.

**REQ-R41.** Same metrics as Strategies tab but rolled up.

### 7.6 Tax tab (basic)

**REQ-R50.** Computes sum of: realised gains, brokerage, STT, exchange charges, GST. **Disclaimer:** *"Indicative only — confirm with your CA. Speculative income (intraday) and STCG treatment may apply."*

### 7.7 General report rules

**REQ-R60.** All reports have a date-range filter, default = today.

**REQ-R61.** All numeric columns sortable.

**REQ-R62.** Export to CSV must use the user's filter selection — no surprises.

**REQ-R63.** No real-time refresh on /reports/* — load on filter apply.

**REQ-R64.** Hide /reports for default-only traders (admin permission).

---

# 8. Templates

Path: `/templates`

**REQ-X01.** List view of saved strategy presets with name, kind, leg count, last used date.

**REQ-X02.** Built-in presets always at top, user-saved below.

**REQ-X03.** Click → loads into Trade page with all settings pre-filled.

**REQ-X04.** Edit / Delete / Duplicate actions per saved preset.

---

# 9. Analytics (Deep OTM)

Path: `/analytics`

**REQ-Y01.** Strike recommendation board — for the chosen underlying + expiry, show top strikes per tier:
  - Tier 1: 0.05–0.10 delta (deepest OTM)
  - Tier 2: 0.10–0.15
  - Tier 3: 0.15–0.20
  - Tier 4: 0.20+

**REQ-Y02.** Per recommendation: strike, premium, OI, cushion ratio (= cushion ÷ expected move), POP estimate, score.

**REQ-Y03.** "Use" button on each recommendation loads it into the Trade page.

**REQ-Y04.** Refresh from live chain.

---

# 10. Settings

Path: `/settings/*`

### 10.1 Brokers & Demats

**REQ-S01.** List broker sessions per user. Each row: broker · last connected · session expiry · health.

**REQ-S02.** Connect / Reconnect / Disconnect actions. OAuth flow for Zerodha / Axis / Monarch / JM.

**REQ-S03.** Demat assignments per user: which demats can this user trade through.

### 10.2 Risk & Limits

**REQ-S10.** **Configurable kill switches** with three states each (Required / Optional / Disabled — admin-controlled):
  - SL kill
  - Target kill
  - Time kill (square-off)
  - MTM-DD kill
  - Trailing SL
  - Lock-in profits
  - Spot proximity exit
  - Dead-man switch
  - OTR kill
  - Reconcile failure kill
  - Circuit breaker

**REQ-S11.** Per-user position limits: max lots per strategy, max strategies open, max margin %.

**REQ-S12.** Two-person approval threshold (default ≥ 5 lots).

### 10.3 Execution (OMS)

**REQ-S20.** Iceberg config: jitter (default 100 ms), max retries, peg behaviour.

**REQ-S21.** SEBI rate cap: orders/sec/user (default 8), orders/sec/global (default 20).

**REQ-S22.** Order kind defaults: LIMIT vs LIMIT+buf (with buffer %).

### 10.4 Users

**REQ-S30.** Admin manages users: create, edit, role (Admin / Trader / Risk Officer), active status, IP allowlist.

**REQ-S31.** Per-user permissions panel:
  - `default_only` flag
  - `can_execute_now` flag
  - `can_use_multi_broker` flag
  - `max_lots_without_approval` (int)

**REQ-S32.** Demat assignments per user (which demats they can route through).

**REQ-S33.** Reset password / Reset 2FA actions (require admin).

### 10.5 Notifications

**REQ-S40.** Per-user channels: WhatsApp / Telegram / Email / SMS / Voice.

**REQ-S41.** Per-event severity routing — choose which channels fire on each event class:
  - **Critical:** all kill events, broker outage, RMS violation.
  - **Warning:** partial fills, slippage > X%, MTM-DD approaching limit.
  - **Info:** trigger met, fills, exits.

**REQ-S42.** Test-send button per channel.

### 10.6 Profile

**REQ-S50.** User can: change password, manage 2FA, view session history, manage API tokens.

---

# 11. Admin

Path: `/admin/*`

### 11.1 Audit Browser

**REQ-A01.** List audit entries with filters: date, user, event type, strategy, severity.

**REQ-A02.** Each entry shows: timestamp, user, action, before/after state diff, hash, prev_hash.

**REQ-A03.** **Verify chain** button: walks the chain and reports first break (should never break).

**REQ-A04.** Export audit log range to CSV / JSON for SEBI inspection.

### 11.2 User Permissions

**REQ-A10.** Per-user grid showing all permission flags with toggles.

**REQ-A11.** Bulk actions: grant default-only to multiple users at once.

### 11.3 EOD Reconciliation

**REQ-A20.** Daily 18:00 IST job reconciles app trades vs broker contract notes; surfaces diffs > ₹10.

### 11.4 Live Operations

**REQ-A30.** **Kill all running strategies** — emergency button, requires 2nd admin approval.

**REQ-A31.** **Halt new orders** — keeps running strategies intact, prevents new submissions.

---

# 12. Notifications & alerting

**REQ-N01.** All channel sends go through a queue with retry (3 attempts, exponential backoff 5s/30s/2m).

**REQ-N02.** Templates per event in Settings → Notifications.

**REQ-N03.** WhatsApp via Twilio Business API; Telegram via Bot API; Email via SMTP/SendGrid; SMS via MSG91; Voice via Exotel.

**REQ-N04.** Every notification creates an audit entry (`channel`, `template`, `payload_hash`, `delivered_at`, `attempts`).

---

# 13. Authentication & onboarding

### 13.1 Login

**REQ-AU01.** Username + password. TOTP 2FA optional but recommended.

**REQ-AU02.** Exponential lockout: 5 fails → 1 min lock; 10 fails → 5 min; 20 fails → admin unlock.

**REQ-AU03.** IP allowlist enforced if user has one configured (set in Settings → Users).

**REQ-AU04.** Session cookie + JWT pair. Refresh token rotation.

### 13.2 First-time onboarding

**REQ-AU10.** After login, if user has no broker session → forced onto **Connect Broker** page.

**REQ-AU11.** After broker connect → redirect to /trade.

**REQ-AU12.** TOTP setup wizard on first login if 2FA not configured.

---

# 14. Mobile / PWA

**REQ-M01.** App must be installable as a PWA with manifest + service worker.

**REQ-M02.** Mobile breakpoint shows simplified Trade page: Default Strategy CTA only by default. Manual builder collapses behind an "Advanced" tab.

**REQ-M03.** Offline fallback page: *"Trading requires a live connection. Reconnect and try again. Already-placed orders continue on the server — nothing is lost."*

**REQ-M04.** Push notifications via Web Push API for critical events (browsers that support it).

---

# 15. Business rules & formulas

Centralised so there's no drift between UI and engine.

### 15.1 Strike rounding (REQ-T22, REQ-T42)

```
Given:
  spot     — current underlying price
  pct      — distance % requested (e.g. 2.5)
  grid     — strike grid (50 NIFTY, 100 SENSEX)

Raw CE strike = spot × (1 + pct/100)
Raw PE strike = spot × (1 − pct/100)

CE strike = ceil(raw_ce / grid) × grid     # round UP (further from spot)
PE strike = floor(raw_pe / grid) × grid    # round DOWN (further from spot)
```

The chosen strike is **never closer than `pct` away** from spot. If the raw value is exactly on a grid line, it stays.

### 15.2 Lot size + units

```
Units per leg = lots × lot_size
NIFTY  lot_size = 65   (current)
SENSEX lot_size = 20   (current)
```

Lot size comes from exchange master; the figures above are seeds.

### 15.3 Iceberg slicing (REQ-Compliance)

```
freeze_qty   = 1800 (NIFTY) / 1000 (SENSEX)
slices_for_leg(units) = ceil(units / freeze_qty)
```

Slices are dispatched with **100 ms jitter** between sub-orders to avoid burst rate-limit hits.

### 15.4 Combined ∑ trigger

```
combined_live = Σ(SELL leg bid) − Σ(BUY leg ask)   # only ∑-marked legs
fires when: combined_live ≥ threshold
```

### 15.5 Per ₹1Cr trigger

```
combined_credit_rupees = Σ(SELL leg bid − BUY leg ask) × lot_size × lots   # ∑-marked
ratio_per_cr           = combined_credit_rupees / margin_required × 1_00_00_000
fires when: ratio_per_cr ≥ threshold
```

### 15.6 Per-leg trigger

```
For each leg with side=SELL:
  fires when: leg.bid >= leg.trade_price

linked   : strategy fires only when ALL eligible legs are firing simultaneously
independent: each leg fires on its own; other legs can wait
```

### 15.7 Spot-approaches-strike exit (REQ-T103)

```
For each open leg:
  gap = abs(spot − leg.strike)
  if mode == "points":   fires when gap ≤ threshold
  if mode == "percent":  fires when gap / leg.strike × 100 ≤ threshold

scope=leg  : exit just this leg
scope=both : exit both legs of the strangle
```

### 15.8 Margin allocation (REQ-T16)

```
For each selected demat d:
  cushion_d  = max(d.balance × cushion_pct/100, cushion_min)
  deployable_d = max(0, d.balance − cushion_d)

total_deployable = Σ deployable_d
cap = (budget_cr × 1_00_00_000) capped to total_deployable    # 0 = no cap

For each selected demat d:
  allocated_d = cap × deployable_d / total_deployable          # weighted
```

### 15.9 Live margin gauge (REQ-T130)

```
required = Σ legs (margin_per_lot × lots)
free     = total − used_by_active − blocked_by_orders
exceeds  = required > free
```

### 15.10 P&L

```
For each leg:
  signed = +1 if side==SELL else −1
  realised_per_unit = signed × (entry_price − exit_price)
  realised_leg = realised_per_unit × units

strategy_realised = Σ realised_leg − brokerage − STT − fees − GST − stamp
```

---

# 16. SEBI / NSE / BSE compliance — non-negotiable

**REQ-C01.** Algo-ID tag on every order. Reject submission if missing.

**REQ-C02.** Order rate cap ≤ 8/sec/user, 20/sec global. Token bucket in Redis.

**REQ-C03.** OTR monitored live. Auto-halt user's order submission at OTR ≥ 100.

**REQ-C04.** Freeze qty enforcement: NIFTY 1,800 / SENSEX 1,000. Orders > freeze auto-iceberg.

**REQ-C05.** No MARKET orders on options (regardless of underlying). UI disables, backend rejects.

**REQ-C06.** Audit log is **append-only** with hash chain. PG triggers block UPDATE/DELETE on the audit_log table. Daily anchor to S3.

**REQ-C07.** Two-person approval for orders ≥ 5 lots (configurable). The first user submits, a second admin approves; only then does the order leave the system.

**REQ-C08.** Pre-trade RMS rejects: over-margin, over-position-limit, missing algo-ID, invalid strike, expired session, IP not in allowlist.

**REQ-C09.** Daily SEBI compliance report (XML) generated at 18:00 IST, archived for 7 years.

**REQ-C10.** All broker tokens encrypted at rest with Fernet. Rotation every 90 days.

---

# 17. Acceptance test list (smoke tests)

The dev should run all of these manually before delivering. Each must pass.

### Auth
- [ ] Login succeeds with valid creds + correct TOTP.
- [ ] Login fails after 5 wrong attempts → lockout message.
- [ ] Logout clears session; revisiting requires re-login.

### Default Strategy CTA
- [ ] Pick NIFTY → CE/PE strikes auto-update to round-away values from current spot.
- [ ] Pick SENSEX → values swap to SENSEX lot/grid/spot.
- [ ] "Load Strategy" → confirm modal with full details → OK → legs section pre-filled, no orders placed.
- [ ] "Load + Execute" → confirm modal → type EXECUTE → orders submitted toast → redirect to /strategy/:id.

### Manual builder
- [ ] Add Leg button works; new leg appears in table.
- [ ] B/S, Type toggles colour the row.
- [ ] Strike +/− respects 50/100 grid by underlying.
- [ ] Lots 1–30 in dropdown.
- [ ] LTP read-only; Trade Price editable.
- [ ] Trigger mode = Combined → Add Leg disables at 2 legs; existing extra legs trim with toast.
- [ ] Trigger mode = Per-leg → Trade Price gets accent border.
- [ ] Trigger mode = Per ₹1Cr → live ratio updates; chip flips to MET when threshold crossed.

### Margin
- [ ] Free margin strip refreshes every 15 s.
- [ ] Live gauge bar turns red when required > free.
- [ ] Start / Execute disabled when over-margin; tooltip explains.

### Multi-broker / SOR
- [ ] Multi-demat toggle reveals checkbox list with cap badges.
- [ ] Multi-broker toggle reveals broker rows with embedded demats.
- [ ] Allocation row appears with single-sentence input shape.
- [ ] Allocation preview updates live as inputs change.

### Exit rules
- [ ] SL / Target / Square-off / MTM-DD always visible.
- [ ] Trailing SL toggle reveals fields.
- [ ] Lock-in profits toggle reveals field.
- [ ] **Spot proximity** toggle reveals Distance type / Threshold / Scope; helper text updates.
- [ ] Dead-man hidden under Advanced.

### Reports
- [ ] Filters apply server-side; URL updates with query params.
- [ ] Live + Paper rows distinguishable.
- [ ] Export CSV downloads filtered rows.
- [ ] Click trade row → navigates to audit entry.

### Dashboard
- [ ] KPI cards update live.
- [ ] Active strategies table sortable.
- [ ] Click a row → /strategy/:id.
- [ ] Today's curve matches sum of strategy P&Ls in /reports for today.

### Permissions
- [ ] Default-only user sees ONLY: margin strip, broker picker, Default CTA, Cancel.
- [ ] Manual builder, Save Draft, Start, Execute Now all hidden for default-only.

### Compliance
- [ ] Submit > 1,800 unit NIFTY order → backend rejects OR auto-icebergs.
- [ ] Submit MARKET order on option → rejected.
- [ ] Submit 6-lot order → 2-person approval modal blocks; 2nd admin approves → fires.

---

# 18. Build phasing (suggested)

The product is large. Suggested phasing if the dev wants to incrementalise:

### Phase A (4 weeks) — MVP single-broker live
- Auth + 2FA + IP allowlist
- Paper broker + Zerodha live broker
- Default Strategy CTA only (no manual builder)
- Free margin strip + single demat
- Combined ∑ trigger only
- Stop Loss + Target + Square-off + MTM-DD exits
- Audit log
- Basic reports (Trades + Strategies tabs)
- Dashboard with the 4 KPI cards

### Phase B (3 weeks) — Manual builder
- Manual leg table + expanded quote
- All 4 trigger modes
- Strike Selector (manual + automatic)
- Entry time window
- Trailing SL + Lock-in + Spot proximity exits
- Multi-demat (single broker)
- Confirm modals everywhere
- Reports: By Demat tab

### Phase C (3 weeks) — Multi-broker + advanced
- Axis + Monarch + JM broker adapters
- Multi-broker SOR + margin allocator
- Per-broker margin reconciliation
- Reports: By Portfolio + Tax tabs
- Notifications: all channels
- Admin: Audit Browser + EOD recon

### Phase D (2 weeks) — Polish + go-live
- PWA install
- Two-person approval flow
- Templates page
- Analytics page
- Mobile breakpoints
- Load testing
- SEBI compliance XML export
- Production deploy + monitoring

---

# 19. Visual reference

The reference UI in this repo (`frontend/`) implements all the above. To see it:

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

Use the dev login bypass (in `HANDOFF.md` §7.3) if backend is not running.

Pages to walk through:
- `/` (Dashboard)
- `/trade` (the main page — every section is visible here)
- `/strategy/:id` (live monitor when a strategy is running)
- `/reports/*` (5 tabs)
- `/templates`, `/analytics`, `/settings`, `/admin/audit`

Take screenshots of each and use them as the visual spec. The dev does not need to copy this code — they need to **match the UX**. Backend, naming, file structure, framework — all the dev's choice.

---

# 20. Open questions

Tracked in `HANDOFF.md` §11. Repeated here so the dev sees them in context:

1. Default Strategy CTA also on `/strategy/new`, or only `/trade`?
2. Multi-broker SOR — broker session goes dark mid-execution: cancel & re-route, or pause?
3. Premium trigger "Per ₹1Cr" — margin denominator: current required, or projected at fill?
4. Entry time window — apply to trigger evaluation only, or also force-exit positions outside the window?
5. Margin allocation cushion — released to "free" pool when position closes, or stay reserved for next strategy?

The dev should propose answers (with rationale) in their first design review.

---

# 21. What success looks like

When this product is live, a trader should be able to:

1. Log in, see their free margin, click **Load + Execute** on the Default Strategy CTA, type EXECUTE, and have a NIFTY strangle filled within 5 seconds — with no manual decisions about strikes, lots, or triggers.
2. Open a manual builder, set up a 4-leg iron condor, route it across 3 demats with a ₹15 Cr budget keeping ₹5L free per demat, gate entry to "combined premium ≥ ₹50/Cr margin between 09:30–10:30", and walk away — confident the system respects every rule.
3. End the day at /reports, export a CSV split by live/paper/demat, hand it to their CA, and have nothing missing.
4. Get a WhatsApp alert the moment any strategy hits MTM-DD or spot encroaches on a strike, and tap a deep link that takes them straight to the running monitor.

If the dev's build delivers all four flows above without us ever editing their code, that's success.

---

*End of scope. Questions: rohan@navingroup.in.*
