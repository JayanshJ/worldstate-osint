"""
Playwright Scraping Worker

Used for sources that don't expose clean RSS feeds or require
JavaScript rendering (e.g., live-blog pages, Telegram web previews).

Pattern: Each scraper is a small async function that returns a list
of raw article dicts. Add new scrapers by implementing the
`BaseScraper` protocol and registering in SCRAPERS list.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Protocol

from playwright.async_api import Browser, BrowserContext, async_playwright

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)


# ─── Protocol ─────────────────────────────────────────────────────────────

class BaseScraper(Protocol):
    source_id: str
    credibility: float

    async def scrape(self, context: BrowserContext) -> list[dict]: ...


# ─── AFP Live Blog Scraper ────────────────────────────────────────────────

class AFPLiveScraper:
    source_id = "afp_live"
    credibility = 0.93

    async def scrape(self, context: BrowserContext) -> list[dict]:
        page = await context.new_page()
        items: list[dict] = []
        try:
            await page.goto("https://www.afp.com/en/news-hub", timeout=20_000)
            await page.wait_for_selector("article", timeout=10_000)

            articles = await page.query_selector_all("article")
            for article in articles[:15]:
                title_el = await article.query_selector("h2, h3")
                link_el  = await article.query_selector("a[href]")
                if not title_el:
                    continue

                title = (await title_el.inner_text()).strip()
                href  = await link_el.get_attribute("href") if link_el else None
                url   = f"https://www.afp.com{href}" if href and href.startswith("/") else href

                if title:
                    items.append({
                        "source_id": self.source_id,
                        "source_type": "playwright",
                        "url": url,
                        "title": title,
                        "body": None,
                        "published_at": datetime.now(timezone.utc),
                        "raw_json": {},
                        "credibility_score": self.credibility,
                    })
        except Exception as e:
            logger.warning("AFP scraper error: %s", e)
        finally:
            await page.close()
        return items


# ─── Register scrapers ─────────────────────────────────────────────────────
SCRAPERS: list[BaseScraper] = [
    AFPLiveScraper(),
]


# ─── Runner ───────────────────────────────────────────────────────────────

async def run_playwright_cycle() -> None:
    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context: BrowserContext = await browser.new_context(
            user_agent="Mozilla/5.0 (compatible; WorldState-Bot/1.0)",
            viewport={"width": 1280, "height": 800},
        )

        all_items: list[dict] = []
        for scraper in SCRAPERS:
            try:
                items = await scraper.scrape(context)
                all_items.extend(items)
                logger.debug("Playwright [%s]: %d items", scraper.source_id, len(items))
            except Exception as e:
                logger.error("Scraper %s failed: %s", scraper.source_id, e)

        await context.close()
        await browser.close()

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

    logger.info("Playwright cycle complete: %d new articles", len(new_ids))


async def playwright_worker_loop() -> None:
    logger.info("Playwright worker started")
    while True:
        try:
            await run_playwright_cycle()
        except Exception as e:
            logger.error("Playwright cycle error: %s", e, exc_info=True)
        await asyncio.sleep(settings.ingestion_interval_seconds * 2)  # less frequent
