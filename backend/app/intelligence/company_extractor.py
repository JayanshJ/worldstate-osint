"""
Company Profile Extractor — v2

Data sources (no yfinance):
  1. Finnhub API      — industry classification, analyst consensus counts, peer tickers
  2. SEC EDGAR        — major shareholders (SC 13G/D ATOM feed, authoritative)
  3. Wikipedia + LLM  — board / executives and analyst firm names
"""

from __future__ import annotations

import json
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any

import httpx

logger = logging.getLogger(__name__)

FINNHUB_BASE = "https://finnhub.io/api/v1"
_UA          = {"User-Agent": "Bloomberg-Terminal research@company.com"}


# ─── Finnhub ──────────────────────────────────────────────────────────────────

async def _finnhub(path: str, params: dict, api_key: str) -> Any:
    """Generic Finnhub GET — returns parsed JSON or None on error."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{FINNHUB_BASE}/{path}",
                params={**params, "token": api_key},
                headers=_UA,
            )
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("Finnhub /%s failed: %s", path, e)
    return None


# ─── SEC EDGAR shareholders ────────────────────────────────────────────────────

async def _edgar_cik(ticker: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://www.sec.gov/files/company_tickers.json", headers=_UA,
            )
            if r.status_code == 200:
                for entry in r.json().values():
                    if entry.get("ticker", "").upper() == ticker.upper():
                        return str(entry["cik_str"]).zfill(10)
    except Exception as e:
        logger.warning("EDGAR CIK lookup failed for %s: %s", ticker, e)
    return None


async def _edgar_filer_name(filer_cik: str, client: httpx.AsyncClient) -> str | None:
    """Resolve a filer CIK to institution name via EDGAR submissions API."""
    try:
        padded = filer_cik.zfill(10)
        r = await client.get(
            f"https://data.sec.gov/submissions/CIK{padded}.json", headers=_UA,
        )
        if r.status_code == 200:
            return r.json().get("name") or None
    except Exception:
        pass
    return None


async def _edgar_shareholders(cik: str) -> list[dict]:
    """
    Fetch major institutional holders from SEC EDGAR SC 13G/D filings.
    Accession number format: FILERCK-YY-SEQ — we extract the filer CIK and
    resolve it to the institution name via the EDGAR submissions API.
    """
    if not cik:
        return []
    try:
        import asyncio

        url = (
            "https://www.sec.gov/cgi-bin/browse-edgar"
            f"?action=getcompany&CIK={cik}&type=SC+13G&dateb=&owner=include"
            "&count=40&search_text=&output=atom"
        )
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers={**_UA, "Accept": "application/atom+xml"})
            if r.status_code != 200:
                return []

            root = ET.fromstring(r.text)
            # EDGAR uses default namespace — strip it if present
            ns   = {"a": "http://www.w3.org/2005/Atom"}

            # Strip namespace from all tags for easier traversal
            for el in root.iter():
                el.tag = re.sub(r"\{[^}]+\}", "", el.tag)

            # All SC 13G filings for a subject company share the same file-number
            # (the subject's registration #). Deduplicate by filer CIK instead.
            filer_cik_to_date: dict[str, str] = {}

            for entry in root.findall("entry"):
                content = entry.find("content")
                if content is None:
                    continue
                accession  = (content.findtext("accession-number") or "").strip()
                filed_date = (content.findtext("filing-date")       or "")[:10]

                if not accession:
                    continue

                # Accession: 0001193125-24-036431 → filer CIK = 0001193125
                filer_cik_raw = accession.split("-")[0]
                if filer_cik_raw and filer_cik_raw not in filer_cik_to_date:
                    filer_cik_to_date[filer_cik_raw] = filed_date

            if not filer_cik_to_date:
                return []

            # Resolve CIKs → institution names (capped at 12, parallel requests)
            top_ciks = list(filer_cik_to_date.items())[:12]
            names = await asyncio.gather(
                *[_edgar_filer_name(fc, client) for fc, _ in top_ciks],
                return_exceptions=True,
            )

        result: list[dict] = []
        for (fc, filed_date), name in zip(top_ciks, names):
            if isinstance(name, Exception) or not name:
                continue
            result.append({
                "name":       name.title(),
                "filed_date": filed_date,
                "type":       "INSTITUTION",
                "pct_held":   None,
            })

        return result

    except Exception as e:
        logger.warning("EDGAR shareholders failed for CIK %s: %s", cik, e)
    return []


# ─── Wikipedia + LLM ──────────────────────────────────────────────────────────

async def _fetch_wiki(name: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query", "prop": "extracts", "explaintext": True,
                    "redirects": True, "titles": name,
                    "format": "json", "exsectionformat": "plain",
                },
                headers=_UA,
            )
            pages = r.json().get("query", {}).get("pages", {})
            for p in pages.values():
                text = p.get("extract", "")
                if len(text) > 200:
                    return text[:12000]
    except Exception as e:
        logger.warning("Wikipedia fetch failed for %s: %s", name, e)
    return ""


async def _llm_board_and_analysts(ticker: str, company_name: str, wiki_text: str, openai_client) -> tuple[list, list]:
    """Single LLM call → returns (board_list, analyst_firms_list)."""
    prompt = f"""You are a financial data assistant. For {company_name} ({ticker}), return TWO JSON arrays.

