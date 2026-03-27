"""Add market_signals table

Revision ID: 0007
Revises: 0006
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'market_signals',
        sa.Column('id',          UUID(as_uuid=True), primary_key=True),
        sa.Column('source_hash', sa.String(64),      nullable=False, unique=True),
        sa.Column('signal_type', sa.String(30),      nullable=False),
        sa.Column('ticker',      sa.String(20)),
        sa.Column('company',     sa.Text(),           nullable=False),
        sa.Column('headline',    sa.Text(),           nullable=False),
        sa.Column('ai_summary',  sa.Text()),
        sa.Column('bullish',     sa.Boolean()),
        sa.Column('magnitude',   sa.Float()),
        sa.Column('source_url',  sa.Text(),           nullable=False),
        sa.Column('source_name', sa.String(80),       nullable=False),
        sa.Column('published_at',sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('fetched_at',  sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('expires_at',  sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('is_active',   sa.Boolean(),        server_default='true'),
    )
    op.create_index('ix_market_signals_signal_type', 'market_signals', ['signal_type'])
    op.create_index('ix_market_signals_expires_at',  'market_signals', ['expires_at'])
    op.create_index('ix_market_signals_ticker',      'market_signals', ['ticker'])


def downgrade():
    op.drop_table('market_signals')
