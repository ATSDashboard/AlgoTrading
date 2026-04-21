# Claude Code Brief: NIFTY/SENSEX Options Trading Algo Platform

> **Purpose of this document**: This is the master technical brief for Claude Code (or any AI coding assistant) to build a production-grade options trading platform. Read this entire document before writing a single line of code. Reference this document throughout the build.

---

## 1. Executive Summary

Build a web-based algorithmic trading platform for **NIFTY and SENSEX options only**, hosted on AWS, with a Python backend and React frontend, connected to **Axis Direct RAPID API**. The platform will be operated by non-technical traders via a clean UI — no code changes needed for daily use.

**Build in three independent phases:**
- **Phase 1**: Manual strike selection + combined-premium-trigger execution engine + risk controls
- **Phase 2**: Intelligent strike selection (distance/percentage/delta-based)
- **Phase 3**: Separate information layer (OI, max pain, VIX, news, Greeks dashboard)

Phase 1 must be 100% complete, tested, and stable before starting Phase 2. Phase 3 can be built independently.

---

## 2. Critical Non-Negotiables (Read First)

These rules apply to ALL phases. Violating any of these = production failure.

### Trading Safety
1. **No MARKET orders on far OTM strikes** — bid-ask spreads can be 30–50% wide. Always use LIMIT with configurable buffer.
2. **Idempotency on every order** — every order must have a unique client-side reference ID to prevent duplicate orders on retry.
3. **State reconciliation every 30 seconds** — code must verify what positions actually exist on broker vs what code thinks exists. Mismatch = halt + alert.
4. **Hardcoded position size cap** — even if UI allows higher, backend rejects orders above an absolute lot limit (configurable in environment variables, NOT in UI).
5. **Manual kill switch** — one button in UI that closes all open positions immediately and halts the algo.
6. **Time-based hard exit** — auto square-off at user-defined time (default 3:15 PM IST) regardless of P&L.
7. **Circuit breaker** — if 3 consecutive API errors or order rejections, halt trading and alert.
8. **No silent failures** — every error must be logged AND alerted (WhatsApp/email).

### Code Quality
1. **Type hints everywhere** — Python 3.11+, full type hints, mypy strict mode passing.
2. **No magic numbers** — all thresholds, timeouts, limits in config files or environment variables.
3. **Separation of concerns** — strategy logic, execution layer, risk layer, data layer must be 4 separate modules.
4. **Async by default** — use asyncio for all I/O operations.
5. **Structured logging** — use `structlog`, every log entry must have: timestamp, module, action, status, context.
6. **80% test coverage minimum** — pytest with async support.
7. **No hardcoded credentials** — use AWS Secrets Manager or .env files (never commit secrets).

### Operational
1. **Paper trading mode** — same code, same UI, but orders go to a mock endpoint. Must run for minimum 4 live expiries before real money.
2. **Audit trail** — every action (UI click, API call, order placement, fill, error) logged to PostgreSQL with timestamp.
3. **Daily backup** — database backed up to S3 daily.
4. **Rollback ability** — Docker-based deployment, ability to roll back to previous version in <2 minutes.

---

## 3. Tech Stack

### Backend
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Async runtime**: asyncio + uvloop
- **HTTP client**: httpx (async)
- **Database**: PostgreSQL 15+
- **ORM**: SQLAlchemy 2.0+ (async)
- **Migrations**: Alembic
- **Cache**: Redis 7+
- **Task queue**: Celery (only if needed for non-time-critical tasks; avoid for trading-critical paths)
- **Logging**: structlog
- **Validation**: Pydantic v2
- **Testing**: pytest, pytest-asyncio, pytest-cov

### Frontend
- **Framework**: React 18+ with TypeScript
- **State management**: Zustand or React Query
- **UI library**: shadcn/ui or Mantine
- **Charts**: Recharts or TradingView Lightweight Charts
- **WebSocket client**: native WebSocket API or socket.io-client
- **Build tool**: Vite

