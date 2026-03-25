"""Add is_approved to users for invite-only access

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="true"))
    # Existing users are all approved


def downgrade() -> None:
    op.drop_column("users", "is_approved")
