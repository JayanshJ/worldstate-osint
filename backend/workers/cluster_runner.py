"""
Clustering + Intelligence Worker Entry Point
"""

import asyncio
import logging

from app.core.config import get_settings
from app.intelligence.cluster_engine import cluster_worker_loop
from app.intelligence.strategy_engine import strategy_worker_loop

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


async def main():
    # Run cluster intelligence + strategy generation concurrently
    await asyncio.gather(
        cluster_worker_loop(),
        strategy_worker_loop(),
    )


if __name__ == "__main__":
    asyncio.run(main())
