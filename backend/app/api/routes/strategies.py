"""
Market Strategy REST API

GET  /api/v1/strategies/         — list all active strategies
POST /api/v1/strategies/refresh  — trigger immediate strategy regeneration
"""

from datetime import datetime, timezone
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, AsyncSessionLocal
from app.models.strategy import MarketStrategy
from app.models.user import User

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])
public_router = APIRouter()


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/")
async def list_strategies(db: Annotated[AsyncSession, Depends(get_db)]):
    """Return all active, non-expired market strategies, sorted by confidence descending."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(MarketStrategy)
        .where(MarketStrategy.is_active == True)
        .where(sa.or_(
            MarketStrategy.expires_at.is_(None),
            MarketStrategy.expires_at >= now,
        ))
        .order_by(MarketStrategy.confidence.desc())
    )
    return [_serialize(s) for s in result.scalars().all()]


@router.post("/refresh")
async def refresh_strategies(
    background_tasks: BackgroundTasks,
    admin: Annotated[User, Depends(require_admin)],
):
    """Manually trigger strategy regeneration from current cluster data (admin only)."""
    from app.intelligence.strategy_engine import generate_strategies
    async def _run():
        async with AsyncSessionLocal() as db:
            await generate_strategies(db)
    background_tasks.add_task(_run)
    return {"generated": None, "ok": True, "status": "started"}


@public_router.get("/methodology")
async def methodology():
    """Explains signal generation pipeline for due diligence (no auth required)."""
    return {
        "version": "1.0",
        "last_updated": "2026-08-28",
        "signal_generation": {
            "data_sources": [
                "RSS feeds — Reuters, BBC, Al Jazeera, Bloomberg, WSJ, FT",
                "Reddit — r/geopolitics, r/worldnews, r/investing, r/economics",
                "SEC EDGAR — SC 13G / 13F institutional filings",
                "Finnhub API — analyst upgrades/downgrades, company profiles",
            ],
            "pipeline": [
                "1. Articles ingested and deduplicated by SHA-256 content hash",
                "2. Embeddings via OpenAI text-embedding-3-small (1536-dim)",
                "3. HDBSCAN clustering groups articles by semantic similarity",
                "4. Volatility scored 0-1: member count × recency × source diversity",
                "5. Google Gemini 1.5 Flash generates thesis, rationale, asset mapping",
                "6. Strategies expire after 6 h; signals expire after 48 h",
            ],
            "confidence_scoring": {
                "formula": "LLM-generated confidence (0-1), influenced by cluster volatility and source diversity",
                "source_diversity": "Penalises single-source clusters; min 2 sources for confidence > 0.5",
                "recency_weight": "Exponential decay with 6-hour half-life",
            },
            "limitations": [
                "No backtesting against historical price data has been performed",
                "Signals are LLM-generated and may contain inaccuracies",
                "Typical latency from real-world event to signal: 5-20 minutes",
                "Coverage is English-language sources only",
            ],
            "legal": (
                "Provided for informational purposes only."
            ),
        },
    }


@router.get("/performance")
async def strategy_performance(db: Annotated[AsyncSession, Depends(get_db)]):
    """Aggregate backtest hit-rate stats from all historical strategies that have outcomes."""
    from sqlalchemy import func, case
    from app.models.strategy import MarketStrategy

    result = await db.execute(
        select(
            MarketStrategy.direction,
            func.count(MarketStrategy.id).label("total"),
            func.count(MarketStrategy.outcome_4h).label("with_4h"),
            func.count(MarketStrategy.outcome_24h).label("with_24h"),
            func.sum(
                case(
                    (MarketStrategy.direction == 'LONG',  MarketStrategy.outcome_4h > 0),
                    (MarketStrategy.direction == 'SHORT', MarketStrategy.outcome_4h < 0),
                    else_=False,
                ).cast(sa.Integer)
            ).label("hits_4h"),
            func.sum(
                case(
                    (MarketStrategy.direction == 'LONG',  MarketStrategy.outcome_24h > 0),
                    (MarketStrategy.direction == 'SHORT', MarketStrategy.outcome_24h < 0),
                    else_=False,
                ).cast(sa.Integer)
            ).label("hits_24h"),
        )
        .where(MarketStrategy.entry_ticker.isnot(None))
        .group_by(MarketStrategy.direction)
    )
    rows = result.fetchall()

    by_direction = []
    total_with_4h = total_hits_4h = total_with_24h = total_hits_24h = 0
    for r in rows:
        by_direction.append({
            "direction":  r.direction,
            "total":      r.total,
            "with_4h":   r.with_4h,
            "hits_4h":   r.hits_4h or 0,
            "rate_4h":   round((r.hits_4h or 0) / r.with_4h * 100, 1) if r.with_4h else None,
            "with_24h":  r.with_24h,
            "hits_24h":  r.hits_24h or 0,
            "rate_24h":  round((r.hits_24h or 0) / r.with_24h * 100, 1) if r.with_24h else None,
        })
        total_with_4h  += r.with_4h
        total_hits_4h  += (r.hits_4h or 0)
        total_with_24h += r.with_24h
        total_hits_24h += (r.hits_24h or 0)

    return {
        "overall": {
            "with_4h":  total_with_4h,
            "rate_4h":  round(total_hits_4h / total_with_4h * 100, 1) if total_with_4h else None,
            "with_24h": total_with_24h,
            "rate_24h": round(total_hits_24h / total_with_24h * 100, 1) if total_with_24h else None,
        },
        "by_direction": by_direction,
    }


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
        "entry_ticker": s.entry_ticker,
        "entry_price":  s.entry_price,
        "outcome_4h":   s.outcome_4h,
        "outcome_24h":  s.outcome_24h,
    }
