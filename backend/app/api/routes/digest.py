"""
Smart Digest API — top 5 highest-signal stories, cached 15 min in Redis.
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.article import EventCluster
from app.core.security import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

DIGEST_KEY = "worldstate:digest"
DIGEST_TTL = 900  # 15 minutes


@router.get("/")
async def get_digest(db: Annotated[AsyncSession, Depends(get_db)]):
    """Return top 5 stories ranked by weighted_score, cached for 15 min."""
    r = get_redis()
    cached = await r.get(DIGEST_KEY)
    if cached:
        return json.loads(cached)

    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    q = (
        select(EventCluster)
        .where(EventCluster.is_active == True)
        .where(EventCluster.label.isnot(None))
        .where(EventCluster.summary_bullets.isnot(None))
        .where(EventCluster.last_updated_at >= cutoff)
        .order_by(EventCluster.weighted_score.desc())
        .limit(5)
    )
    result = await db.execute(q)
    clusters = result.scalars().all()

    digest = [
        {
            "id": str(c.id),
            "label": c.label,
            "bullets": (c.summary_bullets or [])[:3],
            "entities": c.key_entities,
            "sentiment": c.sentiment,
            "volatility": c.volatility,
            "member_count": c.member_count,
            "weighted_score": c.weighted_score,
            "last_updated_at": c.last_updated_at.isoformat() if c.last_updated_at else None,
        }
        for c in clusters
    ]

    await r.set(DIGEST_KEY, json.dumps(digest), ex=DIGEST_TTL)
    return digest


@router.post("/refresh")
async def refresh_digest(db: Annotated[AsyncSession, Depends(get_db)]):
    """Bust the digest cache and immediately rebuild."""
    r = get_redis()
    await r.delete(DIGEST_KEY)
    return await get_digest(db)
