"""Add backtest outcome columns to market_strategies

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-26
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE market_strategies
            ADD COLUMN IF NOT EXISTS entry_ticker  VARCHAR(30),
            ADD COLUMN IF NOT EXISTS entry_price   FLOAT,
            ADD COLUMN IF NOT EXISTS outcome_4h    FLOAT,
            ADD COLUMN IF NOT EXISTS outcome_24h   FLOAT,
            ADD COLUMN IF NOT EXISTS checked_4h_at  TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS checked_24h_at TIMESTAMPTZ
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE market_strategies
            DROP COLUMN IF EXISTS entry_ticker,
            DROP COLUMN IF EXISTS entry_price,
            DROP COLUMN IF EXISTS outcome_4h,
            DROP COLUMN IF EXISTS outcome_24h,
            DROP COLUMN IF EXISTS checked_4h_at,
            DROP COLUMN IF EXISTS checked_24h_at
    """)
