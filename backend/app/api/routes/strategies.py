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

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])


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


@router.get("/methodology")
async def methodology():
    """Explains signal generation pipeline for due diligence (no auth required)."""
    return {
        "version": "1.0",
        "last_updated": "2026-03-19",
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
                "6. Signals expire after 4 h; only active signals surfaced",
            ],
            "confidence_scoring": {
                "formula": "cluster_volatility × source_diversity_multiplier × recency_weight",
                "source_diversity": "Penalises single-source clusters; min 2 sources for confidence > 0.5",
                "recency_weight": "Exponential decay with 6-hour half-life",
            },
            "limitations": [
                "NOT FINANCIAL ADVICE — for research and situational awareness only",
                "No backtesting against historical price data has been performed",
                "Signals are LLM-generated and may contain inaccuracies",
                "Typical latency from real-world event to signal: 5-20 minutes",
                "Coverage is English-language sources only",
            ],
            "legal": (
                "Provided for informational purposes only. "
                "WorldState is not a registered investment adviser. "
                "Nothing herein constitutes investment advice under the Investment Advisers Act of 1940."
            ),
        },
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
    }