### Infrastructure
- **Cloud**: AWS, region `ap-south-1` (Mumbai) for low latency to NSE
- **Compute**: EC2 (t3.medium minimum for Phase 1, scale up later)
- **Database**: RDS PostgreSQL (db.t3.small for Phase 1)
- **Cache**: ElastiCache Redis or self-hosted on EC2
- **Secrets**: AWS Secrets Manager
- **Monitoring**: CloudWatch + Sentry for errors
- **CI/CD**: GitHub Actions
- **Containerization**: Docker + docker-compose
- **Reverse proxy**: Nginx with SSL (Let's Encrypt)

### External APIs
- **Broker**: Axis Direct RAPID API (REST, free, 10 orders/sec, 200/min limit)
- **Market data**: Axis API for live option chain; supplement with NSE bhavcopy for EOD
- **Notifications**: WhatsApp (via Twilio/Gupshup) + Email (SES)

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Login → Strategy Launcher → Live Monitor → Trade History│
└─────────────────┬───────────────────────────────────────┘
                  │ HTTPS + WebSocket
┌─────────────────▼───────────────────────────────────────┐
│                  FASTAPI BACKEND                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │ Strategy │ │ Execution│ │   Risk   │  │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Data   │ │  Audit   │ │  Notify  │ │  Health  │  │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────┬────────────────┬─────────────────┬───────────────┘
      │                │                 │
┌─────▼─────┐  ┌──────▼──────┐  ┌──────▼──────────┐
│PostgreSQL │  │    Redis    │  │  Axis RAPID API │
│  (audit,  │  │  (live data │  │  (orders, data) │
│  trades)  │  │   cache)    │  │                 │
└───────────┘  └─────────────┘  └─────────────────┘
```

### Module Responsibilities

| Module | Purpose | Phase |
|--------|---------|-------|
| **Auth** | User login, session management, API key handling | 1 |
| **Strategy** | Strike selection, premium monitoring, entry signal generation | 1 (manual), 2 (auto) |
| **Execution** | Order placement, order tracking, fill management | 1 |
| **Risk** | SL monitoring, position cap enforcement, kill switch, time-based exit | 1 |
| **Data** | Live option chain polling, security master sync, Greeks calculation | 1 (basic), 2 (Greeks), 3 (full) |
| **Audit** | Log every action, every state change, every error | 1 |
| **Notify** | WhatsApp/email alerts on key events | 1 |
| **Health** | Heartbeat, API status checks, system health | 1 |

---

## 5. PHASE 1 — Detailed Specification

### 5.1 Scope

Build a manual-strike, combined-premium-trigger options selling platform. Operator inputs CE strike, PE strike, quantity, and combined premium threshold. Algo monitors live premiums and places simultaneous SELL orders on both legs when threshold is met.

### 5.2 Underlying Restrictions

- **NIFTY only** (lot size 75 — verify from security master at runtime)
- **SENSEX only** (lot size 20 — verify from security master at runtime)
- No other underlyings in Phase 1. UI must enforce this.

### 5.3 User Flow (Phase 1)

1. Operator logs in
2. Operator clicks "New Strategy"
3. Operator selects:
   - Underlying (NIFTY or SENSEX)
   - Expiry date (dropdown, auto-populated)
   - CE strike (text input or dropdown)
   - PE strike (text input or dropdown)
   - Quantity (in lots)
   - Premium trigger mode:
     - **Combined**: enter when (CE bid + PE bid) ≥ X
     - **Separate**: enter when (CE bid ≥ X) AND (PE bid ≥ Y)
   - Order type: LIMIT (with price) or LIMIT-with-buffer (e.g., 2% below LTP)
   - SL amount in ₹ (absolute)
   - Target amount in ₹ (absolute, optional)
   - Square-off time (default 3:15 PM IST)
4. Operator clicks "START"
5. Backend validates all inputs (strikes exist, lot size correct, within position cap)
6. Strategy enters MONITORING state
7. Strategy polls live data every 2 seconds
8. When trigger condition met, strategy places SELL orders on both legs simultaneously (asyncio.gather)
9. On confirmation, strategy enters LIVE state
10. Risk module starts monitoring P&L every 5 seconds
11. UI shows real-time P&L, positions, order log
12. On SL hit, target hit, or square-off time, risk module places BUY orders to close positions
13. On exit, strategy enters CLOSED state, summary shown to operator

### 5.4 Backend Specification

#### 5.4.1 Module: `auth/`
- POST `/auth/login` — username/password, returns JWT
- POST `/auth/refresh` — refresh JWT
- POST `/auth/axis/sso/initiate` — get Axis SSO URL
- POST `/auth/axis/sso/callback` — exchange ssoId for Axis token, store encrypted in DB
- Background task: refresh Axis token every 13 minutes (token expires in 15)

#### 5.4.2 Module: `strategy/`
- POST `/strategy/create` — create new strategy with all parameters
- GET `/strategy/{id}` — get strategy state
- POST `/strategy/{id}/start` — transition to MONITORING
- POST `/strategy/{id}/pause` — pause monitoring (no exit)
- POST `/strategy/{id}/exit` — manual exit (close positions)
- POST `/strategy/{id}/kill` — emergency kill switch
- WebSocket `/strategy/{id}/stream` — live updates to frontend

**State machine:**
```
DRAFT → MONITORING → ENTERING → LIVE → EXITING → CLOSED
                                  ↓
                              EMERGENCY_HALT
```

#### 5.4.3 Module: `execution/`

```python
# Pseudocode for combined premium check
async def monitor_premium(strategy_id: int):
    strategy = await get_strategy(strategy_id)
    while strategy.state == "MONITORING":
        ce_quote = await axis_client.get_quote(strategy.ce_script_id)
        pe_quote = await axis_client.get_quote(strategy.pe_script_id)
        
        ce_bid = ce_quote.bid  # For SELL, we get the bid price
        pe_bid = pe_quote.bid
        combined = ce_bid + pe_bid
        
        await audit_log("PREMIUM_CHECK", {
            "ce_bid": ce_bid, "pe_bid": pe_bid, "combined": combined,
            "threshold": strategy.combined_threshold
        })
        
        if combined >= strategy.combined_threshold:
            await enter_position(strategy)
            break
        
        await asyncio.sleep(2)

async def enter_position(strategy):
    # Place both orders simultaneously
    strategy.state = "ENTERING"
    ce_order_task = place_order(strategy.ce_script_id, "SELL", strategy.qty, ce_bid)
    pe_order_task = place_order(strategy.pe_script_id, "SELL", strategy.qty, pe_bid)
    
    ce_result, pe_result = await asyncio.gather(
        ce_order_task, pe_order_task, return_exceptions=True
    )
    
    # Handle partial failures
    if isinstance(ce_result, Exception) or isinstance(pe_result, Exception):
        await handle_partial_fill(ce_result, pe_result, strategy)
        return
    
    strategy.state = "LIVE"
    await start_risk_monitor(strategy)
```

**Critical**: Handle partial fills. If CE leg fills but PE doesn't, immediately try PE again with adjusted price. If still fails, square off CE and alert operator. NEVER leave a naked single leg unintentionally.

#### 5.4.4 Module: `risk/`

Runs as a separate asyncio task per LIVE strategy.

```python
async def risk_monitor(strategy_id: int):
    strategy = await get_strategy(strategy_id)
    while strategy.state == "LIVE":
        positions = await get_live_positions(strategy)
        current_pnl = calculate_pnl(positions)
        
        # Check 1: Hard SL
        if current_pnl <= -strategy.sl_amount:
            await exit_strategy(strategy, reason="SL_HIT")
            break
        
        # Check 2: Target
        if strategy.target_amount and current_pnl >= strategy.target_amount:
            await exit_strategy(strategy, reason="TARGET_HIT")
            break
        
        # Check 3: Time-based exit
        if datetime.now().time() >= strategy.squareoff_time:
            await exit_strategy(strategy, reason="TIME_EXIT")
            break
        
        # Check 4: Position reconciliation (every 30 sec)
        if seconds_since_last_recon > 30:
            mismatch = await reconcile_positions(strategy)
            if mismatch:
                await halt_with_alert(strategy, "POSITION_MISMATCH")
                break
        
        await asyncio.sleep(5)
```

#### 5.4.5 Module: `data/`
- Sync security master from Axis API at startup and 8:30 AM IST daily
- Cache in Redis with TTL of 1 day
- Provide `get_script_id(underlying, expiry, strike, option_type)` helper
- Live quote fetching with 1-second cache (to avoid hitting rate limits)

#### 5.4.6 Module: `audit/`

Every event logged to PostgreSQL `audit_logs` table:
```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    strategy_id INT REFERENCES strategies(id),
    user_id INT REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'INFO'
);
CREATE INDEX idx_audit_strategy_time ON audit_logs(strategy_id, timestamp DESC);
CREATE INDEX idx_audit_event_type ON audit_logs(event_type, timestamp DESC);
```

#### 5.4.7 Module: `notify/`
- WhatsApp via Gupshup or Twilio
- Email via AWS SES
- Notification triggers:
  - Strategy started
  - Position entered
  - SL hit
  - Target hit
  - Time exit
  - Any error or halt
  - Daily summary at 4 PM

### 5.5 Frontend Specification

#### 5.5.1 Pages

1. **Login Page** (`/login`)
   - Username, password
   - Remember me
   - Link to Axis SSO setup if not connected

2. **Dashboard** (`/`)
   - Active strategies count
   - Today's P&L
   - Quick "New Strategy" button
   - Recent activity feed

3. **New Strategy Page** (`/strategy/new`)
   - Form with all Phase 1 inputs (see User Flow section 5.3)
   - Real-time validation
   - Preview: "You will SELL 1 lot CE 25000 @ ₹X and 1 lot PE 24500 @ ₹Y when combined ≥ ₹Z"
   - START button (disabled until all valid)

4. **Live Monitor Page** (`/strategy/{id}`)
   - Big P&L display (color-coded: green positive, red negative)
   - Position table:
     | Strike | Type | Qty | Entry Price | Current Price | P&L |
   - Order log (time, action, status)
   - Premium chart (CE, PE, combined over time)
   - Action buttons: PAUSE, EXIT, KILL SWITCH (with confirmation)
   - WebSocket-driven updates (no polling)

5. **History Page** (`/history`)
   - Date filter
   - Table of past strategies with summary
   - Click to drill down into individual strategy

6. **Settings Page** (`/settings`)
   - Axis API connection status
   - Notification preferences (WhatsApp number, email)
   - Position size cap (read-only, set in env)

#### 5.5.2 Critical UX Requirements

- **No surprise actions** — every destructive action (EXIT, KILL) requires confirmation modal
- **Mobile responsive** — operator might monitor from phone
- **Color coding** — green = good, red = bad, yellow = warning, gray = neutral
- **Loading states** — every async action shows loading indicator
- **Error toasts** — never silent errors
- **Disable inputs during ENTERING/EXITING** states to prevent race conditions

### 5.6 Database Schema (Phase 1)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    whatsapp_number VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE axis_credentials (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    sub_account_id VARCHAR(100),
    auth_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategies (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    underlying VARCHAR(20) NOT NULL CHECK (underlying IN ('NIFTY', 'SENSEX')),
    expiry_date DATE NOT NULL,
    ce_strike DECIMAL(10,2) NOT NULL,
    pe_strike DECIMAL(10,2) NOT NULL,
    ce_script_id VARCHAR(50) NOT NULL,
    pe_script_id VARCHAR(50) NOT NULL,
    quantity_lots INT NOT NULL,
    trigger_mode VARCHAR(20) CHECK (trigger_mode IN ('COMBINED', 'SEPARATE')),
    combined_threshold DECIMAL(10,2),
    ce_threshold DECIMAL(10,2),
    pe_threshold DECIMAL(10,2),
    order_type VARCHAR(20) DEFAULT 'LIMIT',
    limit_buffer_pct DECIMAL(5,2) DEFAULT 2.0,
    sl_amount DECIMAL(12,2) NOT NULL,
    target_amount DECIMAL(12,2),
    squareoff_time TIME NOT NULL DEFAULT '15:15:00',
    state VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    final_pnl DECIMAL(12,2)
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    strategy_id INT REFERENCES strategies(id),
    leg VARCHAR(2) CHECK (leg IN ('CE', 'PE')),
    action VARCHAR(10) CHECK (action IN ('SELL', 'BUY')),
    script_id VARCHAR(50),
    quantity INT,
    order_type VARCHAR(20),
    price DECIMAL(10,2),
    client_ref_id VARCHAR(100) UNIQUE NOT NULL, -- idempotency key
    broker_order_id VARCHAR(100),
    status VARCHAR(30),
    filled_qty INT DEFAULT 0,
    avg_fill_price DECIMAL(10,2),
    placed_at TIMESTAMPTZ DEFAULT NOW(),
    filled_at TIMESTAMPTZ,
    error_message TEXT
);

-- audit_logs already defined above
```

