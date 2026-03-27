"""
Market Signals Engine
=====================
Continuously monitors three live data streams for stock-moving events:

  1. SEC EDGAR EFTS  — 8-K M&A filings (merger agreements, tender offers)
  2. SEC EDGAR EFTS  — Form 4 insider transactions (open-market buys / sells)
  3. Financial RSS   — Reuters / FT for analyst upgrades/downgrades, earnings,
                       rumours, profit warnings

Each raw signal is enriched with a Gemini-generated one-line market impact
summary and stored in `market_signals`.  Signals expire after 48 h.

EDGAR API docs: https://efts.sec.gov/LATEST/search-index (public, no key)
"""

import asyncio
import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional
from email.utils import parsedate_to_datetime

import httpx
import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.signal import MarketSignal

settings = get_settings()
logger = logging.getLogger(__name__)

# ── EDGAR requires a descriptive User-Agent per their policy ─────────────────
_EDGAR_UA = "WorldState-OSINT worldstate-bot/1.0 contact@worldstate.ai"

# ── News RSS feeds to monitor for analyst/earnings/rumour signals ─────────────
_NEWS_FEEDS = [
    ("Reuters Business",   "https://feeds.reuters.com/reuters/businessNews"),
    ("Reuters Finance",    "https://feeds.reuters.com/reuters/financialNews"),
    ("FT Markets",         "https://www.ft.com/rss/home/uk"),
    ("Yahoo Finance",      "https://finance.yahoo.com/rss/topstories"),
    ("MarketWatch",        "https://feeds.marketwatch.com/marketwatch/topstories/"),
    ("Seeking Alpha",      "https://seekingalpha.com/market_currents.xml"),
    ("Investopedia",       "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline"),
]

# ── Regex patterns ─────────────────────────────────────────────────────────────

_UPGRADE_RE = re.compile(
    r'(?:upgraded?|rais(?:ed?|es)|initiat(?:ed?|es)|resuming?)\s+(?:to\s+)?'
    r'(?:buy|outperform|overweight|strong buy|accumulate|positive)',
    re.I,
)
_DOWNGRADE_RE = re.compile(
    r'(?:downgrad(?:ed?|es)|lower(?:ed?|s)|cut(?:ting)?|reduc(?:ed?|es))\s+(?:to\s+)?'
    r'(?:sell|underperform|underweight|neutral|hold|market perform)',
    re.I,
)
_EARNINGS_BEAT_RE = re.compile(
    r'(?:beat[s]?|top[s]?|surpass(?:es)?|exceed[s]?|above\s+estimate|strong\s+quarter|record\s+(?:revenue|profit|earnings))',
    re.I,
)
_EARNINGS_MISS_RE = re.compile(
    r'(?:miss(?:es)?|below\s+estimate|disappoint|profit\s+warning|cut[s]?\s+guidance|lower[s]?\s+guidance)',
    re.I,
)
_RUMOUR_RE = re.compile(
    r'(?:report(?:s|ed|edly)|said\s+to|source[s]?\s+say|people?\s+familiar|considering|explore[s]?|weigh[s]?'
    r'|in\s+talks|approach(?:ed|es)|bid\s+for|potential\s+(?:deal|merger|buyout|acquisition|takeover)|rumou?r)',
    re.I,
)
_DEAL_RE = re.compile(
    r'(?:acqui(?:res?|sition|red)|merger|takeover|buyout|deal|offer\s+for|purchase[ds]?\s+\w+\s+for|'
    r'definitive\s+agreement|tender\s+offer|going\s+private|to\s+buy)',
    re.I,
)

# Extract a dollar amount from text: "$4.2 billion", "$850M", "$12B"
_AMOUNT_RE = re.compile(
    r'\$\s*(\d+(?:\.\d+)?)\s*(billion|million|bn|mn|b|m)\b',
    re.I,
)

# Crude ticker extraction: "AAPL", "(TSLA)", "NYSE: NVDA"
_TICKER_RE = re.compile(
    r'(?:NYSE|NASDAQ|LSE|ASX):\s*([A-Z]{1,5})'
    r'|\(([A-Z]{1,5})\)'
    r'\b([A-Z]{2,5})\b(?=\s*(?:shares?|stock|Corp|Inc|Ltd|plc|SE|AG|NV))',
)


# ── Data class ────────────────────────────────────────────────────────────────

@dataclass
class RawSignal:
    signal_type: str
    company:     str
    headline:    str
    source_url:  str
    source_name: str
    published_at: datetime
    ticker:      Optional[str]       = None
    bullish:     Optional[bool]      = None
    magnitude:   Optional[float]     = None
    extra_text:  str                 = ""   # fed to Gemini for context


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


