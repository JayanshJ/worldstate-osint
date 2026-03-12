import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import alerts, clusters, feed, metals, search, stats, strategies, websocket
from app.api.routes.metals import start_metals_background
from app.core.config import get_settings
from app.core.database import engine
from app.models.alert import Base as AlertBase  # noqa: F401
from app.models.article import Base
from app.models.strategy import MarketStrategy  # noqa: F401 — registers table with Base

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("WorldState API starting up...")
    # Create tables if they don't exist (migrations handle prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(AlertBase.metadata.create_all)
    await start_metals_background()
    yield
    logger.info("WorldState API shutting down...")
    await engine.dispose()


app = FastAPI(
    title="WorldState API",
    description="Real-Time OSINT Intelligence Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.environment == "development" else ["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clusters.router,   prefix="/api/v1/clusters",   tags=["clusters"])
app.include_router(metals.router,     prefix="/api/v1/metals",     tags=["metals"])
app.include_router(feed.router,       prefix="/api/v1/feed",       tags=["feed"])
app.include_router(search.router,     prefix="/api/v1/search",     tags=["search"])
app.include_router(alerts.router,     prefix="/api/v1/alerts",     tags=["alerts"])
app.include_router(stats.router,      prefix="/api/v1/stats",      tags=["stats"])
app.include_router(strategies.router, prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(websocket.router,                                tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "worldstate-api"}