### 5.7 Configuration (Environment Variables)

```bash
# App
APP_ENV=production  # or 'paper' for paper trading
LOG_LEVEL=INFO

# Axis API
AXIS_CLIENT_ID=xxx
AXIS_AUTHORIZATION_KEY=xxx
AXIS_API_BASE_URL=https://api.axisdirect.in

# Database
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...

# Risk caps (HARDCODED — cannot be overridden via UI)
MAX_LOTS_PER_STRATEGY=10
MAX_ACTIVE_STRATEGIES=5
MAX_DAILY_LOSS=100000  # in ₹
CIRCUIT_BREAKER_ERROR_THRESHOLD=3

# Notifications
GUPSHUP_API_KEY=xxx
GUPSHUP_SOURCE_NUMBER=xxx
AWS_SES_REGION=ap-south-1

# Security
JWT_SECRET=xxx
JWT_EXPIRY_HOURS=8
```

### 5.8 Testing Plan

#### Unit tests (mandatory)
- Premium calculation logic
- State machine transitions
- Strike validation
- Risk threshold checks
- Idempotency key generation

#### Integration tests
- Full strategy lifecycle with mocked Axis API
- Partial fill handling
- Token refresh
- Circuit breaker activation

#### Paper trading validation (before going live)
- Run on minimum 4 live expiries
- Monitor: order placement success rate, premium check accuracy, risk trigger speed
- Compare paper P&L vs theoretical P&L
- Document any discrepancies

