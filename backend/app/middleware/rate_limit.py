"""Per-user rate limiting via slowapi.

Key function: JWT sub (user email) when authenticated, else IP address.
Global limit: 300 requests/minute.
Heavy endpoints (SPLC analyse, research entity) use tighter per-route limits
applied via the `limiter` object exported from here.
"""
from fastapi import Request
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_ALGORITHM = "HS256"


def _user_or_ip(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            settings = get_settings()
            payload = jwt.decode(
                auth[7:], settings.jwt_secret_key, algorithms=[_ALGORITHM]
            )
            sub = payload.get("sub")
            if sub:
                return sub
        except (JWTError, ValueError):
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_user_or_ip, default_limits=["300/minute"])
