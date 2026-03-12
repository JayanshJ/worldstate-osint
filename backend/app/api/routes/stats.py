"""
System Stats API — feeds the metrics bar in the UI
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.article import EventCluster, RawArticle

router = APIRouter()


@router.get("/")
async def get_stats(db: Annotated[AsyncSession, Depends(get_db)]):
    # Articles in last 1h, 24h
    r1h = await db.execute(
        text("SELECT COUNT(*) FROM raw_articles WHERE ingested_at >= NOW() - INTERVAL '1 hour'")
    )
    r24h = await db.execute(
        text("SELECT COUNT(*) FROM raw_articles WHERE ingested_at >= NOW() - INTERVAL '24 hours'")
    )
    # Articles per minute (last 10 min window)
    rpm = await db.execute(
        text("""
            SELECT COUNT(*) / 10.0 AS rate
            FROM   raw_articles
            WHERE  ingested_at >= NOW() - INTERVAL '10 minutes'
        """)
    )

    # Active clusters breakdown by tier
    cluster_tiers = await db.execute(
        text("""
            SELECT
                SUM(CASE WHEN volatility >= 0.85 THEN 1 ELSE 0 END) AS critical,
                SUM(CASE WHEN volatility >= 0.70 AND volatility < 0.85 THEN 1 ELSE 0 END) AS high,
                SUM(CASE WHEN volatility >= 0.55 AND volatility < 0.70 THEN 1 ELSE 0 END) AS elevated,
                SUM(CASE WHEN volatility >= 0.40 AND volatility < 0.55 THEN 1 ELSE 0 END) AS moderate,
                SUM(CASE WHEN volatility < 0.40 THEN 1 ELSE 0 END) AS calm,
                COUNT(*) AS total
            FROM event_clusters
            WHERE is_active = TRUE
        """)
    )
    tiers = cluster_tiers.fetchone()

    # Source health: articles per source in last hour
    source_health = await db.execute(
        text("""
            SELECT source_id, COUNT(*) AS count
            FROM   raw_articles
            WHERE  ingested_at >= NOW() - INTERVAL '1 hour'
            GROUP  BY source_id
            ORDER  BY count DESC
            LIMIT  12
        """)
    )

    # Vectorization queue depth
    queue_depth = await db.execute(
        text("""
            SELECT COUNT(*) FROM raw_articles
            WHERE is_processed = FALSE
              AND ingested_at >= NOW() - INTERVAL '1 hour'
        """)
    )

    # Dedup rate (articles saved vs total ingestion attempts last hour)
    # Approximation: articles with content_hash collision rate is tracked via unique constraint
    total_articles = await db.execute(
        text("SELECT COUNT(*) FROM raw_articles")
    )

    return {
        "articles": {
            "last_1h":   r1h.scalar(),
            "last_24h":  r24h.scalar(),
            "per_minute": round(float(rpm.scalar() or 0), 2),
            "total":     total_articles.scalar(),
            "queue_depth": queue_depth.scalar(),
        },
        "clusters": {
            "critical": int(tiers.critical or 0),
            "high":     int(tiers.high or 0),
            "elevated": int(tiers.elevated or 0),
            "moderate": int(tiers.moderate or 0),
            "calm":     int(tiers.calm or 0),
            "total":    int(tiers.total or 0),
        },
        "source_health": [
            {"source_id": row.source_id, "count_1h": row.count}
            for row in source_health.fetchall()
        ],
    }