#### Load testing
- Simulate 50 strategies running concurrently
- Verify no rate limit breaches
- Verify DB and Redis can handle load

### 5.9 Deployment Steps

1. Set up AWS infrastructure (EC2, RDS, ElastiCache, SES)
2. Configure GitHub Actions for CI/CD
3. Set up Docker images (backend, frontend, nginx)
4. Set up secrets in AWS Secrets Manager
5. Run Alembic migrations
6. Deploy paper environment first
7. Run paper trading for 4 expiries
8. Deploy production environment
9. Start with 1 lot strategies for first 2 weeks
10. Scale up gradually based on observed reliability

### 5.10 Phase 1 Acceptance Criteria

- [ ] Operator can create, start, monitor, and close a strategy via UI in <2 minutes
- [ ] Combined premium trigger fires within 3 seconds of threshold breach
- [ ] Order placement success rate ≥ 99.5% in paper mode over 4 expiries
- [ ] Zero unintended naked positions in 40 hours of testing
- [ ] All risk triggers (SL, target, time, kill switch) execute within 1 second of breach
- [ ] WhatsApp + email notifications received for all key events
- [ ] Full audit trail queryable from DB
- [ ] Mobile-responsive UI works on operator's phone
- [ ] Documentation: operator manual + deployment runbook complete

