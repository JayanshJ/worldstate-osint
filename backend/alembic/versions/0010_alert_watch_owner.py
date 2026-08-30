"""Add created_by to alert_watches for per-user ownership

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    # Track which user created each watch so GDPR erasure (/auth/me DELETE)
    # can scope to the caller's own watches instead of wiping the whole org.
    op.add_column(
        "alert_watches",
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_alert_watches_created_by", "alert_watches", ["created_by"])


def downgrade():
    op.drop_index("idx_alert_watches_created_by", table_name="alert_watches")
    op.drop_column("alert_watches", "created_by")