"""Market strategy endpoint tests."""
import uuid
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategy import MarketStrategy


@pytest.mark.asyncio
async def test_list_strategies_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/strategies/")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_list_strategies_authenticated_empty(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/strategies/", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_list_strategies_with_data(client: AsyncClient, db: AsyncSession, auth_headers: dict):
    strategy = MarketStrategy(
        id=uuid.uuid4(),
        title="Long Gold on Inflation Fears",
        thesis="Central banks signal rate cuts; gold benefits from real yield compression.",
        asset_class="COMMODITY",
        direction="LONG",
        risk_level="MEDIUM",
        time_horizon="1-4 weeks",
        is_active=True,
        generated_at=datetime.utcnow(),
    )
    db.add(strategy)
    await db.flush()

    res = await client.get("/api/v1/strategies/", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    titles = [s["title"] for s in data]
    assert "Long Gold on Inflation Fears" in titles


@pytest.mark.asyncio
async def test_inactive_strategies_excluded(client: AsyncClient, db: AsyncSession, auth_headers: dict):
    active = MarketStrategy(
        id=uuid.uuid4(),
        title="Active Strategy",
        is_active=True,
        generated_at=datetime.utcnow(),
    )
    inactive = MarketStrategy(
        id=uuid.uuid4(),
        title="Inactive Strategy",
        is_active=False,
        generated_at=datetime.utcnow(),
    )
    db.add(active)
    db.add(inactive)
    await db.flush()

    res = await client.get("/api/v1/strategies/", headers=auth_headers)
    assert res.status_code == 200
    titles = [s["title"] for s in res.json()]
    assert "Active Strategy" in titles
    assert "Inactive Strategy" not in titles
