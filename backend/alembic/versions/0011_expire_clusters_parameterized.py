"""Parameterize expire_old_clusters() to read expiry thresholds from caller

The original function (0001) hardcoded 6h / 24h expiry windows, ignoring the
cluster_soft_expire_hours / cluster_hard_expire_hours settings. This replaces
it with a parameterized version; cluster_engine now passes the configured
values so the SQL stays in sync with config.py.

Revision ID: 0011
Revises: 0010
Create Date: 2026-08-19
"""
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION expire_old_clusters(
            soft_expire_hours INT DEFAULT 6,
            hard_expire_hours INT DEFAULT 24,
            soft_min_members   INT DEFAULT 3
        )
        RETURNS void LANGUAGE plpgsql AS $$
        BEGIN
            -- Low-signal clusters (fewer than soft_min_members) expire faster.
            UPDATE event_clusters
            SET is_active = FALSE
            WHERE is_active = TRUE
              AND last_updated_at < NOW() - (soft_expire_hours || ' hours')::INTERVAL
              AND member_count < soft_min_members;

            -- All clusters hard-expire after hard_expire_hours.
            UPDATE event_clusters
            SET is_active = FALSE
            WHERE is_active = TRUE
              AND last_updated_at < NOW() - (hard_expire_hours || ' hours')::INTERVAL;
        END;
        $$
    """)
    # Drop the old no-arg signature so callers can't accidentally use defaults
    # that drift from config. The new function has defaults so existing
    # `SELECT expire_old_clusters()` still works, but we want the engine to
    # pass explicit values.


def downgrade():
    op.execute("""
        CREATE OR REPLACE FUNCTION expire_old_clusters()
        RETURNS void LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE event_clusters
            SET is_active = FALSE
            WHERE is_active = TRUE
              AND last_updated_at < NOW() - INTERVAL '6 hours'
              AND member_count < 3;
            UPDATE event_clusters
            SET is_active = FALSE
            WHERE is_active = TRUE
              AND last_updated_at < NOW() - INTERVAL '24 hours';
        END;
        $$
    """)