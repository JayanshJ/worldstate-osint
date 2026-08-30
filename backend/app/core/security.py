from datetime import datetime, timedelta, timezone

import uuid

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db

settings = get_settings()

ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(sub: str, org_id: uuid.UUID | None = None) -> str:
    """Issue a JWT. Embeds org_id so audit/rate-limit middleware can attribute
    requests to an organisation without an extra DB lookup."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict = {"sub": sub, "exp": expire}
    if org_id is not None:
        payload["org_id"] = str(org_id)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode JWT and return the full payload. Raises HTTPException on any failure."""
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import User  # local import avoids circular dep at module load

    payload = decode_token(token)
    sub: str | None = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.email == sub))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending approval")
    return user


async def load_user_from_token(token: str, db: AsyncSession) -> "User | None":
    """Validate a raw bearer token and return the active, approved user.

    Used by non-HTTP auth paths (e.g. WebSocket) where we can't rely on FastAPI
    dependencies and must verify the user still exists and is approved.
    """
    from app.models.user import User

    try:
        payload = decode_token(token)
    except HTTPException:
        return None
    sub: str | None = payload.get("sub")
    if not sub:
        return None
    result = await db.execute(select(User).where(User.email == sub))
    user = result.scalar_one_or_none()
    if user is None or not user.is_approved:
        return None
    return user
