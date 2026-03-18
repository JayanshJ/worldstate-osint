"""Request audit-log middleware.

Every API request is written to `audit_logs` asynchronously so it never
adds latency to the response path. Health-check requests are skipped.
"""
import time
import uuid
from typing import Callable

from fastapi import Request, Response
from jose import JWTError, jwt
from sqlalchemy import insert

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.audit_log import AuditLog

_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}
_ALGORITHM = "HS256"


async def audit_middleware(request: Request, call_next: Callable) -> Response:
    """Starlette-compatible middleware that logs all non-health requests."""
    start = time.monotonic()
    response: Response = await call_next(request)
    latency_ms = int((time.monotonic() - start) * 1000)

    path = request.url.path
    if path in _SKIP_PATHS or path.startswith("/static"):
        return response

    # --- extract user info from bearer token (best-effort, never blocks) ---
    user_email: str | None = None
    org_id: uuid.UUID | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            settings = get_settings()
            payload = jwt.decode(
                auth_header[7:], settings.jwt_secret_key, algorithms=[_ALGORITHM]
            )
            user_email = payload.get("sub")
            raw_org = payload.get("org_id")
            if raw_org:
                org_id = uuid.UUID(raw_org)
        except (JWTError, ValueError):
            pass

    ip = request.client.host if request.client else None

    # --- fire-and-forget DB insert ---
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                insert(AuditLog).values(
                    org_id=org_id,
                    user_email=user_email,
                    method=request.method,
                    path=path,
                    status_code=response.status_code,
                    latency_ms=latency_ms,
                    ip_address=ip,
                )
            )
            await session.commit()
    except Exception:
        pass  # never let audit failure affect the response

    return response
