"""Auth endpoint tests."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    res = await client.post("/auth/register", json={"email": "new@test.com", "password": "secure123"})
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "new@test.com"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    await client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    res = await client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post("/auth/register", json={"email": "login@test.com", "password": "pass1234"})
    res = await client.post(
        "/auth/login",
        content="username=login@test.com&password=pass1234",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_bad_password(client: AsyncClient):
    await client.post("/auth/register", json={"email": "badpass@test.com", "password": "correct"})
    res = await client.post(
        "/auth/login",
        content="username=badpass@test.com&password=wrong",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    res = await client.post(
        "/auth/login",
        content="username=nobody@test.com&password=anything",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, auth_headers: dict):
    res = await client.get("/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "user@test.com"


@pytest.mark.asyncio
async def test_me_no_token(client: AsyncClient):
    res = await client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_invalid_token(client: AsyncClient):
    res = await client.get("/auth/me", headers={"Authorization": "Bearer invalidtoken"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_no_token(client: AsyncClient):
    res = await client.get("/api/v1/clusters/")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_with_valid_token(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/clusters/", headers=auth_headers)
    assert res.status_code == 200
