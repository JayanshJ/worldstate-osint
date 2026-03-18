"""
Test fixtures.

Uses an in-memory SQLite database so tests run without a real PostgreSQL instance.
pgvector columns (Vector) are not supported by SQLite — those tests mock at the DB level.
"""
import os

# Tell config.py we are in test mode so the validator doesn't require real API keys
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("JWT_SECRET_KEY", "testsecretkey1234567890abcdef1234")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Patch pgvector before any app module imports it
import unittest.mock as mock
mock.patch.dict("sys.modules", {"pgvector.sqlalchemy": mock.MagicMock()}).start()

from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.models.alert import AlertWatch, AlertFiring  # noqa — registers tables
from app.models.article import RawArticle, EventCluster, ClusterMember  # noqa — registers tables
from app.models.strategy import MarketStrategy  # noqa — registers tables
from app.models.supply_chain import SCCompany, SCEdge  # noqa — registers tables
from app.models.user import User

# ── SQLite in-memory engine ────────────────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once per test session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Per-test async session with automatic rollback."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db: AsyncSession):
    """Async HTTP test client with DB override."""
    from app.main import app

    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


# ── Auth helpers ───────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def regular_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="user@test.com",
        hashed_password=hash_password("password123"),
        is_admin=False,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def admin_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="admin@test.com",
        hashed_password=hash_password("adminpass123"),
        is_admin=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest_asyncio.fixture
def user_token(regular_user: User) -> str:
    return create_access_token(sub=regular_user.email)


@pytest_asyncio.fixture
def admin_token(admin_user: User) -> str:
    return create_access_token(sub=admin_user.email)


@pytest_asyncio.fixture
def auth_headers(user_token: str) -> dict:
    return {"Authorization": f"Bearer {user_token}"}


@pytest_asyncio.fixture
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}
