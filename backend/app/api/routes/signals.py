"""
Market Signals REST API

GET  /api/v1/signals/         — list active signals (filterable by type)
POST /api/v1/signals/refresh  — trigger signal fetch cycle in background
"""

import asyncio
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.signal import MarketSignal
from app.models.user import User

router       = APIRouter(dependencies=[Depends(get_current_user)])
public_router = APIRouter()   # no auth — status only
logger = logging.getLogger(__name__)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    from fastapi import HTTPException
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# Track whether a cycle is already running so we don't pile up requests
_running = False


@router.get("/")
async def list_signals(
    db:          Annotated[AsyncSession, Depends(get_db)],
    signal_type: Optional[str] = Query(None),
    limit:       int           = Query(60, ge=1, le=200),
):
    """Return active market signals, newest first."""
    try:
        q = select(MarketSignal).where(MarketSignal.is_active.is_(True))
        if signal_type:
            q = q.where(MarketSignal.signal_type == signal_type.upper())
        q = q.order_by(MarketSignal.published_at.desc()).limit(limit)
        result = await db.execute(q)
        return [_serialize(s) for s in result.scalars().all()]
    except Exception as e:
        logger.exception("list_signals failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


async def _run_in_background():
    global _running
    if _running:
        logger.info("Signals cycle already running — skipping")
        return
    _running = True
    try:
        from app.intelligence.signals_engine import run_signals_cycle
        count = await run_signals_cycle()
        logger.info("Background signals cycle complete — %d new", count)
    except Exception as e:
        logger.exception("Background signals cycle failed: %s", e)
    finally:
        _running = False


@router.post("/refresh")
async def refresh_signals(
    background_tasks: BackgroundTasks,
    admin: Annotated[User, Depends(require_admin)],
):
    """
    Kick off a signal fetch cycle in the background.
    Returns immediately — signals appear within ~30s as the worker completes.
    """
    if _running:
        return {"ok": True, "status": "already_running", "new_signals": None}
    background_tasks.add_task(_run_in_background)
    return {"ok": True, "status": "started", "new_signals": None}


@public_router.get("/status")
async def signals_status(db: Annotated[AsyncSession, Depends(get_db)]):
    """Returns signal counts by type for health checking."""
    try:
        result = await db.execute(
            text("SELECT signal_type, COUNT(*) FROM market_signals WHERE is_active GROUP BY signal_type")
        )
        rows = result.fetchall()
        return {
            "ok":     True,
            "counts": {r[0]: r[1] for r in rows},
            "total":  sum(r[1] for r in rows),
            "cycle_running": _running,
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "cycle_running": _running}


@router.get("/debug")
async def debug_signals(admin: Annotated[User, Depends(require_admin)]):
    """
    Run each signal source and return counts + errors without saving to DB.
    Use this to diagnose why signals aren't appearing.
    """
    import traceback
    from app.intelligence.signals_engine import (
        fetch_edgar_deals,
        fetch_edgar_insider_buys,
        fetch_edgar_insider_sells,
        fetch_news_signals,
    )

    results = {}

    for name, coro in [
        ("edgar_deals",      fetch_edgar_deals()),
        ("edgar_insider_buy", fetch_edgar_insider_buys()),
        ("edgar_insider_sell", fetch_edgar_insider_sells()),
        ("news",             fetch_news_signals()),
    ]:
        try:
            items = await coro
            results[name] = {
                "count":   len(items),
                "sample":  [{"company": i.company, "headline": i.headline[:80], "type": i.signal_type}
                            for i in items[:3]],
                "error":   None,
            }
        except Exception as e:
            results[name] = {"count": 0, "sample": [], "error": traceback.format_exc()[-500:]}

    return results


import re

_TICKER_RE = re.compile(
    r'(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})'
    r'|\$([A-Z]{2,5})\b'
    r'|\(([A-Z]{2,5})\)(?=[\s,.])',
    re.ASCII,
)
_TICKER_CTX_RE = re.compile(
    r'\b([A-Z]{2,5})\s+(?:stock|shares|earnings)\b',
    re.ASCII,
)

def _extract_ticker_from_text(text: str) -> str | None:
    m = _TICKER_RE.search(text)
    if m:
        return next((g for g in m.groups() if g), None)
    m2 = _TICKER_CTX_RE.search(text)
    if m2:
        return m2.group(1)
    return None


def _serialize(s: MarketSignal) -> dict:
    # If ticker wasn't extracted at ingestion time, try extracting from headline+company
    ticker = s.ticker
    if not ticker:
        ticker = _extract_ticker_from_text(f"{s.headline or ''} {s.company or ''}")
    return {
        "id":           str(s.id),
        "signal_type":  s.signal_type,
        "ticker":       ticker,
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
