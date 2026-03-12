"""
Reddit Ingestion Worker

Uses PRAW (Python Reddit API Wrapper) in async mode.
Monitors configured subreddits for hot/new posts.
"""

import asyncio
import logging
from datetime import datetime, timezone

import asyncpraw

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate, compute_content_hash
from app.ingestion.sources import REDDIT_SOURCES
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

_seen_reddit_ids: set[str] = set()


async def fetch_subreddit(reddit: asyncpraw.Reddit, source_config: dict) -> list[dict]:
    subreddit_name: str = source_config["extra"]["subreddit"]
    limit: int = source_config["extra"].get("limit", 25)
    credibility: float = source_config["credibility"]
    source_id: str = source_config["id"]

    try:
        subreddit = await reddit.subreddit(subreddit_name)
        items = []
        async for submission in subreddit.hot(limit=limit):
            if submission.id in _seen_reddit_ids:
                continue
            _seen_reddit_ids.add(submission.id)

            # Skip stickied mod posts and very low-score submissions
            if submission.stickied or submission.score < 10:
                continue

            body = submission.selftext[:2000] if submission.selftext else ""
            items.append({
                "source_id": source_id,
                "source_type": "reddit",
                "url": f"https://reddit.com{submission.permalink}",
                "title": submission.title,
                "body": body,
                "published_at": datetime.fromtimestamp(submission.created_utc, tz=timezone.utc),
                "raw_json": {
                    "reddit_id": submission.id,
                    "score": submission.score,
                    "upvote_ratio": submission.upvote_ratio,
                    "num_comments": submission.num_comments,
                    "external_url": submission.url,
                },
                "credibility_score": credibility,
            })
        return items
    except Exception as e:
        logger.warning("Reddit fetch failed for r/%s: %s", subreddit_name, e)
        return []


async def run_reddit_cycle() -> None:
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        logger.debug("Reddit credentials not configured, skipping")
        return

    reddit = asyncpraw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent=settings.reddit_user_agent,
        read_only=True,
    )

    source_configs = [
        {"id": s.id, "extra": s.extra, "credibility": s.credibility}
        for s in REDDIT_SOURCES
    ]

    tasks = [fetch_subreddit(reddit, cfg) for cfg in source_configs]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            logger.error("Reddit source error: %s", result)
        else:
            all_items.extend(result)

    await reddit.close()

    logger.info("Reddit cycle: %d candidate articles", len(all_items))
    new_ids: list[str] = []

    async with AsyncSessionLocal() as db:
        for item in all_items:
            dedup = await check_duplicate(db, item["title"], item.get("body"))
            if dedup.is_duplicate:
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
            except Exception:
                await db.rollback()

        await db.commit()

    for article_id in new_ids:
        await enqueue_article(article_id)

    logger.info("Reddit cycle complete: %d new articles queued", len(new_ids))


async def reddit_worker_loop() -> None:
    logger.info("Reddit worker started. Interval: %ds", settings.ingestion_interval_seconds)
    while True:
        try:
            await run_reddit_cycle()
        except Exception as e:
            logger.error("Reddit cycle error: %s", e, exc_info=True)
        await asyncio.sleep(settings.ingestion_interval_seconds)
