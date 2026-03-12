"""
Alert Watch CRUD API
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.alert import AlertFiring, AlertWatch

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────

class WatchCreate(BaseModel):
    name:           str         = Field(min_length=1, max_length=200)
    keywords:       list[str] | None = None
    entities:       list[str] | None = None
    source_ids:     list[str] | None = None
    min_volatility: float            = Field(default=0.0, ge=0.0, le=1.0)
    min_sources:    int              = Field(default=1, ge=1)
    channel:        str              = Field(default="websocket")


class WatchOut(BaseModel):
    id:             str
    name:           str
    keywords:       list[str] | None
    entities:       list[str] | None
    source_ids:     list[str] | None
    min_volatility: float
    min_sources:    int
    is_active:      bool
    created_at:     str | None
    last_fired_at:  str | None
    fire_count:     int
    channel:        str


def _to_out(w: AlertWatch) -> WatchOut:
    return WatchOut(
        id=str(w.id),
        name=w.name,
        keywords=w.keywords,
        entities=w.entities,
        source_ids=w.source_ids,
        min_volatility=w.min_volatility,
        min_sources=w.min_sources,
        is_active=w.is_active,
        created_at=w.created_at.isoformat() if w.created_at else None,
        last_fired_at=w.last_fired_at.isoformat() if w.last_fired_at else None,
        fire_count=w.fire_count,
        channel=w.channel,
    )


# ─── Routes ───────────────────────────────────────────────────────────────

@router.get("/", response_model=list[WatchOut])
async def list_watches(db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(AlertWatch).order_by(AlertWatch.created_at.desc()))
    return [_to_out(w) for w in result.scalars().all()]


@router.post("/", response_model=WatchOut, status_code=201)
async def create_watch(
    body: WatchCreate,
    db:   Annotated[AsyncSession, Depends(get_db)],
):
    if not any([body.keywords, body.entities, body.source_ids]):
        raise HTTPException(400, "Provide at least one of: keywords, entities, source_ids")

    watch = AlertWatch(**body.model_dump())
    db.add(watch)
    await db.flush()
    await db.commit()
    return _to_out(watch)


@router.patch("/{watch_id}/toggle", response_model=WatchOut)
async def toggle_watch(
    watch_id: uuid.UUID,
    db:       Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AlertWatch).where(AlertWatch.id == watch_id))
    watch = result.scalar_one_or_none()
    if not watch:
        raise HTTPException(404, "Watch not found")
    watch.is_active = not watch.is_active
    await db.commit()
    return _to_out(watch)


@router.delete("/{watch_id}", status_code=204)
async def delete_watch(
    watch_id: uuid.UUID,
    db:       Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(AlertWatch).where(AlertWatch.id == watch_id))
    watch = result.scalar_one_or_none()
    if not watch:
        raise HTTPException(404, "Watch not found")
    await db.delete(watch)
    await db.commit()


@router.get("/{watch_id}/firings")
async def get_firings(
    watch_id: uuid.UUID,
    db:       Annotated[AsyncSession, Depends(get_db)],
    limit:    int = 20,
):
    result = await db.execute(
        select(AlertFiring)
        .where(AlertFiring.watch_id == watch_id)
        .order_by(AlertFiring.fired_at.desc())
        .limit(limit)
    )
    firings = result.scalars().all()
    return [
        {
            "id":         str(f.id),
            "cluster_id": str(f.cluster_id),
            "fired_at":   f.fired_at.isoformat(),
            "payload":    f.payload,
        }
        for f in firings
    ]
