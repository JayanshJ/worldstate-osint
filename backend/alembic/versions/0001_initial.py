"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-03-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extensions ────────────────────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')

    # ── raw_articles ──────────────────────────────────────────────────────
    op.create_table(
        "raw_articles",
        sa.Column("id",               postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("source_id",        sa.Text(), nullable=False),
        sa.Column("source_type",      sa.Text(), nullable=False),
        sa.Column("url",              sa.Text(), unique=True),
        sa.Column("title",            sa.Text(), nullable=False),
        sa.Column("body",             sa.Text()),
        sa.Column("published_at",     sa.TIMESTAMP(timezone=True)),
        sa.Column("ingested_at",      sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("raw_json",         postgresql.JSONB()),
        sa.Column("content_hash",     sa.Text(), unique=True, nullable=False),
        sa.Column("credibility_score", sa.Float(), server_default="0.5"),
        sa.Column("is_processed",     sa.Boolean(), server_default="false"),
    )
    op.create_index("idx_raw_articles_processed", "raw_articles", ["is_processed"],
                    postgresql_where=sa.text("is_processed = FALSE"))
    op.create_index("idx_raw_articles_ingested", "raw_articles", [sa.text("ingested_at DESC")])
    op.create_index("idx_raw_articles_hash", "raw_articles", ["content_hash"])

    # ── article_embeddings (vector column via raw DDL) ────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS article_embeddings (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            article_id UUID NOT NULL REFERENCES raw_articles(id) ON DELETE CASCADE,
            embedding  vector(1536) NOT NULL,
            model      TEXT DEFAULT 'text-embedding-3-small',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
            ON article_embeddings USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
    """)

    # ── event_clusters (vector column via raw DDL) ────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS event_clusters (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            label           TEXT,
            centroid        vector(1536),
            member_count    INT DEFAULT 0,
            weighted_score  FLOAT DEFAULT 0.0,
            volatility      FLOAT DEFAULT 0.0,
            sentiment       FLOAT DEFAULT 0.0,
            summary_bullets JSONB,
            key_entities    JSONB,
            first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
            last_updated_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at      TIMESTAMPTZ,
            is_active       BOOLEAN DEFAULT TRUE,
            hdbscan_label   INT
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_clusters_active ON event_clusters(is_active) WHERE is_active = TRUE")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clusters_updated ON event_clusters(last_updated_at DESC)")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_clusters_centroid
            ON event_clusters USING hnsw (centroid vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
    """)

    # ── cluster_members ───────────────────────────────────────────────────
    op.create_table(
        "cluster_members",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("event_clusters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("article_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("raw_articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("distance",   sa.Float()),
        sa.Column("added_at",   sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("cluster_id", "article_id"),
    )
    op.create_index("idx_members_cluster", "cluster_members", ["cluster_id"])
    op.create_index("idx_members_article", "cluster_members", ["article_id"])

    # ── alert_watches ─────────────────────────────────────────────────────
    op.create_table(
        "alert_watches",
        sa.Column("id",             postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name",           sa.String(200), nullable=False),
        sa.Column("keywords",       postgresql.JSONB()),
        sa.Column("entities",       postgresql.JSONB()),
        sa.Column("source_ids",     postgresql.JSONB()),
        sa.Column("min_volatility", sa.Float(), server_default="0.0"),
        sa.Column("min_sources",    sa.Integer(), server_default="1"),
        sa.Column("is_active",      sa.Boolean(), server_default="true"),
        sa.Column("created_at",     sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("last_fired_at",  sa.TIMESTAMP(timezone=True)),
        sa.Column("fire_count",     sa.Integer(), server_default="0"),
        sa.Column("channel",        sa.String(50), server_default="'websocket'"),
    )
    op.create_index("idx_watches_active", "alert_watches", ["is_active"],
                    postgresql_where=sa.text("is_active = TRUE"))

    # ── alert_firings ─────────────────────────────────────────────────────
    op.create_table(
        "alert_firings",
        sa.Column("id",         postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("watch_id",   postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("alert_watches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cluster_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("event_clusters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fired_at",   sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("payload",    postgresql.JSONB()),
    )
    op.create_index("idx_firings_watch",   "alert_firings", ["watch_id"])
    op.create_index("idx_firings_cluster", "alert_firings", ["cluster_id"])

    # ── market_strategies ─────────────────────────────────────────────────
    op.create_table(
        "market_strategies",
        sa.Column("id",           postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("title",        sa.Text(), nullable=False),
        sa.Column("thesis",       sa.Text()),
        sa.Column("asset_class",  sa.String(50)),
        sa.Column("direction",    sa.String(10)),
        sa.Column("instruments",  postgresql.JSONB()),
        sa.Column("risk_level",   sa.String(20)),
        sa.Column("time_horizon", sa.String(50)),
        sa.Column("catalysts",    postgresql.JSONB()),
        sa.Column("risks",        postgresql.JSONB()),
        sa.Column("is_active",    sa.Boolean(), server_default="true"),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_strategies_active", "market_strategies", ["is_active"])
    op.create_index("idx_strategies_generated", "market_strategies", [sa.text("generated_at DESC")])

    # ── sc_companies ──────────────────────────────────────────────────────
    op.create_table(
        "sc_companies",
        sa.Column("id",               postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("ticker",           sa.String(20), unique=True, nullable=False),
        sa.Column("cik",              sa.String(20)),
        sa.Column("legal_name",       sa.Text(), nullable=False),
        sa.Column("hq_country",       sa.String(3)),
        sa.Column("sector",           sa.String(200)),
        sa.Column("sic_code",         sa.String(10)),
        sa.Column("last_filing_date", sa.Date()),
        sa.Column("created_at",       sa.Date()),
        sa.Column("updated_at",       sa.Date()),
    )
    op.create_index("idx_sc_companies_ticker", "sc_companies", ["ticker"])

    # ── sc_edges ──────────────────────────────────────────────────────────
    op.create_table(
        "sc_edges",
        sa.Column("id",                postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("focal_id",          postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sc_companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_name",       sa.Text(), nullable=False),
        sa.Column("entity_ticker",     sa.String(20)),
        sa.Column("direction",         sa.String(20), nullable=False),
        sa.Column("relationship_type", sa.String(50)),
        sa.Column("tier",              sa.SmallInteger(), server_default="1"),
        sa.Column("pct_revenue",       sa.Numeric(6, 2)),
        sa.Column("pct_cogs",          sa.Numeric(6, 2)),
        sa.Column("sole_source",       sa.Boolean(), server_default="false"),
        sa.Column("disclosure_type",   sa.String(20), server_default="'DISCLOSED'"),
        sa.Column("confidence",        sa.Numeric(3, 2), server_default="1.0"),
        sa.Column("evidence",          sa.Text()),
        sa.Column("hq_country",        sa.String(3)),
        sa.Column("as_of_date",        sa.Date(), nullable=False),
        sa.Column("created_at",        sa.Date()),
    )
    op.create_index("idx_sc_edges_focal", "sc_edges", ["focal_id"])

    # ── users ─────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",              postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("uuid_generate_v4()")),
        sa.Column("email",           sa.String(255), unique=True, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_admin",        sa.Boolean(), server_default="false"),
        sa.Column("created_at",      sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_users_email", "users", ["email"])

    # ── expire_old_clusters function ──────────────────────────────────────
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


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS expire_old_clusters()")
    op.drop_table("users")
    op.drop_table("sc_edges")
    op.drop_table("sc_companies")
    op.drop_table("market_strategies")
    op.drop_table("alert_firings")
    op.drop_table("alert_watches")
    op.drop_table("cluster_members")
    op.execute("DROP TABLE IF EXISTS event_clusters")
    op.execute("DROP TABLE IF EXISTS article_embeddings")
    op.drop_table("raw_articles")
