"""
Signals Worker — runs every 15 minutes, fetches:
  - SEC EDGAR 8-K M&A filings
  - SEC EDGAR Form 4 insider trades
  - Financial RSS (Reuters/FT/Yahoo) for analyst/earnings/rumour signals
"""

import asyncio
import logging

from app.core.config import get_settings
from app.intelligence.signals_engine import run_signals_cycle

settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 15 * 60  # 15 minutes


async def signals_worker_loop():
    logger.info("Signals worker started (interval=%ds)", INTERVAL_SECONDS)
    while True:
        try:
            count = await run_signals_cycle()
            logger.info("Signals cycle complete — %d new signals", count)
        except Exception as e:
            logger.exception("Signals cycle error: %s", e)
        await asyncio.sleep(INTERVAL_SECONDS)


async def main():
    await signals_worker_loop()


if __name__ == "__main__":
    asyncio.run(main())
