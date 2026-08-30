import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.routes import alerts, clusters, company, feed, metals, orgs, search, stats, strategies, websocket, research
from app.api.routes.strategies import public_router as strategies_public_router
from app.api.routes import supply_chain, auth
from app.api.routes import admin
from app.api.routes import digest, watchlist
from app.api.routes import server as server_routes
from app.api.routes import live
from app.api.routes import signals
from app.api.routes.signals import public_router as signals_public_router
from app.api.routes import briefing as briefing_routes
from app.models.briefing import MorningBriefing  # noqa: F401 — registers briefing table
from app.api.routes.metals import start_metals_background
from app.core.config import get_settings
from app.core.database import engine
from app.middleware.audit import audit_middleware
from app.middleware.rate_limit import limiter
from app.models.alert import AlertWatch  # noqa: F401 — registers alert tables with Base
from app.models.article import Base
from app.models.audit_log import AuditLog  # noqa: F401 — registers audit_logs with Base
from app.models.strategy import MarketStrategy  # noqa: F401 — registers table with Base
from app.models.supply_chain import SCCompany, SCEdge  # noqa: F401 — registers SC tables
from app.models.organization import Organization  # noqa: F401 — registers org table with Base
from app.models.user import User  # noqa: F401 — registers users table with Base
from app.models.signal import MarketSignal  # noqa: F401 — registers market_signals table

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("WorldState API starting up...")
    # Start the Redis pub/sub → WebSocket fan-out listener as a managed
    # background task. Earlier this used the deprecated @router.on_event
    # ("startup") hook and was never cancelled on shutdown (task leak).
    from app.api.routes.websocket import redis_listener
    listener_task = asyncio.create_task(redis_listener())
    await start_metals_background()

    # Schedule daily audit-log purge (90-day retention per privacy policy)
    async def _purge_audit_loop():
        from sqlalchemy import text
        from app.core.database import AsyncSessionLocal
        while True:
            await asyncio.sleep(86400)  # 24 hours
            try:
                async with AsyncSessionLocal() as db:
                    await db.execute(text("SELECT purge_old_audit_logs()"))
                    await db.commit()
                logger.info("Audit logs purged (90-day retention)")
            except Exception as e:
                logger.warning("Audit purge failed: %s", e)

    purge_task = asyncio.create_task(_purge_audit_loop())

    yield
    logger.info("WorldState API shutting down...")
    listener_task.cancel()
    purge_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        pass
    try:
        await purge_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


app = FastAPI(
    title="WorldState API",
    description="Real-Time OSINT Intelligence Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Rate limiting ──────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Audit logging middleware ───────────────────────────────────────────────
app.add_middleware(BaseHTTPMiddleware, dispatch=audit_middleware)

# ── CORS ──────────────────────────────────────────────────────────────────
def _cors_origins() -> list[str]:
    raw = settings.cors_origins.strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    # Fail closed: development defaults to localhost; production allows nothing
    # unless explicitly configured. Never combine credentials with a wildcard.
    if settings.environment == "development":
        return ["http://localhost", "http://localhost:8080", "http://127.0.0.1:8080"]
    return []


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,           prefix="/auth",              tags=["auth"])
app.include_router(admin.router,          prefix="/admin",             tags=["admin"])
app.include_router(server_routes.router,  prefix="/admin/server",      tags=["server"])
app.include_router(orgs.router,           prefix="/api/v1/orgs",       tags=["orgs"])
app.include_router(clusters.router,       prefix="/api/v1/clusters",   tags=["clusters"])
app.include_router(metals.router,         prefix="/api/v1/metals",     tags=["metals"])
app.include_router(feed.router,           prefix="/api/v1/feed",       tags=["feed"])
app.include_router(search.router,         prefix="/api/v1/search",     tags=["search"])
app.include_router(alerts.router,         prefix="/api/v1/alerts",     tags=["alerts"])
app.include_router(stats.router,          prefix="/api/v1/stats",      tags=["stats"])
app.include_router(strategies.router,         prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(strategies_public_router,  prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(supply_chain.router,   prefix="/api/v1/splc",       tags=["supply-chain"])
app.include_router(company.router,        prefix="/api/v1/company",    tags=["company"])
app.include_router(research.router,       prefix="/api/v1/research",   tags=["research"])
app.include_router(digest.router,         prefix="/api/v1/digest",     tags=["digest"])
app.include_router(watchlist.router,      prefix="/api/v1/watchlist",  tags=["watchlist"])
app.include_router(live.router,           prefix="/api/v1/live",       tags=["live"])
app.include_router(signals.router,        prefix="/api/v1/signals",     tags=["signals"])
app.include_router(signals_public_router, prefix="/api/v1/signals",     tags=["signals"])
app.include_router(briefing_routes.router, prefix="/api/v1/briefing",   tags=["briefing"])
app.include_router(websocket.router,                                    tags=["websocket"])


@app.get("/health")
async def health(request: Request):
    """Health check — also verifies DB connectivity."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    db_ok = False
    err = None
    try:
        async with AsyncSessionLocal() as s:
            await s.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        err = str(e)
        logger.warning("Health check DB probe failed: %s", err)
    status = "ok" if db_ok else "degraded"
    return JSONResponse(
        content={
            "status": status,
            "service": "worldstate-api",
            "db": db_ok,
            **({"error": err} if err and settings.environment != "production" else {}),
        },
        status_code=200 if db_ok else 503,
    )
