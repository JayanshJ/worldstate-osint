"""
GDELT Ingestion Worker

Polls the GDELT 2.0 article list API every 15 minutes for global news
from 50k+ sources. GDELT extracts events, actors, geolocation, and
sentiment — all available as free CSV/JSON.

Many GDELT articles will overlap with our curated RSS sources. The
existing 2-layer dedup (SHA-256 + cosine) handles this automatically.
"""

import asyncio
import csv
import io
import logging
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

GDELT_URL = (
    "https://api.gdeltproject.org/api/v2/art/art"
    "?format=csv&timespan=15min"
    "&sort=datedesc&maxrecords=250"
)

GDELT_CREDIBILITY = 0.60


async def run_gdelt_cycle() -> None:
    """Fetch and ingest the latest GDELT article batch."""
    try:
        async with httpx.AsyncClient(
            headers={"User-Agent": "WorldState-OSINT/1.0 (+https://worldstate.io)"},
            follow_redirects=True,
        ) as client:
            resp = await client.get(GDELT_URL, timeout=30)
            resp.raise_for_status()
    except Exception as e:
        logger.warning("GDELT fetch failed: %s", e)
        return

    try:
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
    except Exception as e:
        logger.warning("GDELT CSV parse failed: %s", e)
        return

    if not rows:
        logger.info("GDELT cycle: 0 articles (empty response)")
        return

    new_ids: list[str] = []
    async with AsyncSessionLocal() as db:
        for row in rows:
            title = (row.get("title") or "").strip()
            url = (row.get("url") or "").strip()
            if not title or not url:
                continue

            domain = (row.get("domain") or "").strip().lower()
            language = (row.get("language") or "").strip().lower()
            body = (row.get("description") or "").strip()

            dedup = await check_duplicate(db, title, body)
            if dedup.is_duplicate:
                continue

            article = RawArticle(
                source_id="gdelt",
                source_type="rss",
                url=url,
                title=title,
                body=body or None,
                published_at=datetime.now(timezone.utc),
                raw_json={
                    "domain": domain,
                    "language": language,
                    "source": row.get("source", ""),
                },
                content_hash=dedup.content_hash,
                credibility_score=GDELT_CREDIBILITY,
            )
            db.add(article)
            try:
                async with db.begin_nested():
                    await db.flush()
                new_ids.append(str(article.id))
            except Exception:
                pass

        await db.commit()

    for article_id in new_ids:
        await enqueue_article(article_id)

    logger.info("GDELT cycle: %d candidates, %d new articles", len(rows), len(new_ids))


async def gdelt_worker_loop() -> None:
    """Continuous loop — runs every 15 minutes."""
    INTERVAL = 900
    logger.info("GDELT worker started. Interval: %ds", INTERVAL)
    while True:
        try:
            await run_gdelt_cycle()
        except Exception as e:
            logger.error("GDELT cycle unhandled error: %s", e, exc_info=True)
        await asyncio.sleep(INTERVAL)