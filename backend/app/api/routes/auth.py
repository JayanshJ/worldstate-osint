"""
Auth routes — register / login / me
"""
import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import delete as sql_delete, func, select, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models.organization import Organization
from app.models.user import User

router = APIRouter()
settings = get_settings()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _email_to_slug(email: str) -> str:
    local = email.split("@")[0]
    slug = re.sub(r"[^a-z0-9]+", "-", local.lower()).strip("-")
    return slug or "org"


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    is_first = user_count == 0

    # Security: the first user becomes admin. To prevent a stranger hitting
    # /auth/register on a fresh public deployment from seizing the super-admin
    # seat, the first claim is restricted to a configured bootstrap email.
    # In test mode registration stays open so fixtures can create users freely.
    if is_first and settings.environment != "test":
        if settings.bootstrap_admin_email and body.email.lower() != settings.bootstrap_admin_email.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Registration is invite-only. Ask an administrator for an invitation.",
            )
    elif not is_first and settings.environment != "test":
        # Self-registration is disabled; users join via POST /api/v1/orgs/me/invite.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is invite-only. Ask an administrator for an invitation.",
        )

    # Auto-create a personal organisation for the new user
    base_slug = _email_to_slug(body.email)
    slug = base_slug
    counter = 1
    while (await db.execute(select(Organization).where(Organization.slug == slug))).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(name=f"{body.email.split('@')[0]}'s Org", slug=slug)
    db.add(org)
    await db.flush()

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        org_id=org.id,
        is_admin=is_first,
        is_approved=is_first,
    )
    db.add(user)
    await db.flush()
    await db.commit()
    return {
        "id": str(user.id), "email": user.email,
        "org_id": str(org.id), "created_at": user.created_at,
        "is_approved": user.is_approved,
    }


@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is pending approval. An admin will review your request shortly.")
    return TokenResponse(access_token=create_access_token(sub=user.email, org_id=user.org_id))


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id":         str(user.id),
        "email":      user.email,
        "is_admin":   user.is_admin,
        "org_id":     str(user.org_id) if user.org_id else None,
        "created_at": user.created_at,
    }


@router.delete("/me", status_code=204)
async def delete_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GDPR right-to-erasure: permanently deletes the calling user's account."""
    from app.models.alert import AlertWatch
    from app.models.organization import Organization
    from app.models.audit_log import AuditLog

    # Remove only the alerts this user owns (not the whole org's — other
    # members keep their watches). AlertWatch.created_by is SET NULL on user
    # delete, so we delete explicitly to honour erasure intent.
    await db.execute(sql_delete(AlertWatch).where(AlertWatch.created_by == user.id))
    # Scrub PII from audit logs (GDPR right-to-erasure)
    await db.execute(
        sql_update(AuditLog)
        .where(AuditLog.user_email == user.email)
        .values(user_email="[deleted]")
    )
    # Remove the user record
    await db.execute(sql_delete(User).where(User.id == user.id))
    # If the org is now empty, remove it too
    remaining = (
        await db.execute(
            select(func.count()).select_from(User).where(User.org_id == user.org_id)
        )
    ).scalar() or 0
    if remaining == 0 and user.org_id:
        await db.execute(sql_delete(Organization).where(Organization.id == user.org_id))
    await db.commit()