---

## 6. PHASE 2 — Detailed Specification

### 6.1 Scope

Add intelligent strike selection alongside the manual mode from Phase 1. Operator can choose to manually pick strikes (Phase 1 behavior) OR let the algo pick strikes based on rules.

### 6.2 New Strike Selection Methods

#### 6.2.1 Distance from Spot — Absolute Points
- Operator inputs: distance in points (e.g., 300)
- Algo: spot price ± 300 points, snap to nearest valid strike
- NIFTY strikes are 50-point intervals; SENSEX are 100-point intervals (verify from security master)

#### 6.2.2 Distance from Spot — Percentage
- Operator inputs: distance as % (e.g., 2%)
- Algo: spot × (1 ± 0.02), snap to nearest valid strike

#### 6.2.3 Delta-Based
- Operator inputs: target delta (e.g., 0.10 for CE, will use -0.10 for PE)
- Algo: calculate delta for each strike using Black-Scholes, pick strike closest to target delta
- Requires implied volatility input — fetch from option chain (use ATM IV if specific not available)

#### 6.2.4 Optional Filters (Apply to All Methods)
- Minimum OI (default 10,000)
- Maximum bid-ask spread (default 5% of LTP)
- Minimum premium (default ₹1)

### 6.3 Combined Logic

After strike selection, the existing Phase 1 combined premium check still applies:
1. Algo selects strikes based on chosen method
2. Algo waits for combined premium to meet threshold
3. Algo places orders