def _parse_amount_bn(text: str) -> Optional[float]:
    """Extract first dollar amount from text and normalise to $B."""
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    val, unit = float(m.group(1)), m.group(2).lower()
    if unit in ("billion", "bn", "b"):
        return val
    if unit in ("million", "mn", "m"):
        return val / 1000
    return None


def _extract_ticker(text: str) -> Optional[str]:
    m = _TICKER_RE.search(text)
    if not m:
        return None
    return next((g for g in m.groups() if g), None)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_rfc822(date_str: str) -> datetime:
    try:
        return parsedate_to_datetime(date_str).astimezone(timezone.utc)
    except Exception:
        return _utcnow()


# ── SEC EDGAR EFTS ────────────────────────────────────────────────────────────

async def _efts_search(q: str, forms: str, startdt: str) -> list[dict]:
    """Query EDGAR EFTS full-text search API and return source dicts."""
    url = (
        "https://efts.sec.gov/LATEST/search-index"
        f"?q={q}&forms={forms}&dateRange=custom&startdt={startdt}"
    )
    try:
        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": _EDGAR_UA},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
            return data.get("hits", {}).get("hits", [])
    except Exception as e:
        logger.warning("EFTS search failed (%s): %s", url[:80], e)
        return []


async def fetch_edgar_deals() -> list[RawSignal]:
    """8-K filings mentioning merger / acquisition agreements (last 3 days)."""
    startdt = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
    q_encoded = (
        "%22Agreement+and+Plan+of+Merger%22+OR+%22merger+agreement%22"
        "+OR+%22acquisition+agreement%22+OR+%22tender+offer%22"
        "+OR+%22going-private%22+OR+%22definitive+agreement%22"
    )
    hits = await _efts_search(q_encoded, "8-K", startdt)

    signals: list[RawSignal] = []
    for h in hits[:20]:
        src = h.get("_source", {})
        company     = src.get("entity_name") or src.get("display_names", ["Unknown"])[0]
        file_date   = src.get("file_date") or _utcnow().strftime("%Y-%m-%d")
        accession   = h.get("_id", "")
        acc_clean   = accession.replace("-", "")
        cik_match   = re.search(r"(\d{10})", acc_clean)
        cik         = cik_match.group(1) if cik_match else "0000000000"
        filing_url  = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=8-K"

        # Use highlight snippet if available for magnitude extraction
        snippet = " ".join(
            h.get("highlight", {}).get("file_date", [])
            + h.get("highlight", {}).get("period_of_report", [])
        )
        magnitude = _parse_amount_bn(snippet)

        try:
            pub = datetime.strptime(file_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pub = _utcnow()

        signals.append(RawSignal(
            signal_type  = "DEAL",
            company      = company.split(" (")[0].strip(),
            headline     = f"{company.split(' (')[0].strip()} filed 8-K: Material Definitive Agreement / M&A",
            source_url   = filing_url,
            source_name  = "SEC EDGAR 8-K",
            published_at = pub,
            bullish      = True,
            magnitude    = magnitude,
            extra_text   = snippet,
        ))
    return signals


async def fetch_edgar_insider_buys() -> list[RawSignal]:
    """Form 4 filings with 'Open Market Purchase' — executive insider buying."""
    startdt = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    hits = await _efts_search("%22Open+Market+Purchase%22", "4", startdt)

    signals: list[RawSignal] = []
    for h in hits[:30]:
        src     = h.get("_source", {})
        company = src.get("entity_name") or src.get("display_names", ["Unknown"])[0]
        company = company.split(" (")[0].strip()
        file_date = src.get("file_date") or _utcnow().strftime("%Y-%m-%d")
        accession = h.get("_id", "")

        filing_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={company.replace(' ', '+')}&type=4"

        snippet = " ".join(
            h.get("highlight", {}).get("file_date", [])
            + h.get("highlight", {}).get("period_of_report", [])
        )
        magnitude = _parse_amount_bn(snippet)
        ticker    = _extract_ticker(snippet) or _extract_ticker(company)

        try:
            pub = datetime.strptime(file_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pub = _utcnow()

        signals.append(RawSignal(
            signal_type  = "INSIDER_BUY",
            company      = company,
            headline     = f"Insider open-market purchase at {company}",
            source_url   = filing_url,
            source_name  = "SEC EDGAR Form 4",
            published_at = pub,
            ticker       = ticker,
            bullish      = True,
            magnitude    = magnitude,
            extra_text   = snippet,
        ))
    return signals


async def fetch_edgar_insider_sells() -> list[RawSignal]:
    """Form 4 filings with 'Open Market Sale' — significant insider selling."""
    startdt = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    hits = await _efts_search("%22Open+Market+Sale%22", "4", startdt)

    signals: list[RawSignal] = []
    for h in hits[:20]:
        src     = h.get("_source", {})
        company = (src.get("entity_name") or src.get("display_names", ["Unknown"])[0]).split(" (")[0].strip()
        file_date = src.get("file_date") or _utcnow().strftime("%Y-%m-%d")

        filing_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={company.replace(' ', '+')}&type=4"
        snippet    = " ".join(h.get("highlight", {}).get("file_date", []))
        magnitude  = _parse_amount_bn(snippet)
        ticker     = _extract_ticker(snippet) or _extract_ticker(company)

        try:
            pub = datetime.strptime(file_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pub = _utcnow()

        signals.append(RawSignal(
            signal_type  = "INSIDER_SELL",
            company      = company,
            headline     = f"Insider open-market sale at {company}",
            source_url   = filing_url,
            source_name  = "SEC EDGAR Form 4",
            published_at = pub,
            ticker       = ticker,
            bullish      = False,
            magnitude    = magnitude,
        ))
    return signals


# ── News RSS ──────────────────────────────────────────────────────────────────

async def _fetch_rss(feed_name: str, feed_url: str) -> list[dict]:
    """Fetch and parse an RSS 2.0 feed, return list of item dicts."""
    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "WorldState-OSINT/1.0"},
        ) as client:
            r = await client.get(feed_url)
            r.raise_for_status()

        root = ET.fromstring(r.text)
        items = []
        # Handle both RSS 2.0 and Atom
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        if root.tag == "{http://www.w3.org/2005/Atom}feed":
            for entry in root.findall("atom:entry", ns):
                title   = entry.findtext("atom:title", "", ns)
                link_el = entry.find("atom:link", ns)
                url     = link_el.get("href", "") if link_el is not None else ""
                pub     = entry.findtext("atom:published", "", ns) or entry.findtext("atom:updated", "", ns)
                summary = entry.findtext("atom:summary", "", ns) or entry.findtext("atom:content", "", ns)
                items.append({"title": title, "url": url, "pub": pub, "summary": summary or ""})
        else:
            for item in root.iter("item"):
                title   = item.findtext("title") or ""
                url     = item.findtext("link") or ""
                pub     = item.findtext("pubDate") or ""
                summary = item.findtext("description") or ""
                items.append({"title": title, "url": url, "pub": pub, "summary": summary})

        return items
    except Exception as e:
        logger.debug("RSS fetch failed (%s): %s", feed_url[:60], e)
        return []


def _classify_news_item(title: str, summary: str) -> Optional[str]:
    """Return signal type or None if not a recognisable financial signal."""
    text = f"{title} {summary}"
    if _UPGRADE_RE.search(text):   return "ANALYST_UPGRADE"
    if _DOWNGRADE_RE.search(text): return "ANALYST_DOWNGRADE"
    if _EARNINGS_BEAT_RE.search(text): return "EARNINGS_BEAT"
    if _EARNINGS_MISS_RE.search(text): return "EARNINGS_MISS"
    if _DEAL_RE.search(text):      return "DEAL"
    if _RUMOUR_RE.search(text):    return "RUMOR"
    return None


async def fetch_news_signals() -> list[RawSignal]:
    """Parse financial news RSS feeds for analyst/earnings/deal/rumour signals."""
    tasks  = [_fetch_rss(name, url) for name, url in _NEWS_FEEDS]
    result = await asyncio.gather(*tasks, return_exceptions=True)

    signals: list[RawSignal] = []
    cutoff = _utcnow() - timedelta(hours=48)

    for (feed_name, _), items in zip(_NEWS_FEEDS, result):
        if isinstance(items, Exception):
            continue
        for item in items:
            title   = item.get("title", "")
            url     = item.get("url", "")
            summary = item.get("summary", "")
            pub_str = item.get("pub", "")

            if not url or not title:
                continue

            sig_type = _classify_news_item(title, summary)
            if not sig_type:
                continue

            # Parse published date
            try:
                pub = _parse_rfc822(pub_str) if pub_str else _utcnow()
            except Exception:
                pub = _utcnow()

            if pub < cutoff:
                continue

            bullish = None
            if sig_type in ("ANALYST_UPGRADE", "EARNINGS_BEAT", "DEAL"):
                bullish = True
            elif sig_type in ("ANALYST_DOWNGRADE", "EARNINGS_MISS"):
                bullish = False

            text = f"{title} {summary}"
            ticker    = _extract_ticker(text)
            magnitude = _parse_amount_bn(text)

            # Crude company extraction from title
            company = title.split(":")[0].strip() if ":" in title else title[:60].strip()

            signals.append(RawSignal(
                signal_type  = sig_type,
                company      = company,
                headline     = title,
                source_url   = url,
                source_name  = feed_name,
                published_at = pub,
                ticker       = ticker,
                bullish      = bullish,
                magnitude    = magnitude,
                extra_text   = summary[:400],
            ))

    return signals


# ── AI Enrichment ─────────────────────────────────────────────────────────────

_GEMINI_MODEL: Optional[genai.GenerativeModel] = None


def _get_gemini() -> Optional[genai.GenerativeModel]:
    global _GEMINI_MODEL
    if _GEMINI_MODEL is None and settings.google_api_key:
        genai.configure(api_key=settings.google_api_key)
        _GEMINI_MODEL = genai.GenerativeModel("gemini-1.5-flash")
    return _GEMINI_MODEL


_AI_ENRICH_PROMPT = """\
You are a senior equity analyst. Given this market signal, write ONE sentence (max 25 words) \
explaining the likely immediate effect on the stock / sector price. \
Be specific: direction (up/down), magnitude (small/moderate/significant), and reason.

Signal type : {signal_type}
Company     : {company}
Headline    : {headline}
Context     : {context}

One-sentence market impact (no preamble, no quotes):"""


async def _ai_enrich(signal: RawSignal) -> Optional[str]:
    model = _get_gemini()
    if not model:
        return None
    prompt = _AI_ENRICH_PROMPT.format(
        signal_type = signal.signal_type,
        company     = signal.company,
        headline    = signal.headline,
        context     = signal.extra_text[:300] or "No additional context.",
    )
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: model.generate_content(prompt)
        )
        text = response.text.strip()
        # Remove any leading quotes Gemini sometimes adds
        return text.strip('"').strip("'")
    except Exception as e:
        logger.debug("Gemini enrich failed: %s", e)
        return None


