"""
Clustering + Intelligence Worker Entry Point
"""

import asyncio
import logging

from app.core.config import get_settings
from app.intelligence.cluster_engine import cluster_worker_loop
from app.intelligence.strategy_engine import strategy_worker_loop
from app.intelligence.signals_engine import run_signals_cycle
from app.intelligence.briefing_engine import briefing_worker_loop

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


async def signals_loop():
    import asyncio as _a
    while True:
        try:
            await run_signals_cycle()
        except Exception as e:
            logging.getLogger(__name__).exception("Signals cycle error: %s", e)
        await _a.sleep(15 * 60)  # every 15 min


async def main():
    # Run cluster intelligence, strategy generation, signals, and briefing concurrently
    await asyncio.gather(
        cluster_worker_loop(),
        strategy_worker_loop(),
        signals_loop(),
        briefing_worker_loop(),
    )


if __name__ == "__main__":
    asyncio.run(main())
