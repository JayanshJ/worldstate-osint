import asyncio
import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.core.security import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; WorldState/1.0)",
    "Accept": "application/json",
}

# ── Commodity definitions ───────────────────────────────────────────────────
# (key, gold-api symbol or None, Yahoo ticker, display format)
_COMMODITIES = [
    ("gold",     "XAU",  "GC=F",  "usd_int"),
    ("silver",   "XAG",  "SI=F",  "usd_dec"),
    ("platinum", "XPT",  "PL=F",  "usd_int"),
    ("wti",      None,   "CL=F",  "usd_dec"),
]

# Yahoo Finance range/interval matrix for each UI range
# range=1d = "last trading session" on Yahoo (works on weekends — returns Friday)
_YF_PARAMS = {
    "1h":  {"interval": "2m",  "range": "1d"},
    "6h":  {"interval": "5m",  "range": "1d"},
    "1d":  {"interval": "15m", "range": "1d"},
    "1w":  {"interval": "1h",  "range": "5d"},
    "1m":  {"interval": "1d",  "range": "1mo"},
}

# Spot-price cache (60s TTL)
_spot_cache: dict = {key: {"price": "···", "change": None, "raw": 0.0} for key, *_ in _COMMODITIES}
_spot_cache["fetched_at"] = 0.0

# Per-range history cache (120s TTL)
_hist_cache: dict[str, dict] = {}   # key → {range → {"data": ..., "ts": float}}

_SPOT_TTL = 60
_HIST_TTL = 120
_refresh_task = None


def _fmt_price(v: float, fmt: str) -> str:
    if fmt == "usd_int":
        return f"${v:,.0f}"
    return f"${v:.2f}"


