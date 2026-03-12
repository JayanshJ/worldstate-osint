"""
Ingestion Worker Entry Point

Runs RSS, Reddit, and Playwright workers concurrently.
"""

import asyncio
import logging

from app.core.config import get_settings
from app.ingestion.playwright_worker import playwright_worker_loop
from app.ingestion.reddit_worker import reddit_worker_loop
from app.ingestion.rss_worker import rss_worker_loop
from app.vectorization.embedder import vectorization_worker_loop

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


async def main():
    # Run all ingestion workers + vectorization in parallel
    await asyncio.gather(
        rss_worker_loop(),
        reddit_worker_loop(),
        playwright_worker_loop(),
        vectorization_worker_loop(),
        # Add more vectorization workers for higher throughput:
        # vectorization_worker_loop(),
    )


if __name__ == "__main__":
    asyncio.run(main())
