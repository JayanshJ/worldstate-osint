from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


def utcnow() -> datetime:
    """Timezone-aware UTC now. Use this in model defaults instead of the
    deprecated, tz-naive `datetime.utcnow`."""
    return datetime.now(timezone.utc)

settings = get_settings()

# SQLite (used in tests via aiosqlite) does not accept pool_size/max_overflow
# and uses StaticPool for a single shared connection. Only apply pooling kwargs
# for real PostgreSQL deployments.
#
# Sizing note: every process (api uvicorn workers + ingestion + cluster worker)
# opens its own pool. With 4 uvicorn workers + 2 worker containers, a pool of
# 10+20=30 each yields ~180 potential connections vs Postgres' default
# max_connections=100. Keep the per-process pool small; rely on async I/O for
# concurrency within a process rather than many blocked connections. For higher
# fan-out, run behind pgbouncer (connection-pooling mode).
_is_sqlite = settings.database_url.startswith("sqlite")

_engine_kwargs: dict = {"echo": settings.environment == "development"}
if not _is_sqlite:
    _engine_kwargs.update(pool_size=5, max_overflow=5, pool_pre_ping=True)

engine = create_async_engine(settings.database_url, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Only commit if the session has pending writes — avoids
            # unnecessary commits on read-only GET endpoints.
            if session.new or session.dirty or session.deleted:
                await session.commit()
        except Exception:
            await session.rollback()
            raise
