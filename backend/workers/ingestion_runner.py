"""
Ingestion Worker Entry Point

Runs RSS, Reddit, and Playwright workers concurrently.
"""

import asyncio
import logging

from app.core.config import get_settings
from app.ingestion.gdelt_worker import gdelt_worker_loop
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
    # Run all ingestion workers concurrently.
    # Vectorization runs as N parallel consumers (each is an independent asyncio
    # task pulling from the same Redis queue:vectorize) to keep up with the
    # ingestion rate — a single consumer is capped at ~20-30 articles/min by
    # the sequential OpenAI embedding round-trip.
    n_vec = max(1, settings.vectorization_workers)
    vec_tasks = [vectorization_worker_loop() for _ in range(n_vec)]
    await asyncio.gather(
        rss_worker_loop(),
        reddit_worker_loop(),
        playwright_worker_loop(),
        gdelt_worker_loop(),
        *vec_tasks,
    )


if __name__ == "__main__":
    asyncio.run(main())
