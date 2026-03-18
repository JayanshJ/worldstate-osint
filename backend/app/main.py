import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import alerts, clusters, company, feed, metals, orgs, search, stats, strategies, websocket, research
from app.api.routes import supply_chain, auth
from app.api.routes.metals import start_metals_background
from app.core.config import get_settings
from app.core.database import engine
from app.models.alert import AlertWatch  # noqa: F401 — registers alert tables with Base
from app.models.article import Base
from app.models.strategy import MarketStrategy  # noqa: F401 — registers table with Base
from app.models.supply_chain import SCCompany, SCEdge  # noqa: F401 — registers SC tables
from app.models.organization import Organization  # noqa: F401 — registers org table with Base
from app.models.user import User  # noqa: F401 — registers users table with Base

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("WorldState API starting up...")
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

app.include_router(auth.router,       prefix="/auth",              tags=["auth"])
app.include_router(orgs.router,       prefix="/api/v1/orgs",       tags=["orgs"])
app.include_router(clusters.router,   prefix="/api/v1/clusters",   tags=["clusters"])
app.include_router(metals.router,     prefix="/api/v1/metals",     tags=["metals"])
app.include_router(feed.router,       prefix="/api/v1/feed",       tags=["feed"])
app.include_router(search.router,     prefix="/api/v1/search",     tags=["search"])
app.include_router(alerts.router,     prefix="/api/v1/alerts",     tags=["alerts"])
app.include_router(stats.router,      prefix="/api/v1/stats",      tags=["stats"])
app.include_router(strategies.router,     prefix="/api/v1/strategies", tags=["strategies"])
app.include_router(supply_chain.router,   prefix="/api/v1/splc",       tags=["supply-chain"])
app.include_router(company.router,        prefix="/api/v1/company",    tags=["company"])
app.include_router(research.router,       prefix="/api/v1/research",   tags=["research"])
app.include_router(websocket.router,                                    tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "worldstate-api"}
