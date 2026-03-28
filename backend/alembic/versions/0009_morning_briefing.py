"""Add morning_briefings table

Revision ID: 0009
Revises: 0008
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'morning_briefings',
        sa.Column('id',           UUID(as_uuid=True), primary_key=True),
        sa.Column('date',         sa.Date(),          nullable=False, unique=True),
        sa.Column('headline',     sa.Text(),           nullable=False),
        sa.Column('tldr',         sa.Text(),           nullable=False),
        sa.Column('top_events',   sa.dialects.postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('trade_setups', sa.dialects.postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('macro_theme',  sa.Text(),           nullable=False, server_default=''),
        sa.Column('generated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_morning_briefings_date', 'morning_briefings', ['date'])


def downgrade():
    op.drop_table('morning_briefings')
