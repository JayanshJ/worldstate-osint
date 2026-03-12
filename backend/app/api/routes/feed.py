"""
Raw Feed API — returns latest ingested articles regardless of cluster membership.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.article import RawArticle

router = APIRouter()


@router.get("/")
async def get_feed(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, le=500),
    source_type: str | None = Query(default=None),
    min_credibility: float = Query(default=0.0, ge=0.0, le=1.0),
):
    q = (
        select(RawArticle)
        .order_by(RawArticle.ingested_at.desc())
        .limit(limit)
    )
    if source_type:
        q = q.where(RawArticle.source_type == source_type)
    if min_credibility > 0:
        q = q.where(RawArticle.credibility_score >= min_credibility)

    result = await db.execute(q)
    articles = result.scalars().all()

    return [
        {
            "id": str(a.id),
            "source_id": a.source_id,
            "source_type": a.source_type,
            "title": a.title,
            "url": a.url,
            "published_at": a.published_at.isoformat() if a.published_at else None,
            "ingested_at": a.ingested_at.isoformat() if a.ingested_at else None,
            "credibility_score": a.credibility_score,
            "is_processed": a.is_processed,
        }
        for a in articles
    ]