Operator can also choose: "Enter immediately at market" vs "Wait for combined premium ≥ X"

### 6.4 Backtesting Module

- Run strategy logic against historical data
- Show: hypothetical entries, exits, P&L for past 5/10/20 expiries
- UI: results table + equity curve chart
- Data source: NSE bhavcopy + option chain history (subscribe to a data vendor like GDFL or use free historical data scrapers)

### 6.5 Backend Additions

- `greeks/` module: Black-Scholes implementation for Delta, Gamma, Theta, Vega, IV
- `strike_selector/` module: pluggable strategy pattern for each selection method
- `backtest/` module: replay engine using historical option chain snapshots

### 6.6 Frontend Additions

- New section in strategy creator: "Strike Selection Mode"
  - Radio: Manual / Distance Points / Distance % / Delta
  - Conditional inputs based on selection
- Backtest tab: select strategy template, date range, run backtest, see results
- Pre-trade preview: "Algo will select CE 25100, PE 24500 based on current spot 24800 + 1.2% distance"

### 6.7 Phase 2 Acceptance Criteria

- [ ] All 3 strike selection methods work and produce valid strikes
- [ ] Strike snapping works correctly for both NIFTY (50-point) and SENSEX (100-point)
- [ ] Greeks calculation accurate within 1% of broker's displayed Greeks
- [ ] Liquidity filters skip illiquid strikes
- [ ] Backtest runs on 20 historical expiries in <30 seconds
- [ ] Manual mode (Phase 1) still works unchanged

---

## 7. PHASE 3 — Information Layer (Independent)

### 7.1 Scope

Standalone dashboard showing market intelligence to inform trading decisions. **NOT integrated with execution** — this is purely informational.

### 7.2 Data Categories

#### 7.2.1 Options Data
- Live OI per strike (table + heatmap)
- OI change in last 1 hour, since open, since previous close
- Put-Call Ratio (OI-based and Volume-based)
- Max Pain (current expiry, next expiry, monthly)
- IV per strike, IV smile chart
- IV Percentile (last 30 days), IV Rank (last 1 year)
- ATM Greeks summary
- Bid-ask spread per strike

#### 7.2.2 Market Context
- India VIX (live, 5-day, 20-day average, percentile)
- FII/DII cash flows (today, week, month)
- FII F&O index futures and options positioning
- Spot vs Future basis
- NIFTY/SENSEX live with key levels (PDH, PDL, VWAP)