# ── Persistence ───────────────────────────────────────────────────────────────

async def _persist_signals(db: AsyncSession, raw: list[RawSignal]) -> int:
    """Deduplicate and persist new signals, return count inserted."""
    now    = _utcnow()
    expiry = now + timedelta(hours=48)
    saved  = 0

    for r in raw:
        h = _hash(r.source_url)
        existing = await db.execute(
            select(MarketSignal).where(MarketSignal.source_hash == h)
        )
        if existing.scalar_one_or_none():
            continue  # Already stored

        ai_summary = await _ai_enrich(r)

        sig = MarketSignal(
            source_hash  = h,
            signal_type  = r.signal_type,
            ticker       = r.ticker,
            company      = r.company[:200],
            headline     = r.headline[:500],
            ai_summary   = ai_summary,
            bullish      = r.bullish,
            magnitude    = r.magnitude,
            source_url   = r.source_url[:1000],
            source_name  = r.source_name,
            published_at = r.published_at,
            fetched_at   = now,
            expires_at   = expiry,
            is_active    = True,
        )
        db.add(sig)
        saved += 1

    await db.commit()
    return saved


# ── Public entry point ────────────────────────────────────────────────────────

async def run_signals_cycle() -> int:
    """
    Fetch all signal sources in parallel, persist new ones, expire old ones.
    Called by the background worker loop every 15 minutes.
    """
    deal_signals, insider_buy, insider_sell, news = await asyncio.gather(
        fetch_edgar_deals(),
        fetch_edgar_insider_buys(),
        fetch_edgar_insider_sells(),
        fetch_news_signals(),
        return_exceptions=True,
    )

    all_signals: list[RawSignal] = []
    for batch in (deal_signals, insider_buy, insider_sell, news):
        if isinstance(batch, list):
            all_signals.extend(batch)
        else:
            logger.warning("Signal fetch batch error: %s", batch)

    async with AsyncSessionLocal() as db:
        # Expire stale signals
        from sqlalchemy import update
        await db.execute(
            update(MarketSignal)
            .where(MarketSignal.expires_at < _utcnow())
            .values(is_active=False)
        )
        count = await _persist_signals(db, all_signals)

    logger.info("Signals cycle: %d fetched, %d new persisted", len(all_signals), count)
    return count
