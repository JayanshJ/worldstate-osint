"""
Organization management — GET /orgs/me, POST /orgs/invite
"""
import re
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, hash_password
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(dependencies=[Depends(get_current_user)])


# ─── Schemas ──────────────────────────────────────────────────────────────

class OrgOut(BaseModel):
    id:         str
    name:       str
    slug:       str
    created_at: str


class InviteIn(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=8)


class MemberOut(BaseModel):
    id:         str
    email:      str
    is_admin:   bool
    created_at: str


# ─── Routes ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=OrgOut)
async def get_my_org(
    db:   Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not user.org_id:
        raise HTTPException(404, "No organisation assigned to this account")
    result = await db.execute(select(Organization).where(Organization.id == user.org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organisation not found")
    return OrgOut(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        created_at=org.created_at.isoformat(),
    )


@router.get("/me/members", response_model=list[MemberOut])
async def list_members(
    db:   Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not user.org_id:
        raise HTTPException(404, "No organisation assigned to this account")
    result = await db.execute(select(User).where(User.org_id == user.org_id))
    members = result.scalars().all()
    return [
        MemberOut(
            id=str(m.id),
            email=m.email,
            is_admin=m.is_admin,
            created_at=m.created_at.isoformat(),
        )
        for m in members
    ]


@router.post("/me/invite", response_model=MemberOut, status_code=201)
async def invite_member(
    body: InviteIn,
    db:   Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Add a new user to the caller's organisation. Caller must belong to an org."""
    if not user.org_id:
        raise HTTPException(400, "You must belong to an organisation to invite members")
    if not user.is_admin:
        raise HTTPException(403, "Only org admins can invite members")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "A user with that email already exists")

    new_user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        org_id=user.org_id,
        is_admin=False,
        is_approved=True,  # invited by an org admin → pre-approved, can log in immediately
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return MemberOut(
        id=str(new_user.id),
        email=new_user.email,
        is_admin=new_user.is_admin,
        created_at=new_user.created_at.isoformat(),
    )
