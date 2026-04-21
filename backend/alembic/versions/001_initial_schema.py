"""Initial schema: users, roles, brokers, strategies, orders, audit, risk state.

Revision ID: 001
Revises:
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # ── Users & roles ─────────────────────────────────────────────────────────
    op.execute("""
    CREATE TABLE users (
        id              SERIAL PRIMARY KEY,
        username        VARCHAR(100) UNIQUE NOT NULL,
        email           VARCHAR(255) UNIQUE NOT NULL,
        phone           VARCHAR(20),
        whatsapp_number VARCHAR(20),
        telegram_chat_id VARCHAR(50),
        password_hash   VARCHAR(255) NOT NULL,
        totp_secret     VARCHAR(64),            -- base32-encoded, required
        totp_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
        role            VARCHAR(20) NOT NULL DEFAULT 'TRADER'
                        CHECK (role IN ('ADMIN','TRADER','VIEWER','AUDITOR','RISK_OFFICER')),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        failed_login_count INT NOT NULL DEFAULT 0,
        locked_until    TIMESTAMPTZ,
        last_login_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_users_username ON users(username);
    CREATE INDEX idx_users_email ON users(email);
    """)

    # ── Broker credentials & sessions ─────────────────────────────────────────
    op.execute("""
    CREATE TABLE broker_credentials (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        broker          VARCHAR(20) NOT NULL
                        CHECK (broker IN ('paper','axis','zerodha','monarch','jm')),
        label           VARCHAR(100),
        api_key_encrypted  TEXT,            -- Fernet-encrypted
        api_secret_encrypted TEXT,
        client_id       VARCHAR(100),
        extra_config    JSONB NOT NULL DEFAULT '{}',
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, broker, label)
    );

    CREATE TABLE demat_accounts (
        id              SERIAL PRIMARY KEY,
        broker_cred_id  INT NOT NULL REFERENCES broker_credentials(id) ON DELETE CASCADE,
        account_number  VARCHAR(50) NOT NULL,
        account_label   VARCHAR(100),           -- e.g., "Rohan HUF"
        capital_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
        daily_loss_cap  NUMERIC(14,2) NOT NULL DEFAULT 0,
        is_default      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (broker_cred_id, account_number)
    );

    CREATE TABLE broker_sessions (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        broker_cred_id  INT NOT NULL REFERENCES broker_credentials(id) ON DELETE CASCADE,
        demat_account_id INT REFERENCES demat_accounts(id),
        auth_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT,
        token_expires_at TIMESTAMPTZ NOT NULL,
        last_refreshed_at TIMESTAMPTZ,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_broker_sessions_user_active ON broker_sessions(user_id, is_active);
    """)

    # ── Security master (option instruments) ──────────────────────────────────
    op.execute("""
    CREATE TABLE instruments (
        id              SERIAL PRIMARY KEY,
        broker          VARCHAR(20) NOT NULL,
        script_id       VARCHAR(100) NOT NULL,   -- broker-specific token/symbol
        exchange        VARCHAR(10) NOT NULL,    -- NFO or BFO
        underlying      VARCHAR(20) NOT NULL CHECK (underlying IN ('NIFTY','SENSEX')),
        expiry_date     DATE NOT NULL,
        strike          NUMERIC(12,2) NOT NULL,
        option_type     VARCHAR(2) NOT NULL CHECK (option_type IN ('CE','PE')),
        lot_size        INT NOT NULL,
        tick_size       NUMERIC(6,4) NOT NULL DEFAULT 0.05,
        freeze_qty      INT NOT NULL,
        trading_symbol  VARCHAR(100) NOT NULL,
        is_tradable     BOOLEAN NOT NULL DEFAULT TRUE,
        synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (broker, script_id)
    );
    CREATE INDEX idx_instruments_lookup
        ON instruments(underlying, expiry_date, strike, option_type);
    CREATE INDEX idx_instruments_broker_expiry ON instruments(broker, expiry_date);
    """)

    # ── Strategies ────────────────────────────────────────────────────────────
    op.execute("""
    CREATE TABLE strategies (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id),
        broker_session_id INT NOT NULL REFERENCES broker_sessions(id),
        demat_account_id INT NOT NULL REFERENCES demat_accounts(id),

        underlying      VARCHAR(20) NOT NULL CHECK (underlying IN ('NIFTY','SENSEX')),
        expiry_date     DATE NOT NULL,
        ce_strike       NUMERIC(12,2) NOT NULL,
        pe_strike       NUMERIC(12,2) NOT NULL,
        ce_instrument_id INT NOT NULL REFERENCES instruments(id),
        pe_instrument_id INT NOT NULL REFERENCES instruments(id),

        -- Optional hedge legs (iron condor style) — default off
        hedge_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
        ce_hedge_strike NUMERIC(12,2),
        pe_hedge_strike NUMERIC(12,2),
        ce_hedge_instrument_id INT REFERENCES instruments(id),
        pe_hedge_instrument_id INT REFERENCES instruments(id),

        quantity_lots   INT NOT NULL CHECK (quantity_lots > 0),

        trigger_mode    VARCHAR(20) NOT NULL CHECK (trigger_mode IN ('COMBINED','SEPARATE')),
        combined_threshold NUMERIC(12,2),
        ce_threshold    NUMERIC(12,2),
        pe_threshold    NUMERIC(12,2),

        order_type      VARCHAR(30) NOT NULL DEFAULT 'LIMIT_WITH_BUFFER'
                        CHECK (order_type IN ('LIMIT','LIMIT_WITH_BUFFER')),
        limit_buffer_pct NUMERIC(5,2) NOT NULL DEFAULT 2.0,

        sl_amount       NUMERIC(14,2) NOT NULL,
        target_amount   NUMERIC(14,2),
        trailing_sl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        trailing_sl_trigger NUMERIC(14,2),       -- start trailing after profit ≥ this
        trailing_sl_step NUMERIC(14,2),
        lockin_profit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        lockin_profit_amount NUMERIC(14,2),

        squareoff_time  TIME NOT NULL DEFAULT '15:15:00',

        state           VARCHAR(25) NOT NULL DEFAULT 'DRAFT'
                        CHECK (state IN ('DRAFT','MONITORING','ENTERING','LIVE',
                                         'EXITING','CLOSED','EMERGENCY_HALT')),
        exit_reason     VARCHAR(30),
        final_pnl       NUMERIC(14,2),
        peak_pnl        NUMERIC(14,2) DEFAULT 0,  -- for MTM DD kill

        sebi_algo_tag   VARCHAR(50),             -- tagged on every order
        approved_by     INT REFERENCES users(id), -- if two-person approval required
        approved_at     TIMESTAMPTZ,

        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at      TIMESTAMPTZ,
        entered_at      TIMESTAMPTZ,
        closed_at       TIMESTAMPTZ
    );
    CREATE INDEX idx_strategies_user_state ON strategies(user_id, state);
    CREATE INDEX idx_strategies_state ON strategies(state) WHERE state IN ('MONITORING','ENTERING','LIVE','EXITING');
    """)

    # ── Orders ────────────────────────────────────────────────────────────────
    op.execute("""
    CREATE TABLE orders (
        id              BIGSERIAL PRIMARY KEY,
        strategy_id     INT NOT NULL REFERENCES strategies(id),
        parent_order_id BIGINT REFERENCES orders(id),   -- for iceberg slices
        leg             VARCHAR(10) NOT NULL
                        CHECK (leg IN ('CE_MAIN','PE_MAIN','CE_HEDGE','PE_HEDGE')),
        action          VARCHAR(10) NOT NULL CHECK (action IN ('BUY','SELL')),
        instrument_id   INT NOT NULL REFERENCES instruments(id),
        quantity        INT NOT NULL,
        order_type      VARCHAR(30) NOT NULL,
        limit_price     NUMERIC(12,2),

        client_ref_id   VARCHAR(100) UNIQUE NOT NULL,  -- idempotency key
        parent_hash     VARCHAR(64),                   -- hash-chain prev order
        order_hash      VARCHAR(64) NOT NULL,          -- sha256 over content+parent_hash

        broker_order_id VARCHAR(100),
        broker_response JSONB,
        status          VARCHAR(30) NOT NULL DEFAULT 'PENDING',

        requested_price NUMERIC(12,2),                 -- price we asked for
        filled_qty      INT NOT NULL DEFAULT 0,
        avg_fill_price  NUMERIC(12,2),
        slippage_pct    NUMERIC(6,3),                  -- (fill - requested) / requested * 100

        sebi_algo_tag   VARCHAR(50),
        placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        acked_at        TIMESTAMPTZ,
        filled_at       TIMESTAMPTZ,
        cancelled_at    TIMESTAMPTZ,
        requote_count   INT NOT NULL DEFAULT 0,
        error_message   TEXT,
        latency_ms      INT                             -- signal → ack
    );
    CREATE INDEX idx_orders_strategy ON orders(strategy_id, placed_at DESC);
    CREATE INDEX idx_orders_status ON orders(status) WHERE status IN ('PENDING','SUBMITTED','OPEN','PARTIAL');
    CREATE INDEX idx_orders_broker_ref ON orders(broker_order_id);
    """)

    # ── Positions snapshot (for reconciliation) ───────────────────────────────
    op.execute("""
    CREATE TABLE position_snapshots (
        id              BIGSERIAL PRIMARY KEY,
        strategy_id     INT NOT NULL REFERENCES strategies(id),
        instrument_id   INT NOT NULL REFERENCES instruments(id),
        quantity        INT NOT NULL,
        avg_price       NUMERIC(12,2) NOT NULL,
        mtm_pnl         NUMERIC(14,2) NOT NULL,
        source          VARCHAR(20) NOT NULL CHECK (source IN ('INTERNAL','BROKER')),
        snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_positions_strategy_time ON position_snapshots(strategy_id, snapshot_at DESC);
    """)

    # ── Audit log (hash-chained, immutable) ───────────────────────────────────
    op.execute("""
    CREATE TABLE audit_logs (
        id              BIGSERIAL PRIMARY KEY,
        occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id         INT REFERENCES users(id),
        strategy_id     INT REFERENCES strategies(id),
        event_type      VARCHAR(60) NOT NULL,
        event_data      JSONB NOT NULL,
        severity        VARCHAR(20) NOT NULL DEFAULT 'INFO'
                        CHECK (severity IN ('INFO','WARN','ERROR','CRITICAL')),
        ip_address      INET,
        user_agent      VARCHAR(500),
        prev_hash       VARCHAR(64),
        entry_hash      VARCHAR(64) NOT NULL                -- sha256(prev_hash || row_content)
    );
    CREATE INDEX idx_audit_strategy_time ON audit_logs(strategy_id, occurred_at DESC);
    CREATE INDEX idx_audit_user_time ON audit_logs(user_id, occurred_at DESC);
    CREATE INDEX idx_audit_event ON audit_logs(event_type, occurred_at DESC);

    -- Append-only: prevent UPDATE and DELETE
    CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_logs is append-only';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
    CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
    """)

    # ── Risk state (daily counters, circuit breakers, rate-limit) ─────────────
    op.execute("""
    CREATE TABLE risk_state (
        id              SERIAL PRIMARY KEY,
        user_id         INT REFERENCES users(id),          -- NULL = global
        trade_date      DATE NOT NULL,
        daily_loss_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        realized_pnl    NUMERIC(14,2) NOT NULL DEFAULT 0,
        orders_placed   INT NOT NULL DEFAULT 0,
        orders_filled   INT NOT NULL DEFAULT 0,
        otr             NUMERIC(8,2) NOT NULL DEFAULT 0,   -- orders/trades ratio
        consecutive_errors INT NOT NULL DEFAULT 0,
        halted          BOOLEAN NOT NULL DEFAULT FALSE,
        halted_reason   VARCHAR(60),
        halted_at       TIMESTAMPTZ,
        cooling_off_until TIMESTAMPTZ,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, trade_date)
    );
    """)

    # ── Two-person approvals ──────────────────────────────────────────────────
    op.execute("""
    CREATE TABLE approval_requests (
        id              SERIAL PRIMARY KEY,
        requested_by    INT NOT NULL REFERENCES users(id),
        action_type     VARCHAR(60) NOT NULL,
        action_payload  JSONB NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
        approved_by     INT REFERENCES users(id),
        decision_note   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at      TIMESTAMPTZ,
        expires_at      TIMESTAMPTZ NOT NULL,
        CHECK (approved_by IS NULL OR approved_by <> requested_by)
    );
    CREATE INDEX idx_approvals_status ON approval_requests(status, expires_at);
    """)

    # ── Notifications queue (resilient delivery) ──────────────────────────────
    op.execute("""
    CREATE TABLE notifications (
        id              BIGSERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id),
        channel         VARCHAR(20) NOT NULL
                        CHECK (channel IN ('whatsapp','telegram','email','sms','voice')),
        severity        VARCHAR(20) NOT NULL,
        subject         VARCHAR(200),
        body            TEXT NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
                        CHECK (status IN ('QUEUED','SENT','FAILED','RETRYING')),
        attempts        INT NOT NULL DEFAULT 0,
        last_error      TEXT,
        queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at         TIMESTAMPTZ
    );
    CREATE INDEX idx_notif_status ON notifications(status, queued_at);
    """)

    # ── Heartbeat (dead-man switch) ───────────────────────────────────────────
    op.execute("""
    CREATE TABLE ui_heartbeats (
        user_id         INT PRIMARY KEY REFERENCES users(id),
        last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent      VARCHAR(500),
        ip_address      INET
    );
    """)

    # ── EOD reconciliation report ─────────────────────────────────────────────
    op.execute("""
    CREATE TABLE eod_reconciliation (
        id              SERIAL PRIMARY KEY,
        trade_date      DATE NOT NULL,
        user_id         INT NOT NULL REFERENCES users(id),
        broker_cred_id  INT NOT NULL REFERENCES broker_credentials(id),
        internal_pnl    NUMERIC(14,2) NOT NULL,
        broker_pnl      NUMERIC(14,2) NOT NULL,
        discrepancy     NUMERIC(14,2) NOT NULL,
        order_count_internal INT NOT NULL,
        order_count_broker INT NOT NULL,
        report_json     JSONB NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW'
                        CHECK (status IN ('PENDING_REVIEW','CLEAN','DISCREPANCY','RESOLVED')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (trade_date, user_id, broker_cred_id)
    );
    """)


def downgrade() -> None:
    for t in ["eod_reconciliation","ui_heartbeats","notifications","approval_requests",
              "risk_state","audit_logs","position_snapshots","orders","strategies",
              "instruments","broker_sessions","demat_accounts","broker_credentials","users"]:
        op.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_immutable CASCADE")
