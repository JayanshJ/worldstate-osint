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
    op.execute("""
        CREATE TABLE IF NOT EXISTS raw_articles (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            source_id        TEXT NOT NULL,
            source_type      TEXT NOT NULL,
            url              TEXT UNIQUE,
            title            TEXT NOT NULL,
            body             TEXT,
            published_at     TIMESTAMPTZ,
            ingested_at      TIMESTAMPTZ DEFAULT NOW(),
            raw_json         JSONB,
            content_hash     TEXT NOT NULL UNIQUE,
            credibility_score FLOAT DEFAULT 0.5,
            is_processed     BOOLEAN DEFAULT FALSE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_raw_articles_processed ON raw_articles(is_processed) WHERE is_processed = FALSE")
    op.execute("CREATE INDEX IF NOT EXISTS idx_raw_articles_ingested  ON raw_articles(ingested_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_raw_articles_hash      ON raw_articles(content_hash)")

    # ── article_embeddings ────────────────────────────────────────────────
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

    # ── event_clusters ────────────────────────────────────────────────────
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
    op.execute("CREATE INDEX IF NOT EXISTS idx_clusters_active  ON event_clusters(is_active) WHERE is_active = TRUE")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clusters_updated ON event_clusters(last_updated_at DESC)")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_clusters_centroid
            ON event_clusters USING hnsw (centroid vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
    """)

    # ── cluster_members ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS cluster_members (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            cluster_id UUID NOT NULL REFERENCES event_clusters(id) ON DELETE CASCADE,
            article_id UUID NOT NULL REFERENCES raw_articles(id)   ON DELETE CASCADE,
            distance   FLOAT,
            added_at   TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (cluster_id, article_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_members_cluster ON cluster_members(cluster_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_members_article ON cluster_members(article_id)")

    # ── alert_watches ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_watches (
            id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name           VARCHAR(200) NOT NULL,
            keywords       JSONB,
            entities       JSONB,
            source_ids     JSONB,
            min_volatility FLOAT DEFAULT 0.0,
            min_sources    INT DEFAULT 1,
            is_active      BOOLEAN DEFAULT TRUE,
            created_at     TIMESTAMPTZ DEFAULT NOW(),
            last_fired_at  TIMESTAMPTZ,
            fire_count     INT DEFAULT 0,
            channel        VARCHAR(50) DEFAULT 'websocket'
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_watches_active ON alert_watches(is_active) WHERE is_active = TRUE")

    # ── alert_firings ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_firings (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            watch_id   UUID NOT NULL REFERENCES alert_watches(id)  ON DELETE CASCADE,
            cluster_id UUID NOT NULL REFERENCES event_clusters(id) ON DELETE CASCADE,
            fired_at   TIMESTAMPTZ DEFAULT NOW(),
            payload    JSONB
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_firings_watch   ON alert_firings(watch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_firings_cluster ON alert_firings(cluster_id)")

    # ── market_strategies ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS market_strategies (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title        TEXT NOT NULL,
            thesis       TEXT,
            asset_class  VARCHAR(50),
            direction    VARCHAR(10),
            instruments  JSONB,
            risk_level   VARCHAR(20),
            time_horizon VARCHAR(50),
            catalysts    JSONB,
            risks        JSONB,
            is_active    BOOLEAN DEFAULT TRUE,
            generated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_strategies_active    ON market_strategies(is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_strategies_generated ON market_strategies(generated_at DESC)")

    # ── sc_companies ──────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS sc_companies (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ticker           VARCHAR(20) UNIQUE NOT NULL,
            cik              VARCHAR(20),
            legal_name       TEXT NOT NULL,
            hq_country       VARCHAR(3),
            sector           VARCHAR(200),
            sic_code         VARCHAR(10),
            last_filing_date DATE,
            created_at       DATE,
            updated_at       DATE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_sc_companies_ticker ON sc_companies(ticker)")

    # ── sc_edges ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS sc_edges (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            focal_id          UUID NOT NULL REFERENCES sc_companies(id) ON DELETE CASCADE,
            entity_name       TEXT NOT NULL,
            entity_ticker     VARCHAR(20),
            direction         VARCHAR(20) NOT NULL,
            relationship_type VARCHAR(50),
            tier              SMALLINT DEFAULT 1,
            pct_revenue       NUMERIC(6,2),
            pct_cogs          NUMERIC(6,2),
            sole_source       BOOLEAN DEFAULT FALSE,
            disclosure_type   VARCHAR(20) DEFAULT 'DISCLOSED',
            confidence        NUMERIC(3,2) DEFAULT 1.0,
            evidence          TEXT,
            hq_country        VARCHAR(3),
            as_of_date        DATE NOT NULL,
            created_at        DATE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_sc_edges_focal ON sc_edges(focal_id)")

    # ── users ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email           VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            is_admin        BOOLEAN DEFAULT FALSE,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")

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
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS sc_edges")
    op.execute("DROP TABLE IF EXISTS sc_companies")
    op.execute("DROP TABLE IF EXISTS market_strategies")
    op.execute("DROP TABLE IF EXISTS alert_firings")
    op.execute("DROP TABLE IF EXISTS alert_watches")
    op.execute("DROP TABLE IF EXISTS cluster_members")
    op.execute("DROP TABLE IF EXISTS event_clusters")
    op.execute("DROP TABLE IF EXISTS article_embeddings")
    op.execute("DROP TABLE IF EXISTS raw_articles")
