import asyncio
import time
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WorldState/1.0)"}

# In-memory cache
_cache: dict = {
    "gold":       {"price": "···", "change": None},
    "silver":     {"price": "···", "change": None},
    "fetched_at": 0.0,
}
# Day-open prices so we can compute intraday % change
_day_open: dict = {"gold": 0.0, "silver": 0.0, "date": ""}
_CACHE_TTL   = 60   # seconds between refreshes
_refresh_task = None


def _intraday_change(current: float, key: str) -> float | None:
    """Return % change from today's first-seen price (intraday proxy)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _day_open["date"] != today:
        _day_open["date"] = today
        _day_open["gold"]   = 0.0
        _day_open["silver"] = 0.0
    if _day_open[key] == 0.0:
        _day_open[key] = current
        return None
    return round((current - _day_open[key]) / _day_open[key] * 100, 2)


async def _fetch_gold_api(symbol: str, client: httpx.AsyncClient, key: str) -> dict:
    """
    gold-api.com — completely free, no API key needed.
    Symbols: XAU (gold), XAG (silver)
    """
    url = f"https://api.gold-api.com/price/{symbol}"
    r = await client.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
    r.raise_for_status()
    data    = r.json()
    current = float(data["price"])
    change  = _intraday_change(current, key)
    price   = f"${current:,.0f}" if current >= 1_000 else f"${current:.2f}"
    return {"price": price, "change": change}


async def _fetch_with_retry(symbol: str, key: str, client: httpx.AsyncClient, retries: int = 2) -> dict | None:
    for attempt in range(retries + 1):
        try:
            if attempt > 0:
                await asyncio.sleep(1.5 * attempt)
            return await _fetch_gold_api(symbol, client, key)
        except Exception:
            pass
    return None


async def _refresh_cache() -> None:
    async with httpx.AsyncClient() as client:
        gold   = await _fetch_with_retry("XAU", "gold",   client)
        await asyncio.sleep(0.3)
        silver = await _fetch_with_retry("XAG", "silver", client)

    if gold:
        _cache["gold"] = gold
    if silver:
        _cache["silver"] = silver
    _cache["fetched_at"] = time.time()


async def _background_loop() -> None:
    while True:
        try:
            await _refresh_cache()
        except Exception:
            pass
        await asyncio.sleep(_CACHE_TTL)


async def start_metals_background() -> None:
    """Pre-warm cache on startup, then keep refreshing in background."""
    global _refresh_task
    await _refresh_cache()
    _refresh_task = asyncio.create_task(_background_loop())


@router.get("")
async def get_metals():
    # Inline fetch only if cache was never populated
    if _cache["fetched_at"] == 0.0:
        await _refresh_cache()
    return JSONResponse({"gold": _cache["gold"], "silver": _cache["silver"]})
