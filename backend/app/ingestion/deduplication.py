"""
Deduplication Engine — two-layer approach:

  Layer 1 (FAST): SHA-256 hash of normalized (title + body[:500])
                  Catches exact and near-exact reposts. O(1) DB lookup.

  Layer 2 (SEMANTIC): Cosine similarity against recent embeddings.
                      Catches paraphrased / reworded duplicates.
                      Only runs if Layer 1 passes.
"""

import hashlib
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.article import ArticleEmbedding, RawArticle

settings = get_settings()


# ─── Normalization ────────────────────────────────────────────────────────

def normalize_text(text_input: str) -> str:
    """Lowercase, strip punctuation/extra whitespace, normalize unicode."""
    text_input = unicodedata.normalize("NFKD", text_input)
    text_input = text_input.lower()
    text_input = re.sub(r"[^\w\s]", " ", text_input)
    text_input = re.sub(r"\s+", " ", text_input).strip()
    return text_input


def compute_content_hash(title: str, body: str | None = None) -> str:
    """SHA-256 of normalized title + first 500 chars of body."""
    normalized = normalize_text(title)
    if body:
        normalized += " " + normalize_text(body[:500])
    return hashlib.sha256(normalized.encode()).hexdigest()


# ─── Layer 1: Hash-based dedup ────────────────────────────────────────────

async def is_hash_duplicate(db: AsyncSession, content_hash: str) -> bool:
    result = await db.execute(
        select(RawArticle.id).where(RawArticle.content_hash == content_hash).limit(1)
    )
    return result.scalar_one_or_none() is not None


# ─── Layer 2: Semantic dedup ──────────────────────────────────────────────

async def find_semantic_duplicate(
    db: AsyncSession,
    embedding: list[float],
    within_hours: int = 24,
) -> uuid.UUID | None:
    """
    Return the article_id of a near-duplicate if cosine similarity
    exceeds the threshold, else None.
    Only checks articles ingested within the last `within_hours`.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=within_hours)
    threshold = settings.dedup_similarity_threshold

    # pgvector cosine similarity: 1 - (embedding <=> query_vec)
    # We use a raw query for the vector operator
    result = await db.execute(
        text("""
            SELECT ae.article_id,
                   1 - (ae.embedding <=> CAST(:vec AS vector)) AS similarity
            FROM   article_embeddings ae
            JOIN   raw_articles ra ON ra.id = ae.article_id
            WHERE  ra.ingested_at >= :since
            ORDER  BY ae.embedding <=> CAST(:vec AS vector)
            LIMIT  1
        """),
        {
            "vec": str(embedding),   # pgvector accepts '[0.1, 0.2, ...]' format
            "since": since,
        },
    )
    row = result.fetchone()
    if row and row.similarity >= threshold:
        return row.article_id
    return None


# ─── Facade ───────────────────────────────────────────────────────────────

class DeduplicationResult:
    __slots__ = ("is_duplicate", "duplicate_id", "layer", "content_hash")

    def __init__(
        self,
        is_duplicate: bool,
        duplicate_id: uuid.UUID | None = None,
        layer: int = 0,
        content_hash: str = "",
    ):
        self.is_duplicate = is_duplicate
        self.duplicate_id = duplicate_id
        self.layer = layer
        self.content_hash = content_hash


async def check_duplicate(
    db: AsyncSession,
    title: str,
    body: str | None,
    embedding: list[float] | None = None,
) -> DeduplicationResult:
    """Run both dedup layers. Return result with is_duplicate flag."""
    content_hash = compute_content_hash(title, body)

    # Layer 1
    if await is_hash_duplicate(db, content_hash):
        return DeduplicationResult(True, layer=1, content_hash=content_hash)

    # Layer 2 (only if embedding provided)
    if embedding:
        dup_id = await find_semantic_duplicate(db, embedding)
        if dup_id:
            return DeduplicationResult(True, duplicate_id=dup_id, layer=2, content_hash=content_hash)

    return DeduplicationResult(False, content_hash=content_hash)
