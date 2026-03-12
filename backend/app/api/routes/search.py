"""
Semantic + Keyword Search API

Supports two modes:
  1. Keyword search   — pg_trgm similarity on title/body
  2. Semantic search  — embed the query → cosine ANN lookup via pgvector HNSW

Both return a unified result set ranked by relevance, with cluster membership.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.models.article import ArticleEmbedding, ClusterMember, EventCluster, RawArticle
from app.vectorization.embedder import embed_text

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


# ─── Response schemas ─────────────────────────────────────────────────────

class ArticleHit(BaseModel):
    article_id:       str
    source_id:        str
    title:            str
    url:              str | None
    published_at:     str | None
    credibility_score: float
    score:            float           # similarity or trgm score
    cluster_id:       str | None
    cluster_label:    str | None
    cluster_volatility: float | None


class ClusterHit(BaseModel):
    cluster_id:  str
    label:       str | None
    bullets:     list[str] | None
    volatility:  float
    sentiment:   float
    member_count: int
    score:        float


class SearchResponse(BaseModel):
    query:        str
    mode:         str
    article_hits: list[ArticleHit]
    cluster_hits: list[ClusterHit]
    total:        int


# ─── Keyword search ───────────────────────────────────────────────────────

async def keyword_search(
    db: AsyncSession,
    query: str,
    limit: int,
) -> tuple[list[ArticleHit], list[ClusterHit]]:
    """
    Uses PostgreSQL full-text search (tsvector/tsquery) as the primary match,
    scored with ts_rank + word_similarity boost.  Falls back gracefully for
    queries that don't parse as tsquery (e.g. punctuation-only strings).
    """
    article_result = await db.execute(
        text("""
            WITH scored AS (
                SELECT
                    ra.id,
                    ra.source_id,
                    ra.title,
                    ra.url,
                    ra.published_at,
                    ra.credibility_score,
                    cm.cluster_id,
                    ec.label          AS cluster_label,
                    ec.volatility     AS cluster_volatility,
                    GREATEST(
                        ts_rank(
                            to_tsvector('english', ra.title || ' ' || COALESCE(ra.body, '')),
                            plainto_tsquery('english', :q)
                        ),
                        word_similarity(:q, ra.title)
                    ) AS score
                FROM   raw_articles ra
                LEFT   JOIN cluster_members cm ON cm.article_id = ra.id
                LEFT   JOIN event_clusters  ec ON ec.id = cm.cluster_id AND ec.is_active = TRUE
                WHERE
                    to_tsvector('english', ra.title || ' ' || COALESCE(ra.body, ''))
                        @@ plainto_tsquery('english', :q)
                    OR word_similarity(:q, ra.title || ' ' || COALESCE(ra.body, '')) > 0.25
                    OR ra.title ILIKE '%' || :q || '%'
            )
            SELECT * FROM scored
            ORDER  BY score DESC
            LIMIT  :lim
        """),
        {"q": query, "lim": limit},
    )
    article_hits = [
        ArticleHit(
            article_id=str(row.id),
            source_id=row.source_id,
            title=row.title,
            url=row.url,
            published_at=row.published_at.isoformat() if row.published_at else None,
            credibility_score=row.credibility_score,
            score=float(row.score),
            cluster_id=str(row.cluster_id) if row.cluster_id else None,
            cluster_label=row.cluster_label,
            cluster_volatility=row.cluster_volatility,
        )
        for row in article_result.fetchall()
    ]

    # Cluster search: FTS on label + bullets, plus word_similarity fallback
    cluster_result = await db.execute(
        text("""
            SELECT
                id, label, summary_bullets, volatility, sentiment, member_count,
                GREATEST(
                    ts_rank(
                        to_tsvector('english', COALESCE(label, '') || ' ' ||
                            COALESCE(COALESCE(summary_bullets::text, ''), '')),
                        plainto_tsquery('english', :q)
                    ),
                    word_similarity(:q, COALESCE(label, ''))
                ) AS score
            FROM   event_clusters
            WHERE  is_active = TRUE
              AND (
                to_tsvector('english', COALESCE(label, '') || ' ' ||
                    COALESCE(COALESCE(summary_bullets::text, ''), ''))
                    @@ plainto_tsquery('english', :q)
                OR word_similarity(:q, COALESCE(label, '')) > 0.3
                OR label ILIKE '%' || :q || '%'
              )
            ORDER  BY score DESC
            LIMIT  :lim
        """),
        {"q": query, "lim": limit // 2},
    )
    cluster_hits = [
        ClusterHit(
            cluster_id=str(row.id),
            label=row.label,
            bullets=row.summary_bullets,
            volatility=row.volatility,
            sentiment=row.sentiment,
            member_count=row.member_count,
            score=float(row.score),
        )
        for row in cluster_result.fetchall()
    ]

    return article_hits, cluster_hits


# ─── Semantic search ──────────────────────────────────────────────────────

async def semantic_search(
    db: AsyncSession,
    query: str,
    limit: int,
) -> tuple[list[ArticleHit], list[ClusterHit]]:
    try:
        query_embedding = await embed_text(query)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Embedding service error: {e}")

    vec_str = str(query_embedding)

    # ANN search over article embeddings
    article_result = await db.execute(
        text("""
            SELECT
                ra.id,
                ra.source_id,
                ra.title,
                ra.url,
                ra.published_at,
                ra.credibility_score,
                1 - (ae.embedding <=> CAST(:vec AS vector)) AS score,
                cm.cluster_id,
                ec.label   AS cluster_label,
                ec.volatility AS cluster_volatility
            FROM   article_embeddings ae
            JOIN   raw_articles ra    ON ra.id = ae.article_id
            LEFT   JOIN cluster_members cm ON cm.article_id = ra.id
            LEFT   JOIN event_clusters  ec ON ec.id = cm.cluster_id AND ec.is_active = TRUE
            ORDER  BY ae.embedding <=> CAST(:vec AS vector)
            LIMIT  :lim
        """),
        {"vec": vec_str, "lim": limit},
    )
    article_hits = [
        ArticleHit(
            article_id=str(row.id),
            source_id=row.source_id,
            title=row.title,
            url=row.url,
            published_at=row.published_at.isoformat() if row.published_at else None,
            credibility_score=row.credibility_score,
            score=float(row.score),
            cluster_id=str(row.cluster_id) if row.cluster_id else None,
            cluster_label=row.cluster_label,
            cluster_volatility=row.cluster_volatility,
        )
        for row in article_result.fetchall()
        if row.score > 0.35  # filter low-relevance results
    ]

    # ANN search over cluster centroids
    cluster_result = await db.execute(
        text("""
            SELECT
                id, label, summary_bullets, volatility, sentiment, member_count,
                1 - (centroid <=> CAST(:vec AS vector)) AS score
            FROM   event_clusters
            WHERE  is_active = TRUE AND centroid IS NOT NULL
            ORDER  BY centroid <=> CAST(:vec AS vector)
            LIMIT  :lim
        """),
        {"vec": vec_str, "lim": limit // 2},
    )
    cluster_hits = [
        ClusterHit(
            cluster_id=str(row.id),
            label=row.label,
            bullets=row.summary_bullets,
            volatility=row.volatility,
            sentiment=row.sentiment,
            member_count=row.member_count,
            score=float(row.score),
        )
        for row in cluster_result.fetchall()
        if row.score > 0.35
    ]

    return article_hits, cluster_hits


# ─── Endpoint ─────────────────────────────────────────────────────────────

@router.get("/", response_model=SearchResponse)
async def search(
    db:    Annotated[AsyncSession, Depends(get_db)],
    q:     str   = Query(min_length=2, max_length=500, description="Search query"),
    mode:  str   = Query(default="keyword", pattern="^(keyword|semantic)$"),
    limit: int   = Query(default=20, le=50),
):
    """
    Search articles and clusters.
    - mode=keyword  : fast pg_trgm trigram search
    - mode=semantic : slow but meaning-aware vector search (incurs embedding API call)
    """
    if mode == "semantic":
        article_hits, cluster_hits = await semantic_search(db, q, limit)
    else:
        article_hits, cluster_hits = await keyword_search(db, q, limit)

    return SearchResponse(
        query=q,
        mode=mode,
        article_hits=article_hits,
        cluster_hits=cluster_hits,
        total=len(article_hits) + len(cluster_hits),
    )
