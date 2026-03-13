"""
Company Profile Extractor.

Data sources (all free):
  1. yfinance  — sector/industry, market data, shareholders, analysts, officers
  2. Wikipedia — board members when yfinance has no companyOfficers
  3. OpenAI    — LLM extraction of board from Wikipedia text

Results cached in Redis for 6 hours.
"""

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ─── Wikipedia helper ─────────────────────────────────────────────────────────

async def _fetch_wiki_text(company_name: str) -> str:
    """Fetch plaintext of the Wikipedia article for a company."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action":          "query",
                    "prop":            "extracts",
                    "explaintext":     True,
                    "redirects":       True,
                    "titles":          company_name,
                    "format":          "json",
                    "exsectionformat": "plain",
                },
            )
            data  = resp.json()
            pages = data.get("query", {}).get("pages", {})
            for p in pages.values():
                text = p.get("extract", "")
                if len(text) > 200:
                    return text[:14000]
    except Exception as e:
        logger.warning("Wikipedia fetch failed for %s: %s", company_name, e)
    return ""


# ─── LLM board extraction ─────────────────────────────────────────────────────

async def _extract_board_llm(ticker: str, company_name: str, wiki_text: str, openai_client) -> list[dict]:
    """Extract board / executive team via LLM when yfinance has no officers."""
    if not wiki_text:
        return []

    prompt = f"""Extract the current board of directors and executive leadership team of {company_name} ({ticker}).

Wikipedia article:
{wiki_text[:12000]}

Return a JSON array (no markdown fences) where each element has:
  name       - full name (string)
  title      - role / job title (string)
  since      - year they joined this role (integer or null)
  age        - age (integer or null)
  bio        - 1-2 sentence background (string or null)

