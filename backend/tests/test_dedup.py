"""Deduplication logic tests (unit-level, no HTTP)."""
import hashlib
import uuid
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import RawArticle


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def _insert_article(db: AsyncSession, title: str, body: str = "") -> RawArticle:
    content_hash = _hash(f"{title}{body}")
    article = RawArticle(
        id=uuid.uuid4(),
        source_id="test_source",
        source_type="rss",
        title=title,
        body=body,
        content_hash=content_hash,
        credibility_score=0.8,
    )
    db.add(article)
    await db.flush()
    return article


@pytest.mark.asyncio
async def test_hash_dedup_first_article_not_duplicate(db: AsyncSession):
    """An article with a unique hash is not a duplicate."""
    from sqlalchemy import select
    h = _hash("Unique headline for dedup test")
    result = await db.execute(select(RawArticle).where(RawArticle.content_hash == h))
    assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_hash_dedup_exact_duplicate_detected(db: AsyncSession):
    """Inserting the same article twice violates the unique constraint on content_hash."""
    from sqlalchemy.exc import IntegrityError

    title = "Duplicate Article Title"
    await _insert_article(db, title)

    with pytest.raises(IntegrityError):
        await _insert_article(db, title)


@pytest.mark.asyncio
async def test_hash_dedup_different_title_not_duplicate(db: AsyncSession):
    """Two articles with different titles have different hashes and both insert fine."""
    a1 = await _insert_article(db, "First unique article ABC")
    a2 = await _insert_article(db, "Second unique article XYZ")
    assert a1.content_hash != a2.content_hash


@pytest.mark.asyncio
async def test_content_hash_format(db: AsyncSession):
    """content_hash is a 64-char hex string (SHA-256)."""
    article = await _insert_article(db, "Hash format test article")
    assert len(article.content_hash) == 64
    assert all(c in "0123456789abcdef" for c in article.content_hash)


@pytest.mark.asyncio
async def test_dedup_is_processed_default_false(db: AsyncSession):
    """Freshly inserted articles default to is_processed=False."""
    article = await _insert_article(db, "Processing flag test article")
    assert article.is_processed is False
