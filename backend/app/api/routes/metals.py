import asyncio
import time
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WorldState/1.0)"}

# Commodities fetched and their display config
# (cache_key, gold-api symbol, price_format)
# price_format: "usd_int" = $1,234  "usd_dec" = $12.34  "usd_2dp" = $123.45
_COMMODITIES: list[tuple[str, str, str]] = [
    ("gold",     "XAU",   "usd_int"),
    ("silver",   "XAG",   "usd_dec"),
    ("platinum", "XPT",   "usd_int"),
    ("wti",      "USOIL", "usd_2dp"),
]

# In-memory cache
_cache: dict = {key: {"price": "···", "change": None} for key, *_ in _COMMODITIES}
_cache["fetched_at"] = 0.0

# Day-open prices for intraday % change
_day_open: dict = {key: 0.0 for key, *_ in _COMMODITIES}
_day_open["date"] = ""

_CACHE_TTL   = 60   # seconds between refreshes
_refresh_task = None


def _fmt_price(current: float, fmt: str) -> str:
    if fmt == "usd_int":
        return f"${current:,.0f}"
    if fmt == "usd_dec":
        return f"${current:.2f}"
    return f"${current:.2f}"


def _intraday_change(current: float, key: str) -> float | None:
    """Return % change from today's first-seen price (intraday proxy)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if _day_open["date"] != today:
        _day_open["date"] = today
        for k, *_ in _COMMODITIES:
            _day_open[k] = 0.0
    if _day_open[key] == 0.0:
        _day_open[key] = current
        return None
    return round((current - _day_open[key]) / _day_open[key] * 100, 2)


async def _fetch_gold_api(symbol: str, client: httpx.AsyncClient, key: str, fmt: str) -> dict:
    """gold-api.com — free, no API key. Supports metals and USOIL."""
    url = f"https://api.gold-api.com/price/{symbol}"
    r = await client.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
    r.raise_for_status()
    data    = r.json()
    current = float(data["price"])
    change  = _intraday_change(current, key)
    price   = _fmt_price(current, fmt)
    return {"price": price, "change": change}


async def _fetch_with_retry(symbol: str, key: str, fmt: str, client: httpx.AsyncClient, retries: int = 2) -> dict | None:
    for attempt in range(retries + 1):
        try:
            if attempt > 0:
                await asyncio.sleep(1.5 * attempt)
            return await _fetch_gold_api(symbol, client, key, fmt)
        except Exception:
            pass
    return None


async def _refresh_cache() -> None:
    async with httpx.AsyncClient() as client:
        for key, symbol, fmt in _COMMODITIES:
            result = await _fetch_with_retry(symbol, key, fmt, client)
            if result:
                _cache[key] = result
            await asyncio.sleep(0.3)
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
    if _cache["fetched_at"] == 0.0:
        await _refresh_cache()
    return JSONResponse({
        "gold":     _cache["gold"],
        "silver":   _cache["silver"],
        "platinum": _cache["platinum"],
        "wti":      _cache["wti"],
    })
