"""Supply chain endpoint tests."""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supply_chain import SCCompany


@pytest.mark.asyncio
async def test_list_analysed_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/splc/")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_list_analysed_empty(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/splc/", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_get_nonexistent_ticker(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/splc/ZZNOTREAL", headers=auth_headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_existing_ticker(client: AsyncClient, db: AsyncSession, auth_headers: dict):
    from datetime import date
    company = SCCompany(
        id=uuid.uuid4(),
        ticker="TESTCO",
        legal_name="Test Company Inc.",
        hq_country="USA",
        sector="Technology",
        last_filing_date=date.today(),
    )
    db.add(company)
    await db.flush()

    res = await client.get("/api/v1/splc/TESTCO", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["company"]["ticker"] == "TESTCO"
    assert data["edges"] == []


@pytest.mark.asyncio
async def test_search_companies_with_auth(client: AsyncClient, auth_headers: dict):
    mock_results = [{"ticker": "AAPL", "name": "Apple Inc.", "cik": "0000320193"}]
    with patch(
        "app.api.routes.supply_chain.search_companies_by_name",
        new=AsyncMock(return_value=mock_results),
    ):
        res = await client.get("/api/v1/splc/search?q=apple", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()[0]["ticker"] == "AAPL"


@pytest.mark.asyncio
async def test_search_companies_without_auth(client: AsyncClient):
    res = await client.get("/api/v1/splc/search?q=apple")
    assert res.status_code == 401
