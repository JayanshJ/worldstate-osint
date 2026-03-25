"""
Raw Feed API — returns latest ingested articles with cluster context.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.article import RawArticle, ClusterMember, EventCluster

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/")
async def get_feed(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, le=500),
    source_type: str | None = Query(default=None),
    min_credibility: float = Query(default=0.0, ge=0.0, le=1.0),
):
    # Subquery: for each article, pick the cluster with highest weighted_score
    cluster_sub = (
        select(
            ClusterMember.article_id,
            ClusterMember.cluster_id,
            EventCluster.label.label("cluster_label"),
            EventCluster.sentiment.label("cluster_sentiment"),
            func.row_number()
            .over(
                partition_by=ClusterMember.article_id,
                order_by=EventCluster.weighted_score.desc(),
            )
            .label("rn"),
        )
        .join(EventCluster, EventCluster.id == ClusterMember.cluster_id)
        .subquery("cluster_sub")
    )

    best = (
        select(
            cluster_sub.c.article_id,
            cluster_sub.c.cluster_id,
            cluster_sub.c.cluster_label,
            cluster_sub.c.cluster_sentiment,
        )
        .where(cluster_sub.c.rn == 1)
        .subquery("best")
    )

    q = (
        select(
            RawArticle,
            best.c.cluster_id.label("c_id"),
            best.c.cluster_label.label("c_label"),
            best.c.cluster_sentiment.label("c_sentiment"),
        )
        .outerjoin(best, best.c.article_id == RawArticle.id)
        .order_by(RawArticle.ingested_at.desc())
        .limit(limit)
    )

    if source_type:
        q = q.where(RawArticle.source_type == source_type)
    if min_credibility > 0:
        q = q.where(RawArticle.credibility_score >= min_credibility)

    result = await db.execute(q)
    rows = result.all()

    return [
        {
            "id": str(row.RawArticle.id),
            "source_id": row.RawArticle.source_id,
            "source_type": row.RawArticle.source_type,
            "title": row.RawArticle.title,
            "url": row.RawArticle.url,
            "published_at": row.RawArticle.published_at.isoformat() if row.RawArticle.published_at else None,
            "ingested_at": row.RawArticle.ingested_at.isoformat() if row.RawArticle.ingested_at else None,
            "credibility_score": row.RawArticle.credibility_score,
            "is_processed": row.RawArticle.is_processed,
            "cluster_id": str(row.c_id) if row.c_id else None,
            "cluster_label": row.c_label,
            "sentiment": float(row.c_sentiment) if row.c_sentiment is not None else None,
        }
        for row in rows
    ]
