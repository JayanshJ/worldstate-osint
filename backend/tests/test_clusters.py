"""Cluster endpoint tests."""
import uuid
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import EventCluster


@pytest.mark.asyncio
async def test_list_clusters_unauthenticated(client: AsyncClient):
    res = await client.get("/api/v1/clusters/")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_list_clusters_authenticated_empty(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/clusters/", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_list_clusters_returns_labeled_only(client: AsyncClient, db: AsyncSession, auth_headers: dict):
    # Unlabeled cluster — should be filtered when labeled_only=true (default)
    unlabeled = EventCluster(
        id=uuid.uuid4(),
        label=None,
        volatility=0.5,
        weighted_score=3.0,
        first_seen_at=datetime.utcnow(),
        last_updated_at=datetime.utcnow(),
    )
    labeled = EventCluster(
        id=uuid.uuid4(),
        label="Test Event",
        volatility=0.7,
        weighted_score=4.0,
        first_seen_at=datetime.utcnow(),
        last_updated_at=datetime.utcnow(),
    )
    db.add(unlabeled)
    db.add(labeled)
    await db.flush()

    res = await client.get("/api/v1/clusters/?labeled_only=true", headers=auth_headers)
    assert res.status_code == 200
    ids = [c["id"] for c in res.json()]
    assert str(labeled.id) in ids
    assert str(unlabeled.id) not in ids


@pytest.mark.asyncio
async def test_get_cluster_not_found(client: AsyncClient, auth_headers: dict):
    res = await client.get(f"/api/v1/clusters/{uuid.uuid4()}", headers=auth_headers)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_cluster_found(client: AsyncClient, db: AsyncSession, auth_headers: dict):
    cluster = EventCluster(
        id=uuid.uuid4(),
        label="Specific Event",
        volatility=0.8,
        weighted_score=5.0,
        first_seen_at=datetime.utcnow(),
        last_updated_at=datetime.utcnow(),
    )
    db.add(cluster)
    await db.flush()

    res = await client.get(f"/api/v1/clusters/{cluster.id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["id"] == str(cluster.id)
    assert res.json()["label"] == "Specific Event"
