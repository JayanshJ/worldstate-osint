-- WorldState DB Initialization
-- Requires pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- for fast fuzzy text search

-- ─── Raw Articles ──────────────────────────────────────────────────────────
-- Every ingested item lands here first (pre-dedup)
CREATE TABLE IF NOT EXISTS raw_articles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id       TEXT NOT NULL,          -- e.g. 'reuters_rss', 'reddit_worldnews'
    source_type     TEXT NOT NULL,          -- 'rss' | 'playwright' | 'reddit' | 'twitter'
    url             TEXT UNIQUE,            -- canonical URL for dedup
    title           TEXT NOT NULL,
    body            TEXT,
    published_at    TIMESTAMPTZ,
    ingested_at     TIMESTAMPTZ DEFAULT NOW(),
    raw_json        JSONB,                  -- full original payload
    content_hash    TEXT UNIQUE NOT NULL,   -- SHA256 of normalized title+body for dedup
    credibility_score FLOAT DEFAULT 0.5,   -- source weight [0,1]
    is_processed    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_raw_articles_processed ON raw_articles(is_processed) WHERE is_processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_raw_articles_ingested  ON raw_articles(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_articles_hash      ON raw_articles(content_hash);

-- ─── Embeddings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_embeddings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id      UUID NOT NULL REFERENCES raw_articles(id) ON DELETE CASCADE,
    embedding       vector(1536) NOT NULL,
    model           TEXT DEFAULT 'text-embedding-3-small',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON article_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ─── Event Clusters ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_clusters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label           TEXT,                   -- AI-generated event title
    centroid        vector(1536),           -- mean embedding of cluster members
    member_count    INT DEFAULT 0,
    weighted_score  FLOAT DEFAULT 0.0,      -- sum of credibility scores
    volatility      FLOAT DEFAULT 0.0,      -- [0,1] 0=calm, 1=breaking
    sentiment       FLOAT DEFAULT 0.0,      -- [-1,1]
    summary_bullets JSONB,                  -- ["bullet1", "bullet2", "bullet3"]
    key_entities    JSONB,                  -- {people:[], orgs:[], locations:[]}
    first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,            -- drift management: auto-expire
    is_active       BOOLEAN DEFAULT TRUE,
    hdbscan_label   INT                     -- raw HDBSCAN cluster id
);

CREATE INDEX IF NOT EXISTS idx_clusters_active    ON event_clusters(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_clusters_updated   ON event_clusters(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_centroid  ON event_clusters USING hnsw (centroid vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ─── Cluster Membership ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cluster_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id      UUID NOT NULL REFERENCES event_clusters(id) ON DELETE CASCADE,
    article_id      UUID NOT NULL REFERENCES raw_articles(id) ON DELETE CASCADE,
    distance        FLOAT,                  -- cosine distance to centroid
    added_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cluster_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_members_cluster ON cluster_members(cluster_id);
CREATE INDEX IF NOT EXISTS idx_members_article ON cluster_members(article_id);

-- ─── Alert Watches ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_watches (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    keywords        JSONB,
    entities        JSONB,
    source_ids      JSONB,
    min_volatility  FLOAT DEFAULT 0.0,
    min_sources     INT DEFAULT 1,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_fired_at   TIMESTAMPTZ,
    fire_count      INT DEFAULT 0,
    channel         TEXT DEFAULT 'websocket'
);

CREATE TABLE IF NOT EXISTS alert_firings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watch_id    UUID NOT NULL REFERENCES alert_watches(id) ON DELETE CASCADE,
    cluster_id  UUID NOT NULL REFERENCES event_clusters(id) ON DELETE CASCADE,
    fired_at    TIMESTAMPTZ DEFAULT NOW(),
    payload     JSONB
);

CREATE INDEX IF NOT EXISTS idx_firings_watch   ON alert_firings(watch_id);
CREATE INDEX IF NOT EXISTS idx_firings_cluster ON alert_firings(cluster_id);
CREATE INDEX IF NOT EXISTS idx_watches_active  ON alert_watches(is_active) WHERE is_active = TRUE;

-- ─── Drift Management: auto-expire clusters older than N hours ─────────────
CREATE OR REPLACE FUNCTION expire_old_clusters()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE event_clusters
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND last_updated_at < NOW() - INTERVAL '6 hours'
      AND member_count < 3;  -- low-signal clusters expire faster

    UPDATE event_clusters
    SET is_active = FALSE
    WHERE is_active = TRUE
      AND last_updated_at < NOW() - INTERVAL '24 hours';
END;
$$;
