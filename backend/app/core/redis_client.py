import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _pool


# ─── Pub/Sub channel names ─────────────────────────────────────────────────
CHANNEL_NEW_ARTICLE     = "worldstate:new_article"
CHANNEL_CLUSTER_UPDATE  = "worldstate:cluster_update"
CHANNEL_BREAKING        = "worldstate:breaking"
CHANNEL_STRATEGY_UPDATE = "worldstate:strategy_update"


async def publish_event(channel: str, payload: dict[str, Any]) -> None:
    r = get_redis()
    await r.publish(channel, json.dumps(payload))


async def enqueue_article(article_id: str) -> None:
    """Push article ID onto the vectorization queue."""
    r = get_redis()
    await r.rpush("queue:vectorize", article_id)


async def dequeue_article(timeout: int = 5) -> str | None:
    """Blocking pop from vectorization queue."""
    r = get_redis()
    result = await r.blpop("queue:vectorize", timeout=timeout)
    return result[1] if result else None
