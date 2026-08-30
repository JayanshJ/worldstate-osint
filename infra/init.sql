-- WorldState DB Initialization
--
-- Only extensions are bootstrapped here. All tables, indexes, and the
-- expire_old_clusters() function are owned by Alembic migrations
-- (backend/alembic/versions/), which run automatically on API startup
-- (`alembic upgrade head`). Keeping table DDL out of this file avoids
-- dual-source-of-truth drift where init.sql and Alembic disagree on schema
-- (e.g. missing org_id/created_by columns).

CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector: embedding storage + ANN search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4() default IDs
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- trigram similarity for fuzzy text search