#### 7.2.3 News & Events
- Curated news feed (NSE announcements, RBI, Fed, key macro)
- Economic calendar (next 7 days)
- Earnings calendar
- Result/event-based volatility expectations

#### 7.2.4 Position Intelligence
- Long/short build-up indicators (price + OI direction)
- Unusual options activity (large OI additions in single strike)
- Historical IV crush patterns by day-of-week leading to expiry

### 7.3 Data Sources

- **Option chain + OI**: Axis API or NSE option chain (free, scrape or use Sensibull API)
- **VIX**: NSE
- **FII/DII**: NSDL website (scrape) or financial data API
- **News**: NewsAPI, GNews, or RSS aggregator
- **Historical IV**: Calculate from historical option chain or buy from vendor

### 7.4 Architecture (Phase 3)

Independent service from trading platform — can run as separate microservice.

- Backend: separate FastAPI app, separate DB schema
- Frontend: new tab in main app or separate sub-app
- Data ingestion: scheduled jobs (cron via Celery or APScheduler) to pull data every 1/5/15 minutes depending on source

### 7.5 Phase 3 Acceptance Criteria

- [ ] All data points listed update at expected frequency
- [ ] Max Pain calculation matches Sensibull/Opstra within ₹50
- [ ] News feed updates every 15 minutes with deduplication
- [ ] Dashboard loads in <2 seconds
- [ ] Mobile responsive

---

## 8. Recommended Build Order

### Week 1–2: Foundation
- AWS setup, Docker, CI/CD
- DB schema + migrations
- Auth + user management
- Axis API integration (auth, security master, quotes, place order)
- Basic logging + audit infrastructure

### Week 3–4: Core Execution
- Strategy module (CRUD)
- Premium monitoring loop
- Order placement (with idempotency)
- Partial fill handling

### Week 5: Risk Layer
- SL, target, time-based exit
- Position reconciliation
- Kill switch
- Circuit breaker

### Week 6: Frontend
- All pages from section 5.5
- WebSocket integration
- Mobile responsiveness

### Week 7: Notifications + Polish
- WhatsApp + email
- Error handling end-to-end
- Documentation

### Week 8: Paper Trading
- Run on live market, 4 expiries minimum
- Monitor, fix bugs, validate

### Week 9: Production Audit (External)
- Hire external reviewer (Associative / Trade Vectors / Toptal)
- Address findings
- Go live with 1 lot positions

### Phase 2: Weeks 10–14
### Phase 3: Can run in parallel from Week 6 onwards

---

## 9. What This Brief Does NOT Cover

These are explicitly out of scope for this brief — discuss separately if needed:
- Multi-broker support (only Axis Direct in this brief)
- Multi-underlying beyond NIFTY/SENSEX
- Equity or futures trading
- Multi-leg strategies beyond simple CE+PE (no butterflies, condors, ratios in Phase 1/2)
- Mobile native app (web-responsive only)
- White-label / multi-tenancy (single org for now)
- Tax reporting
- SEBI algo registration paperwork (handle via broker)

---

## 10. Final Instructions to Claude Code

When Claude Code reads this brief:

1. **Acknowledge each phase before starting** — confirm understanding before writing code
2. **Build Phase 1 completely before Phase 2** — no skipping
3. **Always reference the Critical Non-Negotiables (Section 2)** when in doubt
4. **Generate tests alongside code** — never write production code without tests
5. **Document as you go** — every module should have a README
6. **Commit frequently** — small, logical commits with clear messages
7. **Ask before deviating** — if any spec seems ambiguous or wrong, ask before assuming
8. **Default to safety** — when in doubt between speed and safety, choose safety
9. **Do not skip the audit step** — production deployment requires external code review

This is real money. Build like it.

---

**Document version**: 1.0  
**Last updated**: April 2026  
**Owner**: Rohan, Theta Gainers
