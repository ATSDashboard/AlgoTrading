"""Multi-leg strategies + saved rule templates + analytics tables.

Revision ID: 002
Revises: 001
Create Date: 2026-04-16
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Generic legs — any count, any combination of CE/PE, any action, any expiry.
    op.execute("""
    CREATE TABLE strategy_legs (
        id              BIGSERIAL PRIMARY KEY,
        strategy_id     INT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
        leg_index       INT NOT NULL,                      -- display order
        leg_role        VARCHAR(20) NOT NULL DEFAULT 'MAIN'
                        CHECK (leg_role IN ('MAIN','HEDGE')),
        action          VARCHAR(10) NOT NULL CHECK (action IN ('BUY','SELL')),
        instrument_id   INT NOT NULL REFERENCES instruments(id),
        expiry_date     DATE NOT NULL,                     -- denormalized for fast query
        strike          NUMERIC(12,2) NOT NULL,
        option_type     VARCHAR(2) NOT NULL CHECK (option_type IN ('CE','PE')),
        quantity_lots   INT NOT NULL CHECK (quantity_lots > 0),
        entry_price_target NUMERIC(12,2),                  -- limit price or NULL for LTP
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (strategy_id, leg_index)
    );
    CREATE INDEX idx_strategy_legs_strategy ON strategy_legs(strategy_id);

    -- Allow existing 2-leg strategies to keep working; new UI writes strategy_legs rows.
    -- strategies.ce_strike / pe_strike become advisory headers only (Phase 1.5 cleanup).
    ALTER TABLE strategies ADD COLUMN leg_count INT NOT NULL DEFAULT 2;
    ALTER TABLE strategies ADD COLUMN strategy_name VARCHAR(100);
    ALTER TABLE strategies ADD COLUMN notes TEXT;

    -- Relax NOT NULL on single-leg-assumption fields so multi-leg strategies can omit them.
    ALTER TABLE strategies ALTER COLUMN ce_strike DROP NOT NULL;
    ALTER TABLE strategies ALTER COLUMN pe_strike DROP NOT NULL;
    ALTER TABLE strategies ALTER COLUMN ce_instrument_id DROP NOT NULL;
    ALTER TABLE strategies ALTER COLUMN pe_instrument_id DROP NOT NULL;
    """)

    # Saved strategy rule templates — user-defined, reusable.
    op.execute("""
    CREATE TABLE strategy_templates (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        kind            VARCHAR(30) NOT NULL,             -- 'SHORT_STRANGLE','IRON_CONDOR','CUSTOM', etc.
        legs_template   JSONB NOT NULL,                   -- array of leg definitions with offsets
        rules           JSONB NOT NULL,                   -- SL/target/trailing/RMS rules
        analytics_rules JSONB,                            -- tier thresholds, scoring weights
        is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
        is_shared       BOOLEAN NOT NULL DEFAULT FALSE,   -- visible to team
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, name)
    );
    CREATE INDEX idx_templates_user ON strategy_templates(user_id);
    """)

    # Analytics: Deep OTM strike recommendations (persisted per recommendation batch).
    op.execute("""
    CREATE TABLE strike_recommendations (
        id              BIGSERIAL PRIMARY KEY,
        generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        underlying      VARCHAR(20) NOT NULL CHECK (underlying IN ('NIFTY','SENSEX')),
        expiry_date     DATE NOT NULL,
        dte             INT NOT NULL,

        -- Market snapshot at time of rec
        spot            NUMERIC(12,2) NOT NULL,
        futures         NUMERIC(12,2),
        max_pain        NUMERIC(12,2),
        oi_pcr          NUMERIC(6,3),
        vol_pcr         NUMERIC(6,3),
        vix             NUMERIC(6,2),
        vix_change_pct  NUMERIC(6,2),
        expected_move_expiry NUMERIC(12,2) NOT NULL,

        -- Recommendation
        tier            INT NOT NULL CHECK (tier BETWEEN 1 AND 4),
        tier_label      VARCHAR(40) NOT NULL,
        ce_strike       NUMERIC(12,2),
        ce_premium      NUMERIC(12,2),
        ce_oi           BIGINT,
        ce_cushion_ratio NUMERIC(6,2),
        pe_strike       NUMERIC(12,2),
        pe_premium      NUMERIC(12,2),
        pe_oi           BIGINT,
        pe_cushion_ratio NUMERIC(6,2),
        combined_premium_per_lot NUMERIC(12,2),
        probability_otm_estimate NUMERIC(4,3),

        score_details   JSONB,                    -- wall-confirmation breakdown
        risk_flags      JSONB,                    -- news / macro warnings

        -- Outcome tracking (filled post-expiry)
        outcome         VARCHAR(20) CHECK (outcome IN ('PENDING','OTM','BREACHED','PARTIAL')),
        ce_settlement   NUMERIC(12,2),
        pe_settlement   NUMERIC(12,2),
        premium_captured_pct NUMERIC(6,3)
    );
    CREATE INDEX idx_recommendations_expiry ON strike_recommendations(underlying, expiry_date);
    CREATE INDEX idx_recommendations_tier_time ON strike_recommendations(tier, generated_at DESC);
    """)

    # User UI preferences (theme, etc.)
    op.execute("""
    CREATE TABLE user_preferences (
        user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme           VARCHAR(20) NOT NULL DEFAULT 'dark'
                        CHECK (theme IN ('dark','light','system')),
        sidebar_compact BOOLEAN NOT NULL DEFAULT FALSE,
        default_broker  VARCHAR(20),
        default_underlying VARCHAR(20) NOT NULL DEFAULT 'NIFTY',
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)


def downgrade() -> None:
    for t in ["user_preferences", "strike_recommendations", "strategy_templates", "strategy_legs"]:
        op.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
    op.execute("""
        ALTER TABLE strategies DROP COLUMN IF EXISTS leg_count;
        ALTER TABLE strategies DROP COLUMN IF EXISTS strategy_name;
        ALTER TABLE strategies DROP COLUMN IF EXISTS notes;
    """)
