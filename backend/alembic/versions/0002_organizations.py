"""Add organizations table and org_id to users + alert_watches

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── organizations ──────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name",       sa.String(200),  nullable=False),
        sa.Column("slug",       sa.String(100),  nullable=False, unique=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_organizations_slug", "organizations", ["slug"], unique=True)

    # ── add org_id to users ────────────────────────────────────────────────
    op.add_column(
        "users",
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_users_org_id", "users", ["org_id"])

    # ── add org_id to alert_watches ────────────────────────────────────────
    op.add_column(
        "alert_watches",
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("idx_alert_watches_org_id", "alert_watches", ["org_id"])


def downgrade() -> None:
    op.drop_index("idx_alert_watches_org_id", table_name="alert_watches")
    op.drop_column("alert_watches", "org_id")
    op.drop_index("idx_users_org_id", table_name="users")
    op.drop_column("users", "org_id")
    op.drop_index("idx_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
