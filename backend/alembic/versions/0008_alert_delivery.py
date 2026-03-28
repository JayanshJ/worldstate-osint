"""Add email_address and webhook_url to alert_watches

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('alert_watches', sa.Column('email_address', sa.String(255), nullable=True))
    op.add_column('alert_watches', sa.Column('webhook_url',   sa.String(500), nullable=True))


def downgrade():
    op.drop_column('alert_watches', 'webhook_url')
    op.drop_column('alert_watches', 'email_address')