{"Wikipedia context (use for board extraction):\n" + wiki_text[:8000] if wiki_text else "Use your knowledge."}

Return strictly this JSON object (no markdown fences):
{{
  "board": [
    {{"name": "...", "title": "CEO|CFO|COO|Director|..."}},
    ...
  ],
  "analysts": [
    {{"firm": "...", "rating": "BUY|HOLD|SELL"}},
    ...
  ]
}}

Rules:
- board: up to 10 current executives/directors (CEO, CFO, COO, independent directors)
- analysts: up to 8 major investment banks/research firms currently covering {ticker}
  with their most recent consensus rating
- Use ONLY confirmed current people/firms — do not guess
- Return ONLY the JSON object"""

    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1200,
        )
        raw = resp.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        return data.get("board", []), data.get("analysts", [])
    except Exception as e:
        logger.warning("Board+analyst LLM extraction failed for %s: %s", ticker, e)
        return [], []


# ─── Main extractor ───────────────────────────────────────────────────────────

async def get_company_profile(ticker: str, redis_client=None, cik: str | None = None) -> dict:
    """
    Return full company profile. Cached in Redis for 6 h.
    """
    import asyncio
    from openai import AsyncOpenAI
    from app.core.config import get_settings

    settings     = get_settings()
    ticker_upper = ticker.upper()
    cache_key    = f"corp:profile:{ticker_upper}"
    api_key      = settings.finnhub_api_key

    # ── Cache read ────────────────────────────────────────────────────────
    if redis_client:
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # ── CIK resolution + Finnhub + EDGAR in parallel ──────────────────────
    resolved_cik = cik or await _edgar_cik(ticker_upper)

    profile_raw, rec_raw, peers_raw, shareholders = await asyncio.gather(
        _finnhub("stock/profile2",      {"symbol": ticker_upper},  api_key),
        _finnhub("stock/recommendation", {"symbol": ticker_upper}, api_key),
        _finnhub("stock/peers",          {"symbol": ticker_upper}, api_key),
        _edgar_shareholders(resolved_cik or ""),
    )

    profile_raw   = profile_raw   or {}
    rec_raw       = rec_raw       or []
    peers_raw     = peers_raw     or []
    company_name  = profile_raw.get("name") or ticker_upper

    # ── Wikipedia + LLM (board + analyst firms) ───────────────────────────
    wiki_text             = await _fetch_wiki(company_name)
    openai_client         = AsyncOpenAI(api_key=settings.openai_api_key)
    board, analyst_firms  = await _llm_board_and_analysts(
        ticker_upper, company_name, wiki_text, openai_client,
    )

    # ── Industries ────────────────────────────────────────────────────────
    industries: list[dict] = []
    if profile_raw.get("finnhubIndustry"):
        industries.append({"label": profile_raw["finnhubIndustry"], "type": "INDUSTRY"})
    if profile_raw.get("gics"):
        industries.append({"label": profile_raw["gics"], "type": "GICS"})
    if profile_raw.get("exchange"):
        industries.append({"label": profile_raw["exchange"], "type": "EXCHANGE"})

    # ── Analyst consensus from Finnhub recommendation ─────────────────────
    latest_rec = rec_raw[0] if rec_raw else {}
    rating_counts = {
        "buy":  (latest_rec.get("buy", 0) or 0) + (latest_rec.get("strongBuy", 0) or 0),
        "hold":  latest_rec.get("hold", 0) or 0,
        "sell": (latest_rec.get("sell", 0) or 0) + (latest_rec.get("strongSell", 0) or 0),
    }

    # Merge LLM analyst firms with Finnhub consensus for the recent list
    recent_ratings = []
    for af in analyst_firms:
        firm   = (af.get("firm") or "").strip()
        rating = (af.get("rating") or "HOLD").upper()
        if firm:
            recent_ratings.append({"firm": firm, "rating": rating, "action": "", "date": ""})

    result: dict = {
        "ticker":            ticker_upper,
        "name":              company_name,
        "website":           profile_raw.get("weburl", ""),
        "exchange":          profile_raw.get("exchange", ""),
        "country":           profile_raw.get("country", ""),
        "market_cap":        profile_raw.get("marketCapitalization"),
        "share_outstanding": profile_raw.get("shareOutstanding"),
        "ipo":               profile_raw.get("ipo", ""),
        "logo":              profile_raw.get("logo", ""),
        "peers":             peers_raw,
        "industries":        industries,
        "shareholders": {
            "institutions": shareholders,
            "mutual_funds": [],
        },
        "analysts": {
            "rating_counts":  rating_counts,
            "total_analysts": sum(rating_counts.values()),
            "recent":         recent_ratings,
        },
        "board": board,
    }

    # ── Cache write ───────────────────────────────────────────────────────
    if redis_client:
        try:
            await redis_client.setex(cache_key, 21600, json.dumps(result, default=str))
        except Exception:
            pass

    return result