async def _yf_fetch(ticker: str, interval: str, yf_range: str,
                    client: httpx.AsyncClient) -> dict:
    """Fetch chart data from Yahoo Finance v8 API."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?interval={interval}&range={yf_range}"
    )
    r = await client.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
    r.raise_for_status()
    return r.json()["chart"]["result"][0]


def _yf_change(meta: dict) -> float | None:
    """Compute daily % change from Yahoo Finance meta.
    Falls back to previousClose if regularMarketChangePercent is None.
    """
    chp = meta.get("regularMarketChangePercent")
    if chp is not None:
        return round(float(chp), 2)
    price = meta.get("regularMarketPrice")
    prev  = meta.get("chartPreviousClose") or meta.get("previousClose")
    if price and prev and float(prev) > 0:
        return round((float(price) - float(prev)) / float(prev) * 100, 2)
    return None


async def _refresh_spot() -> None:
    """Refresh all spot prices from gold-api.com + Yahoo Finance."""
    async with httpx.AsyncClient() as client:
        for key, gold_sym, yf_ticker, fmt in _COMMODITIES:
            try:
                if gold_sym:
                    # gold-api.com for precious metals
                    r = await client.get(
                        f"https://api.gold-api.com/price/{gold_sym}",
                        headers=HEADERS, timeout=10, follow_redirects=True,
                    )
                    r.raise_for_status()
                    data    = r.json()
                    current = float(data["price"])
                    # gold-api doesn't return % change — get it from Yahoo
                    try:
                        result  = await _yf_fetch(yf_ticker, "1m", "5d", client)
                        change  = _yf_change(result["meta"])
                    except Exception:
                        change = None
                else:
                    # Yahoo Finance for WTI
                    result  = await _yf_fetch(yf_ticker, "1m", "5d", client)
                    meta    = result["meta"]
                    current = float(meta["regularMarketPrice"])
                    change  = _yf_change(meta)

                _spot_cache[key] = {
                    "price":  _fmt_price(current, fmt),
                    "change": change,
                    "raw":    current,
                }
            except Exception:
                pass
            await asyncio.sleep(0.2)

    _spot_cache["fetched_at"] = time.time()


async def _background_loop() -> None:
    while True:
        try:
            await _refresh_spot()
        except Exception:
            pass
        await asyncio.sleep(_SPOT_TTL)


async def start_metals_background() -> None:
    global _refresh_task
    await _refresh_spot()
    _refresh_task = asyncio.create_task(_background_loop())


def _build_history_points(result: dict, ui_range: str) -> list[dict]:
    """Extract time-series points from a Yahoo Finance result.

    1h/6h/1d  — Yahoo fetches exactly 1 trading day; we trim from the end for sub-day.
    1w        — 5 trading days of hourly bars.
    1m        — 1 month of daily bars (with OHLC).
    """
    timestamps = result.get("timestamp", [])
    quote      = result["indicators"]["quote"][0]
    closes     = quote.get("close", [])
    opens      = quote.get("open",  [])
    highs      = quote.get("high",  [])
    lows       = quote.get("low",   [])

    include_ohlc = ui_range in ("1w", "1m")

    # Build all valid points
    all_pts = []
    for i, (ts, c) in enumerate(zip(timestamps, closes)):
        if c is None:
            continue
        pt: dict = {
            "t": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
            "p": float(c),
            "_ts": ts,
        }
        if include_ohlc:
            o  = opens[i] if i < len(opens) else None
            h  = highs[i] if i < len(highs) else None
            lo = lows[i]  if i < len(lows)  else None
            if o  is not None: pt["o"] = float(o)
            if h  is not None: pt["h"] = float(h)
            if lo is not None: pt["l"] = float(lo)
        all_pts.append(pt)

    if not all_pts:
        return []

    # For 1h/6h, trim from the last point backwards by N hours
    if ui_range in ("1h", "6h"):
        hours = {"1h": 1, "6h": 6}[ui_range]
        last_ts = all_pts[-1]["_ts"]
        cutoff  = last_ts - hours * 3600
        all_pts = [p for p in all_pts if p["_ts"] >= cutoff]

    # Remove internal _ts field before returning
    for p in all_pts:
        p.pop("_ts", None)

    return all_pts


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
async def get_metals():
    if time.time() - _spot_cache["fetched_at"] > _SPOT_TTL:
        await _refresh_spot()
    return JSONResponse({
        key: {k: v for k, v in _spot_cache[key].items() if k != "raw"}
        for key, *_ in _COMMODITIES
    })


@router.get("/history/{key}")
async def get_history(
    key: str,
    range: str = Query("1d", pattern="^(1h|6h|1d|1w|1m)$"),
):
    """Return price history for a commodity directly from Yahoo Finance."""
    # Find the Yahoo ticker for this key
    entry = next((e for e in _COMMODITIES if e[0] == key), None)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown commodity: {key}")

    yf_ticker = entry[2]

    # Check in-memory cache
    cache_key = f"{key}:{range}"
    cached = _hist_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _HIST_TTL:
        return cached["data"]

    yf_params = _YF_PARAMS[range]
    try:
        async with httpx.AsyncClient() as client:
            result = await _yf_fetch(
                yf_ticker, yf_params["interval"], yf_params["range"], client
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {exc}")

    points = _build_history_points(result, range)

    meta    = result["meta"]
    current = _spot_cache[key].get("raw") or float(meta.get("regularMarketPrice", 0))
    prices  = [p["p"] for p in points]

    # For change: use first point of current session vs current price
    if prices:
        session_open = prices[0]
        pct_change = round((current - session_open) / session_open * 100, 2) if session_open else None
    else:
        pct_change = _spot_cache[key].get("change")

    data = {
        "key":     key,
        "range":   range,
        "points":  points,
        "current": current,
        "open":    prices[0]   if prices else current,
        "high":    max(prices) if prices else current,
        "low":     min(prices) if prices else current,
        "change":  pct_change,
    }

    _hist_cache[cache_key] = {"data": data, "ts": time.time()}
    return data
