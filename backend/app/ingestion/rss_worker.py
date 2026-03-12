"""
RSS Ingestion Worker

Polls all RSS_SOURCES on a configurable interval. For each new item:
  1. Normalizes the article metadata
  2. Runs Layer-1 hash dedup
  3. Persists to raw_articles
  4. Enqueues article_id for the vectorization pipeline
"""

import asyncio
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import httpx

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate, compute_content_hash
from app.ingestion.sources import RSS_SOURCES, Source
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

# Track last-seen entry GUIDs per source to avoid re-processing
_seen_guids: dict[str, set[str]] = {}


def _parse_date(entry: feedparser.FeedParserDict) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    published = getattr(entry, "published", None)
    if published:
        try:
            return parsedate_to_datetime(published).astimezone(timezone.utc)
        except Exception:
            pass
    return None


def _extract_body(entry: feedparser.FeedParserDict) -> str:
    """Pull the best available text from an RSS entry."""
    for field in ("summary", "description", "content"):
        val = getattr(entry, field, None)
        if val:
            if isinstance(val, list):
                # feedparser content list
                return val[0].get("value", "") if val else ""
            return str(val)
    return ""


async def fetch_feed(source: Source, client: httpx.AsyncClient) -> list[dict]:
    """Fetch and parse a single RSS feed, returning new normalized items."""
    try:
        resp = await client.get(source.url, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("RSS fetch failed for %s: %s", source.id, e)
        return []

    feed = feedparser.parse(resp.text)
    seen = _seen_guids.setdefault(source.id, set())
    items = []

    for entry in feed.entries:
        guid = getattr(entry, "id", None) or getattr(entry, "link", "")
        if not guid or guid in seen:
            continue
        seen.add(guid)

        title = getattr(entry, "title", "").strip()
        if not title:
            continue

        items.append({
            "source_id": source.id,
            "source_type": "rss",
            "url": getattr(entry, "link", None),
            "title": title,
            "body": _extract_body(entry),
            "published_at": _parse_date(entry),
            "raw_json": {"guid": guid},
            "credibility_score": source.credibility,
        })

    return items


async def persist_articles(items: list[dict]) -> list[str]:
    """Persist new articles to DB, skip duplicates. Returns list of new IDs."""
    new_ids: list[str] = []

    async with AsyncSessionLocal() as db:
        for item in items:
            content_hash = compute_content_hash(item["title"], item.get("body"))
            dedup = await check_duplicate(db, item["title"], item.get("body"))
            if dedup.is_duplicate:
                logger.debug("Duplicate skipped (layer %d): %s", dedup.layer, item["title"][:60])
                continue

            article = RawArticle(
                source_id=item["source_id"],
                source_type=item["source_type"],
                url=item.get("url"),
                title=item["title"],
                body=item.get("body"),
                published_at=item.get("published_at"),
                raw_json=item.get("raw_json"),
                content_hash=dedup.content_hash,
                credibility_score=item["credibility_score"],
            )
            db.add(article)
            try:
                await db.flush()
                new_ids.append(str(article.id))
                logger.info("Ingested: [%s] %s", item["source_id"], item["title"][:80])
            except Exception as e:
                await db.rollback()
                logger.debug("Persist error (likely race condition dup): %s", e)

        await db.commit()

    return new_ids


async def run_rss_cycle() -> None:
    """Single ingestion cycle across all RSS sources."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "WorldState-OSINT/1.0 (+https://worldstate.io)"},
        follow_redirects=True,
    ) as client:
        tasks = [fetch_feed(source, client) for source in RSS_SOURCES]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            logger.error("Feed error: %s", result)
        else:
            all_items.extend(result)

    logger.info("RSS cycle: %d candidate articles", len(all_items))
    new_ids = await persist_articles(all_items)

    # Enqueue for vectorization
    for article_id in new_ids:
        await enqueue_article(article_id)

    logger.info("RSS cycle complete: %d new articles queued", len(new_ids))


async def rss_worker_loop() -> None:
    """Continuous loop — runs on ingestion_interval_seconds."""
    logger.info("RSS worker started. Interval: %ds", settings.ingestion_interval_seconds)
    while True:
        try:
            await run_rss_cycle()
        except Exception as e:
            logger.error("RSS cycle unhandled error: %s", e, exc_info=True)
        await asyncio.sleep(settings.ingestion_interval_seconds)
