"""
Morning Briefing REST API

GET  /api/v1/briefing/        — today's briefing (or most recent)
POST /api/v1/briefing/refresh — force-regenerate today's briefing
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.briefing import MorningBriefing

router = APIRouter(dependencies=[Depends(get_current_user)])


def _serialize(b: MorningBriefing) -> dict:
    return {
        "id":           str(b.id),
        "date":         b.date.isoformat(),
        "headline":     b.headline,
        "tldr":         b.tldr,
        "top_events":   b.top_events,
        "trade_setups": b.trade_setups,
        "macro_theme":  b.macro_theme,
        "generated_at": b.generated_at.isoformat() if b.generated_at else None,
    }


@router.get("/")
async def get_briefing(db: AsyncSession = Depends(get_db)):
    """Return today's briefing, or the most recently generated one."""
    result = await db.execute(
        select(MorningBriefing).order_by(MorningBriefing.date.desc()).limit(1)
    )
    b = result.scalar_one_or_none()
    if not b:
        return None
    return _serialize(b)


@router.post("/refresh")
async def refresh_briefing(db: AsyncSession = Depends(get_db)):
    """Force-regenerate today's morning briefing."""
    from app.intelligence.briefing_engine import generate_morning_briefing
    b = await generate_morning_briefing(db, force=True)
    if not b:
        return {"ok": False, "detail": "Not enough clusters to generate briefing"}
    return {"ok": True, "briefing": _serialize(b)}
