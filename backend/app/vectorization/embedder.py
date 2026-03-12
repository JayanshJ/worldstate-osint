"""
Vectorization Pipeline

Consumes article IDs from the Redis queue, generates embeddings via
OpenAI text-embedding-3-small, then:
  1. Persists the embedding to article_embeddings
  2. Runs Layer-2 semantic dedup against recent embeddings
  3. Marks article as processed
  4. Publishes new_article event to Redis pub/sub for real-time UI
"""

import asyncio
import logging
import uuid

from openai import AsyncOpenAI
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import (
    CHANNEL_NEW_ARTICLE,
    dequeue_article,
    publish_event,
)
from app.ingestion.deduplication import find_semantic_duplicate
from app.models.article import ArticleEmbedding, RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None


def get_openai() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _build_embed_input(title: str, body: str | None) -> str:
    """
    Construct the text to embed.
    Title carries more semantic weight — we repeat it and prefix body.
    Truncate to ~8000 tokens (~6000 chars) to stay within model limits.
    """
    text = title
    if body:
        text += f"\n\n{body}"
    return text[:6000]


async def embed_text(text: str) -> list[float]:
    """Call OpenAI embedding API with retry on rate limit."""
    client = get_openai()
    for attempt in range(3):
        try:
            response = await client.embeddings.create(
                model=settings.embedding_model,
                input=text,
                dimensions=settings.embedding_dimensions,
            )
            return response.data[0].embedding
        except Exception as e:
            if attempt == 2:
                raise
            wait = 2 ** attempt
            logger.warning("Embed attempt %d failed: %s. Retrying in %ds", attempt + 1, e, wait)
            await asyncio.sleep(wait)


async def process_article(article_id: str) -> bool:
    """
    Full vectorization pipeline for a single article.
    Returns True if article was successfully processed (not a semantic dup).
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RawArticle).where(RawArticle.id == uuid.UUID(article_id))
        )
        article = result.scalar_one_or_none()
        if not article:
            logger.warning("Article %s not found in DB", article_id)
            return False

        if article.is_processed:
            logger.debug("Article %s already processed", article_id)
            return False

        # Generate embedding
        try:
            embed_input = _build_embed_input(article.title, article.body)
            embedding = await embed_text(embed_input)
        except Exception as e:
            logger.error("Embedding failed for %s: %s", article_id, e)
            return False

        # Layer 2 semantic dedup (now that we have the embedding)
        dup_id = await find_semantic_duplicate(db, embedding)
        if dup_id:
            logger.info(
                "Semantic duplicate detected: %s ≈ %s. Discarding.",
                article_id[:8], str(dup_id)[:8]
            )
            # Mark as processed so it's not retried
            await db.execute(
                update(RawArticle)
                .where(RawArticle.id == article.id)
                .values(is_processed=True)
            )
            await db.commit()
            return False

        # Persist embedding
        emb_record = ArticleEmbedding(
            article_id=article.id,
            embedding=embedding,
            model=settings.embedding_model,
        )
        db.add(emb_record)

        # Mark article as processed
        await db.execute(
            update(RawArticle)
            .where(RawArticle.id == article.id)
            .values(is_processed=True)
        )
        await db.commit()

        logger.info(
            "Vectorized [%s]: %s",
            article.source_id,
            article.title[:80],
        )

    # Publish to Redis pub/sub for real-time frontend updates
    await publish_event(CHANNEL_NEW_ARTICLE, {
        "article_id": article_id,
        "source_id": article.source_id,
        "title": article.title,
        "url": article.url,
        "published_at": article.published_at.isoformat() if article.published_at else None,
        "credibility_score": article.credibility_score,
    })

    return True


async def vectorization_worker_loop() -> None:
    """
    Continuous worker: blocks on Redis queue, processes articles one by one.
    For higher throughput, run multiple instances of this worker.
    """
    logger.info("Vectorization worker started. Listening on queue:vectorize")
    while True:
        try:
            article_id = await dequeue_article(timeout=5)
            if article_id:
                await process_article(article_id)
        except Exception as e:
            logger.error("Vectorization worker error: %s", e, exc_info=True)
            await asyncio.sleep(1)
