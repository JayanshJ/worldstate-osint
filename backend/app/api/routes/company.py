"""
Company Profile API routes.

GET  /api/v1/company/{ticker}          — full profile (6 h Redis cache)
POST /api/v1/company/{ticker}/refresh  — force-refresh (bust cache, re-fetch)
"""

import logging

from fastapi import APIRouter, HTTPException

from app.core.redis_client import get_redis
from app.intelligence.company_extractor import get_company_profile

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{ticker}")
async def company_get(ticker: str):
    """Return the full company profile.  Uses Redis cache when available."""
    try:
        redis   = get_redis()
    except Exception:
        redis   = None

    try:
        profile = await get_company_profile(ticker.upper(), redis)
        return profile
    except Exception as e:
        logger.error("company_get failed for %s: %s", ticker, e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{ticker}/refresh")
async def company_refresh(ticker: str):
    """Bust the Redis cache and re-fetch fresh data from yfinance/LLM."""
    ticker_upper = ticker.upper()
    try:
        redis = get_redis()
        await redis.delete(f"corp:profile:{ticker_upper}")
    except Exception:
        redis = None

    try:
        profile = await get_company_profile(ticker_upper, redis)
        return profile
    except Exception as e:
        logger.error("company_refresh failed for %s: %s", ticker, e)
        raise HTTPException(status_code=500, detail=str(e))
