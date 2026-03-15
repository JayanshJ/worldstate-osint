"""
Cluster REST API routes — used for initial page load and historical queries.
Real-time updates come via WebSocket.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.article import EventCluster
from app.intelligence.summarizer import deepdive_cluster_articles

router = APIRouter()


@router.get("/")
async def list_clusters(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, le=200),
    active_only: bool = Query(default=True),
    min_volatility: float = Query(default=0.0, ge=0.0, le=1.0),
    labeled_only: bool = Query(default=True),
):
    """List event clusters, newest first. Used for initial dashboard load."""
    q = select(EventCluster).order_by(EventCluster.last_updated_at.desc()).limit(limit)
    if active_only:
        q = q.where(EventCluster.is_active == True)
    if min_volatility > 0:
        q = q.where(EventCluster.volatility >= min_volatility)
    if labeled_only:
        q = q.where(EventCluster.label.isnot(None))

    result = await db.execute(q)
    clusters = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "label": c.label,
            "bullets": c.summary_bullets,
            "entities": c.key_entities,
            "volatility": c.volatility,
            "sentiment": c.sentiment,
            "member_count": c.member_count,
            "weighted_score": c.weighted_score,
            "first_seen_at": c.first_seen_at.isoformat() if c.first_seen_at else None,
            "last_updated_at": c.last_updated_at.isoformat() if c.last_updated_at else None,
            "is_active": c.is_active,
        }
        for c in clusters
    ]


@router.get("/{cluster_id}")
async def get_cluster(
    cluster_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single cluster with its member articles."""
    from sqlalchemy.orm import selectinload
    from app.models.article import ClusterMember, RawArticle

    result = await db.execute(
        select(EventCluster)
        .options(selectinload(EventCluster.members).selectinload(ClusterMember.article))
        .where(EventCluster.id == cluster_id)
    )
    cluster = result.scalar_one_or_none()
    if not cluster:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Cluster not found")

    return {
        "id": str(cluster.id),
        "label": cluster.label,
        "bullets": cluster.summary_bullets,
        "entities": cluster.key_entities,
        "volatility": cluster.volatility,
        "sentiment": cluster.sentiment,
        "member_count": cluster.member_count,
        "weighted_score": cluster.weighted_score,
        "first_seen_at": cluster.first_seen_at.isoformat() if cluster.first_seen_at else None,
        "last_updated_at": cluster.last_updated_at.isoformat() if cluster.last_updated_at else None,
        "members": [
            {
                "article_id": str(m.article_id),
                "source_id": m.article.source_id,
                "title": m.article.title,
                "url": m.article.url,
                "credibility_score": m.article.credibility_score,
                "published_at": m.article.published_at.isoformat() if m.article.published_at else None,
                "distance": m.distance,
            }
            for m in cluster.members
        ],
    }

@router.get("/{cluster_id}/deepdive")
async def get_cluster_deepdive(
    cluster_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate and return a live AI Deep Dive analysis for a cluster."""
    from sqlalchemy.orm import selectinload
    from app.models.article import ClusterMember
    from fastapi import HTTPException
    import logging
    logger = logging.getLogger(__name__)

    result = await db.execute(
        select(EventCluster)
        .options(selectinload(EventCluster.members).selectinload(ClusterMember.article))
        .where(EventCluster.id == cluster_id)
    )
    cluster = result.scalar_one_or_none()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
        
    articles = [m.article for m in cluster.members if m.article]
    if not articles:
        raise HTTPException(status_code=422, detail="No source articles found for this cluster.")

    try:
        analysis = await deepdive_cluster_articles(articles)
        return {"analysis": analysis}
    except Exception as e:
        logger.exception("Failed to generate deep dive for cluster %s", cluster_id)
        raise HTTPException(status_code=500, detail="Failed to generate deep dive analysis.")
