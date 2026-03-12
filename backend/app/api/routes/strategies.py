"""
Market Strategy REST API

GET  /api/v1/strategies/         — list all active strategies
POST /api/v1/strategies/refresh  — trigger immediate strategy regeneration
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.strategy import MarketStrategy

router = APIRouter()


@router.get("/")
async def list_strategies(db: Annotated[AsyncSession, Depends(get_db)]):
    """Return all active market strategies, sorted by confidence descending."""
    result = await db.execute(
        select(MarketStrategy)
        .where(MarketStrategy.is_active == True)
        .order_by(MarketStrategy.confidence.desc())
    )
    return [_serialize(s) for s in result.scalars().all()]


@router.post("/refresh")
async def refresh_strategies(db: Annotated[AsyncSession, Depends(get_db)]):
    """Manually trigger strategy regeneration from current cluster data."""
    from app.intelligence.strategy_engine import generate_strategies
    strategies = await generate_strategies(db)
    return {"generated": len(strategies), "ok": True}


def _serialize(s: MarketStrategy) -> dict:
    return {
        "id": str(s.id),
        "title": s.title,
        "thesis": s.thesis,
        "rationale": s.rationale,
        "asset_class": s.asset_class,
        "specific_assets": s.specific_assets,
        "direction": s.direction,
        "timeframe": s.timeframe,
        "risk_level": s.risk_level,
        "confidence": s.confidence,
        "volatility_context": s.volatility_context,
        "sentiment_context": s.sentiment_context,
        "source_cluster_ids": s.source_cluster_ids,
        "related_regions": s.related_regions,
        "generated_at": s.generated_at.isoformat() if s.generated_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "is_active": s.is_active,
    }
