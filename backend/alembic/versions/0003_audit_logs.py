"""Add audit_logs table

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id",           postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("org_id",       postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_email",   sa.String(255), nullable=True),
        sa.Column("method",       sa.String(10),  nullable=False),
        sa.Column("path",         sa.String(500), nullable=False),
        sa.Column("status_code",  sa.Integer,     nullable=False),
        sa.Column("latency_ms",   sa.Integer,     nullable=False),
        sa.Column("ip_address",   sa.String(50),  nullable=True),
        sa.Column("created_at",   sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_audit_logs_org_id",     "audit_logs", ["org_id"])
    op.create_index("idx_audit_logs_user_email", "audit_logs", ["user_email"])
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"])

    # Auto-purge audit logs older than 90 days (keep DB lean)
    op.execute("""
        CREATE OR REPLACE FUNCTION purge_old_audit_logs() RETURNS void AS $$
        BEGIN
            DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS purge_old_audit_logs()")
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("idx_audit_logs_user_email", table_name="audit_logs")
    op.drop_index("idx_audit_logs_org_id",     table_name="audit_logs")
    op.drop_table("audit_logs")
