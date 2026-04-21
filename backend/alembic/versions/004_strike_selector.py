"""Strike selector presets + evaluation log + trade journal + pre-market checklist.

Revision ID: 004
Revises: 003
Create Date: 2026-04-18
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE strike_selector_presets (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            rule JSONB NOT NULL,
            is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
            applies_to VARCHAR(10) NOT NULL DEFAULT 'ENTRY' CHECK (applies_to IN ('ENTRY','EXIT')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, name, applies_to)
        );
        CREATE INDEX idx_ssp_user ON strike_selector_presets(user_id);
    """)

    # Every evaluation logged — the dataset for future ML / performance analysis.
    op.execute("""
        CREATE TABLE strike_selector_evaluations (
            id BIGSERIAL PRIMARY KEY,
            evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            user_id INT REFERENCES users(id),
            strategy_id INT REFERENCES strategies(id),
            preset_id INT REFERENCES strike_selector_presets(id),
            underlying VARCHAR(20) NOT NULL,
            expiry_date DATE,
            rule_snapshot JSONB NOT NULL,
            market_snapshot JSONB NOT NULL,
            strike NUMERIC(12,2),
            option_type VARCHAR(2),
            passed BOOLEAN NOT NULL,
            per_filter_results JSONB NOT NULL
        );
        CREATE INDEX idx_sse_time ON strike_selector_evaluations(evaluated_at DESC);
        CREATE INDEX idx_sse_preset ON strike_selector_evaluations(preset_id);
        CREATE INDEX idx_sse_underlying ON strike_selector_evaluations(underlying, expiry_date);
    """)

    # Trade journal entries (free-text notes on strategies)
    op.execute("""
        CREATE TABLE trade_journal (
            id BIGSERIAL PRIMARY KEY,
            strategy_id INT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
            user_id INT NOT NULL REFERENCES users(id),
            kind VARCHAR(20) NOT NULL CHECK (kind IN ('PRE','POST','ADJUSTMENT','LESSON')),
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_journal_strategy ON trade_journal(strategy_id, created_at DESC);
    """)

    # Pre-market checklist acknowledgements
    op.execute("""
        CREATE TABLE premarket_checklist (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id),
            check_date DATE NOT NULL,
            items JSONB NOT NULL,           -- { "vix_checked": true, "events_checked": true, ... }
            acknowledged_at TIMESTAMPTZ,
            UNIQUE (user_id, check_date)
        );
    """)


def downgrade() -> None:
    for t in ["premarket_checklist", "trade_journal", "strike_selector_evaluations", "strike_selector_presets"]:
        op.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
