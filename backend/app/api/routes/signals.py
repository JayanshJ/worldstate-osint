"""
Market Signals REST API

GET  /api/v1/signals/         — list active signals (filterable by type)
POST /api/v1/signals/refresh  — trigger immediate signal fetch cycle
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.signal import MarketSignal

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/")
async def list_signals(
    db:          Annotated[AsyncSession, Depends(get_db)],
    signal_type: Optional[str] = Query(None, description="Filter by type: DEAL | INSIDER_BUY | INSIDER_SELL | ANALYST_UPGRADE | ANALYST_DOWNGRADE | EARNINGS_BEAT | EARNINGS_MISS | RUMOR"),
    limit:       int           = Query(60, ge=1, le=200),
):
    """Return active market signals, newest first."""
    q = select(MarketSignal).where(MarketSignal.is_active == True)
    if signal_type:
        q = q.where(MarketSignal.signal_type == signal_type.upper())
    q = q.order_by(MarketSignal.published_at.desc()).limit(limit)
    result = await db.execute(q)
    return [_serialize(s) for s in result.scalars().all()]


@router.post("/refresh")
async def refresh_signals():
    """Manually trigger a signal fetch cycle."""
    from app.intelligence.signals_engine import run_signals_cycle
    count = await run_signals_cycle()
    return {"new_signals": count, "ok": True}


def _serialize(s: MarketSignal) -> dict:
    return {
        "id":           str(s.id),
        "signal_type":  s.signal_type,
        "ticker":       s.ticker,
        "company":      s.company,
        "headline":     s.headline,
        "ai_summary":   s.ai_summary,
        "bullish":      s.bullish,
        "magnitude":    s.magnitude,
        "source_url":   s.source_url,
        "source_name":  s.source_name,
        "published_at": s.published_at.isoformat() if s.published_at else None,
        "expires_at":   s.expires_at.isoformat()   if s.expires_at   else None,
    }