Return at most 15 people. Prioritise the CEO, CFO, COO, and independent board directors.
Return ONLY the JSON array."""

    try:
        resp = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        logger.warning("Board LLM extraction failed for %s: %s", ticker, e)
        return []


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _normalize_rating(raw: str) -> str:
    r = raw.upper()
    if any(x in r for x in ["BUY", "OUTPERFORM", "OVERWEIGHT", "STRONG BUY", "ACCUMULATE"]):
        return "BUY"
    if any(x in r for x in ["SELL", "UNDERPERFORM", "UNDERWEIGHT", "REDUCE", "STRONG SELL"]):
        return "SELL"
    return "HOLD"


# ─── Main extractor ───────────────────────────────────────────────────────────

async def get_company_profile(ticker: str, redis_client=None) -> dict:
    """
    Return a full company profile dict.  Cached in Redis (key corp:profile:{TICKER}) for 6 h.
    Falls back gracefully: every section is independently try/except'd.
    """
    # Lazy imports — yfinance is slow to import at module level
    import yfinance as yf
    from openai import AsyncOpenAI
    from app.core.config import get_settings

    settings     = get_settings()
    ticker_upper = ticker.upper()
    cache_key    = f"corp:profile:{ticker_upper}"

    # ── Cache read ────────────────────────────────────────────────────────
    if redis_client:
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    yf_t = yf.Ticker(ticker_upper)

    # ── Basic info ────────────────────────────────────────────────────────
    info: dict = {}
    try:
        info = yf_t.info or {}
    except Exception as e:
        logger.warning("yfinance .info failed for %s: %s", ticker_upper, e)

    company_name = info.get("longName") or info.get("shortName") or ticker_upper

    # ── Industries ────────────────────────────────────────────────────────
    industries: list[dict] = []
    for label, itype in [
        (info.get("sector"),        "SECTOR"),
        (info.get("industry"),      "INDUSTRY"),
        (info.get("sic"),           "SIC"),
        (info.get("industryKey"),   "GICS_INDUSTRY"),
        (info.get("sectorKey"),     "GICS_SECTOR"),
    ]:
        if label:
            industries.append({"label": str(label), "type": itype})

    # ── Institutional holders ─────────────────────────────────────────────
    institutions: list[dict] = []
    try:
        df = yf_t.institutional_holders
        if df is not None and not df.empty:
            for _, row in df.head(15).iterrows():
                institutions.append({
                    "name":          str(row.get("Holder") or row.get("Name") or ""),
                    "shares":        _safe_int(row.get("Shares")),
                    "pct_held":      _safe_float(row.get("% Out") or row.get("pctHeld")) * 100,
                    "value":         _safe_float(row.get("Value")),
                    "date_reported": str(row.get("Date Reported") or "")[:10],
                    "type":          "INSTITUTION",
                })
    except Exception as e:
        logger.warning("institutional_holders failed for %s: %s", ticker_upper, e)

    # ── Mutual-fund holders ───────────────────────────────────────────────
    mutual_funds: list[dict] = []
    try:
        df = yf_t.mutualfund_holders
        if df is not None and not df.empty:
            for _, row in df.head(10).iterrows():
                mutual_funds.append({
                    "name":     str(row.get("Holder") or row.get("Name") or ""),
                    "shares":   _safe_int(row.get("Shares")),
                    "pct_held": _safe_float(row.get("% Out") or row.get("pctHeld")) * 100,
                    "value":    _safe_float(row.get("Value")),
                    "type":     "MUTUAL_FUND",
                })
    except Exception as e:
        logger.warning("mutualfund_holders failed for %s: %s", ticker_upper, e)

    # ── Analyst ratings ───────────────────────────────────────────────────
    rating_counts = {"buy": 0, "hold": 0, "sell": 0}
    recent_ratings: list[dict] = []

    try:
        df = yf_t.upgrades_downgrades
        if df is not None and not df.empty:
            df = df.reset_index()
            for _, row in df.head(25).iterrows():
                to_grade   = str(row.get("ToGrade")   or "")
                from_grade = str(row.get("FromGrade") or "")
                firm       = str(row.get("Firm")      or "")
                action     = str(row.get("Action")    or "")
                date_raw   = str(row.get("GradeDate") or "")
                if not firm or not to_grade:
                    continue
                normalized = _normalize_rating(to_grade)
                rating_counts[normalized.lower()] += 1
                recent_ratings.append({
                    "firm":       firm,
                    "action":     action,
                    "from_grade": from_grade,
                    "to_grade":   to_grade,
                    "rating":     normalized,
                    "date":       date_raw[:10],
                })
    except Exception as e:
        logger.warning("upgrades_downgrades failed for %s: %s", ticker_upper, e)

    # Fallback to recommendationKey counts
    if sum(rating_counts.values()) == 0:
        rec_key    = str(info.get("recommendationKey") or "").upper()
        n_analysts = _safe_int(info.get("numberOfAnalystOpinions"), 0)
        norm       = _normalize_rating(rec_key) if rec_key else "HOLD"
        rating_counts[norm.lower()] = n_analysts

    # ── Price targets ─────────────────────────────────────────────────────
    price_target = {
        "current": _safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
        "mean":    _safe_float(info.get("targetMeanPrice")),
        "high":    _safe_float(info.get("targetHighPrice")),
        "low":     _safe_float(info.get("targetLowPrice")),
    }
    try:
        pt = yf_t.analyst_price_targets
        if pt is not None and not pt.empty:
            price_target["mean"] = _safe_float(pt.iloc[0].get("mean") if hasattr(pt, "iloc") else 0) or price_target["mean"]
            price_target["high"] = _safe_float(pt.iloc[0].get("high") if hasattr(pt, "iloc") else 0) or price_target["high"]
            price_target["low"]  = _safe_float(pt.iloc[0].get("low")  if hasattr(pt, "iloc") else 0) or price_target["low"]
    except Exception:
        pass

    # ── Board / executive team ────────────────────────────────────────────
    board: list[dict] = []
    try:
        officers = info.get("companyOfficers") or []
        for o in officers[:15]:
            board.append({
                "name":      o.get("name", ""),
                "title":     o.get("title", ""),
                "since":     o.get("yearBorn"),            # proxy for tenure start
                "age":       o.get("age"),
                "total_pay": o.get("totalPay"),
                "bio":       None,
            })
    except Exception as e:
        logger.warning("companyOfficers parsing failed for %s: %s", ticker_upper, e)

    # If yfinance has no officers → Wikipedia + LLM
    if not board:
        try:
            wiki_text    = await _fetch_wiki_text(company_name)
            openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
            board        = await _extract_board_llm(ticker_upper, company_name, wiki_text, openai_client)
        except Exception as e:
            logger.warning("Board LLM fallback failed for %s: %s", ticker_upper, e)

    # ── Assemble result ───────────────────────────────────────────────────
    result: dict = {
        "ticker":             ticker_upper,
        "name":               company_name,
        "description":        (info.get("longBusinessSummary") or "")[:600],
        "website":            info.get("website", ""),
        "exchange":           info.get("exchange", ""),
        "currency":           info.get("currency", "USD"),
        "country":            info.get("country", ""),
        "employees":          info.get("fullTimeEmployees"),
        "market_cap":         info.get("marketCap"),
        "current_price":      info.get("currentPrice") or info.get("regularMarketPrice"),
        "pe_ratio":           info.get("trailingPE"),
        "forward_pe":         info.get("forwardPE"),
        "dividend_yield":     _safe_float(info.get("dividendYield")) * 100,
        "beta":               info.get("beta"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low":  info.get("fiftyTwoWeekLow"),
        "avg_volume":          info.get("averageVolume"),
        "industries": industries,
        "shareholders": {
            "insider_pct":      _safe_float(info.get("heldPercentInsiders")) * 100,
            "institution_pct":  _safe_float(info.get("heldPercentInstitutions")) * 100,
            "float_shares":     info.get("floatShares"),
            "institutions":     institutions,
            "mutual_funds":     mutual_funds,
        },
        "analysts": {
            "rating_counts":   rating_counts,
            "price_target":    price_target,
            "total_analysts":  _safe_int(info.get("numberOfAnalystOpinions"))
                                or sum(rating_counts.values()),
            "recommendation":  info.get("recommendationKey", ""),
            "recent":          recent_ratings[:20],
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
