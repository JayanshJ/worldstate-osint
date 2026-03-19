import asyncio
import csv
import io
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WorldState/1.0)"}

_COMMODITIES: list[tuple[str, str, str]] = [
    ("gold",     "XAU",   "usd_int"),
    ("silver",   "XAG",   "usd_dec"),
    ("platinum", "XPT",   "usd_int"),
    ("wti",      "USOIL", "usd_2dp"),
]

# Stooq symbols for daily/weekly historical data
_STOOQ: dict[str, str] = {
    "gold":     "xauusd",
    "silver":   "xagusd",
    "platinum": "xptusd",
    "wti":      "",        # stooq has no reliable WTI symbol — uses intraday fallback
}

# In-memory spot cache
_cache: dict = {key: {"price": "···", "change": None, "raw": 0.0} for key, *_ in _COMMODITIES}
_cache["fetched_at"] = 0.0

# Day-open for intraday % change
_day_open: dict = {key: 0.0 for key, *_ in _COMMODITIES}
_day_open["date"] = ""

# Rolling intraday history — 1440 points = 24 h at 60 s resolution
_history: dict[str, deque] = {
    key: deque(maxlen=1440)
    for key, *_ in _COMMODITIES
}

_CACHE_TTL   = 60
_refresh_task = None


def _fmt_price(v: float, fmt: str) -> str:
    if fmt == "usd_int":
        return f"${v:,.0f}"
    return f"${v:.2f}"


def _intraday_change(current: float, key: str) -> float | None:
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
    url = f"https://api.gold-api.com/price/{symbol}"
    r = await client.get(url, headers=HEADERS, timeout=10, follow_redirects=True)
    r.raise_for_status()
    data    = r.json()
    current = float(data["price"])
    change  = _intraday_change(current, key)

    # Append to rolling history
    _history[key].append({
        "t": datetime.now(timezone.utc).isoformat(),
        "p": current,
    })

    return {"price": _fmt_price(current, fmt), "change": change, "raw": current}


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
    global _refresh_task
    await _refresh_cache()
    _refresh_task = asyncio.create_task(_background_loop())


async def _fetch_stooq(key: str, days: int) -> list[dict]:
    """Fetch daily OHLC from stooq.com — free, no key needed."""
    symbol = _STOOQ.get(key)
    if not symbol:
        return []
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days + 5)   # pad for weekends
    url = (
        f"https://stooq.com/q/d/l/?s={symbol}"
        f"&d1={start.strftime('%Y%m%d')}"
        f"&d2={today.strftime('%Y%m%d')}&i=d"
    )
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=HEADERS, follow_redirects=True)
            r.raise_for_status()
            text = r.text.strip()
            if not text or "No data" in text:
                return []
            reader = csv.DictReader(io.StringIO(text))
            rows = []
            for row in reader:
                try:
                    rows.append({
                        "t": row["Date"],
                        "p": float(row["Close"]),
                        "o": float(row["Open"]),
                        "h": float(row["High"]),
                        "l": float(row["Low"]),
                    })
                except (KeyError, ValueError):
                    continue
            return rows[-days:]   # trim to requested window
    except Exception:
        return []


@router.get("")
async def get_metals():
    if _cache["fetched_at"] == 0.0:
        await _refresh_cache()
    return JSONResponse({
        "gold":     {k: v for k, v in _cache["gold"].items()     if k != "raw"},
        "silver":   {k: v for k, v in _cache["silver"].items()   if k != "raw"},
        "platinum": {k: v for k, v in _cache["platinum"].items() if k != "raw"},
        "wti":      {k: v for k, v in _cache["wti"].items()      if k != "raw"},
    })


@router.get("/history/{key}")
async def get_history(
    key: str,
    range: str = Query("1d", pattern="^(1h|6h|1d|1w|1m)$"),
):
    """
    Return price history for a commodity.
    1h / 6h / 1d  — intraday from in-memory rolling buffer (60 s resolution)
    1w / 1m       — daily OHLC from stooq.com
    """
    if key not in _history:
        raise HTTPException(status_code=404, detail=f"Unknown commodity: {key}")

    if range in ("1h", "6h", "1d"):
        cutoff_h = {"1h": 1, "6h": 6, "1d": 24}[range]
        cutoff   = datetime.now(timezone.utc) - timedelta(hours=cutoff_h)
        points   = [
            p for p in _history[key]
            if datetime.fromisoformat(p["t"]) >= cutoff
        ]
        # If buffer too thin, pad with what we have
        if not points and _history[key]:
            points = list(_history[key])

        current = _cache[key].get("raw") or 0.0
        prices  = [p["p"] for p in points]
        return {
            "key":     key,
            "range":   range,
            "points":  points,
            "current": current,
            "open":    prices[0]  if prices else current,
            "high":    max(prices) if prices else current,
            "low":     min(prices) if prices else current,
            "change":  _cache[key].get("change"),
        }

    else:
        days   = {"1w": 7, "1m": 30}[range]
        points = await _fetch_stooq(key, days)
        if not points:
            # Fallback: repeat intraday data
            points = [{"t": p["t"], "p": p["p"]} for p in _history[key]]

        current = _cache[key].get("raw") or (points[-1]["p"] if points else 0.0)
        prices  = [p["p"] for p in points]
        return {
            "key":     key,
            "range":   range,
            "points":  points,
            "current": current,
            "open":    prices[0]  if prices else current,
            "high":    max(prices) if prices else current,
            "low":     min(prices) if prices else current,
            "change":  _cache[key].get("change"),
        }
