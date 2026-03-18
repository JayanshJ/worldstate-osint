"""
Admin API — super-admin only endpoints.

GET  /admin/orgs              — list all organisations with stats
GET  /admin/orgs/{id}         — single org detail
GET  /admin/usage             — daily API-call counts per org (last 30 days)
GET  /admin/audit             — paginated audit log
POST /admin/users/{id}/toggle-admin  — promote / demote user
DELETE /admin/orgs/{id}       — delete org + cascade
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.alert import AlertWatch
from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.user import User

router = APIRouter()


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Orgs ───────────────────────────────────────────────────────────────────

@router.get("/orgs")
async def list_orgs(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    orgs = (await db.execute(select(Organization).order_by(Organization.created_at.desc()))).scalars().all()

    result = []
    for org in orgs:
        user_count = (await db.execute(
            select(func.count()).select_from(User).where(User.org_id == org.id)
        )).scalar() or 0
        alert_count = (await db.execute(
            select(func.count()).select_from(AlertWatch).where(AlertWatch.org_id == org.id)
        )).scalar() or 0
        # API calls in last 24 h
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        api_calls_24h = (await db.execute(
            select(func.count()).select_from(AuditLog)
            .where(AuditLog.org_id == org.id, AuditLog.created_at >= since)
        )).scalar() or 0

        result.append({
            "id":            str(org.id),
            "name":          org.name,
            "slug":          org.slug,
            "created_at":    org.created_at.isoformat() if org.created_at else None,
            "user_count":    user_count,
            "alert_count":   alert_count,
            "api_calls_24h": api_calls_24h,
        })
    return result


@router.get("/orgs/{org_id}")
async def get_org(
    org_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organisation not found")

    users = (await db.execute(select(User).where(User.org_id == org_id))).scalars().all()
    return {
        "id":         str(org.id),
        "name":       org.name,
        "slug":       org.slug,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "users": [
            {"id": str(u.id), "email": u.email, "is_admin": u.is_admin, "created_at": u.created_at.isoformat() if u.created_at else None}
            for u in users
        ],
    }


@router.delete("/orgs/{org_id}", status_code=204)
async def delete_org(
    org_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organisation not found")
    await db.execute(delete(Organization).where(Organization.id == org_id))
    await db.commit()


# ── Usage ──────────────────────────────────────────────────────────────────

@router.get("/usage")
async def usage_by_org(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=1, le=90),
):
    """Daily call counts grouped by org for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(
            AuditLog.org_id,
            func.date_trunc("day", AuditLog.created_at).label("day"),
            func.count().label("calls"),
            func.avg(AuditLog.latency_ms).label("avg_latency_ms"),
        )
        .where(AuditLog.created_at >= since)
        .group_by(AuditLog.org_id, text("day"))
        .order_by(text("day desc"))
    )).all()

    return [
        {
            "org_id":         str(r.org_id) if r.org_id else None,
            "day":            r.day.date().isoformat() if r.day else None,
            "calls":          r.calls,
            "avg_latency_ms": round(r.avg_latency_ms or 0),
        }
        for r in rows
    ]


# ── Audit log ──────────────────────────────────────────────────────────────

@router.get("/audit")
async def audit_log(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit:  int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    org_id: uuid.UUID | None = Query(default=None),
    method: str | None = Query(default=None),
):
    q = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    if org_id:
        q = q.where(AuditLog.org_id == org_id)
    if method:
        q = q.where(AuditLog.method == method.upper())

    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id":           str(r.id),
            "org_id":       str(r.org_id) if r.org_id else None,
            "user_email":   r.user_email,
            "method":       r.method,
            "path":         r.path,
            "status_code":  r.status_code,
            "latency_ms":   r.latency_ms,
            "ip_address":   r.ip_address,
            "created_at":   r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ── Users ──────────────────────────────────────────────────────────────────

@router.post("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found")
    if str(target.id) == str(admin.id):
        raise HTTPException(400, "Cannot modify your own admin status")
    target.is_admin = not target.is_admin
    await db.commit()
    return {"id": str(target.id), "email": target.email, "is_admin": target.is_admin}
