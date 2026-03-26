"""Recreate market_strategies with current schema

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS market_strategies CASCADE")
    op.execute("""
        CREATE TABLE market_strategies (
            id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            generated_at        TIMESTAMPTZ DEFAULT NOW(),
            expires_at          TIMESTAMPTZ,
            title               TEXT NOT NULL,
            thesis              TEXT NOT NULL,
            rationale           JSONB NOT NULL DEFAULT '[]',
            asset_class         VARCHAR(50) NOT NULL,
            specific_assets     JSONB NOT NULL DEFAULT '[]',
            direction           VARCHAR(20) NOT NULL,
            timeframe           VARCHAR(20) NOT NULL,
            risk_level          VARCHAR(20) NOT NULL,
            confidence          FLOAT DEFAULT 0.5,
            volatility_context  FLOAT DEFAULT 0.0,
            sentiment_context   FLOAT DEFAULT 0.0,
            source_cluster_ids  JSONB DEFAULT '[]',
            related_regions     JSONB DEFAULT '[]',
            is_active           BOOLEAN DEFAULT TRUE
        )
    """)
    op.execute("CREATE INDEX idx_strategies_active    ON market_strategies(is_active)")
    op.execute("CREATE INDEX idx_strategies_generated ON market_strategies(generated_at DESC)")
    op.execute("CREATE INDEX idx_strategies_expires   ON market_strategies(expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS market_strategies CASCADE")
    op.execute("""
        CREATE TABLE market_strategies (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title        TEXT NOT NULL,
            thesis       TEXT,
            asset_class  VARCHAR(50),
            direction    VARCHAR(10),
            instruments  JSONB,
            risk_level   VARCHAR(20),
            time_horizon VARCHAR(50),
            catalysts    JSONB,
            risks        JSONB,
            is_active    BOOLEAN DEFAULT TRUE,
            generated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
