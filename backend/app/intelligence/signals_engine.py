"""
Market Signals Engine
=====================
Monitors live data streams for stock-moving events:

  1. SEC EDGAR Atom RSS  — 8-K filings (M&A, material events)
  2. SEC EDGAR Atom RSS  — Form 4 insider filings
  3. Financial RSS       — CNBC, Yahoo Finance, MarketWatch, AP, NPR, Investopedia

Each signal is AI-enriched with a Gemini 1-line market impact summary.
Signals are deduplicated by URL hash and expire after 48 h.
"""

import asyncio
import hashlib
import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx
import google.generativeai as genai
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.signal import MarketSignal

settings = get_settings()
logger = logging.getLogger(__name__)

# ── EDGAR requires a descriptive User-Agent ───────────────────────────────────
_EDGAR_UA = "WorldState-OSINT worldstate-bot/1.0 contact@worldstate.ai"

# ── Reliable financial RSS feeds ──────────────────────────────────────────────
_NEWS_FEEDS = [
    ("CNBC Top",        "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("CNBC Finance",    "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    ("Yahoo Finance",   "https://finance.yahoo.com/rss/topstories"),
    ("MarketWatch",     "https://feeds.marketwatch.com/marketwatch/topstories/"),
    ("AP Business",     "https://feeds.apnews.com/rss/business"),
    ("Investopedia",    "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline"),
    ("Reuters Biz",     "https://feeds.reuters.com/reuters/businessNews"),
    ("Bloomberg Mkt",   "https://feeds.bloomberg.com/markets/news.rss"),
]

# ── Regex classifiers ─────────────────────────────────────────────────────────

_UPGRADE_RE = re.compile(
    r'\b(?:upgrad\w*|rais\w+\s+(?:to|rating)|initiat\w+\s+(?:at|with)\s+(?:buy|outperform|overweight))'
    r'|(?:to\s+(?:buy|outperform|overweight|strong.buy|accumulate|positive)\s+from)',
    re.I,
)
_DOWNGRADE_RE = re.compile(
    r'\b(?:downgrad\w*|lower\w+\s+(?:to|rating)|cut\s+(?:to|rating))'
    r'|(?:to\s+(?:sell|underperform|underweight|neutral|hold|market.perform)\s+from)',
    re.I,
)
_EARNINGS_BEAT_RE = re.compile(
    r'\b(?:beat[s]?\s+(?:estimate|expectation|forecast|consensus)'
    r'|top[s]?\s+estimate|surpass\w*\s+(?:estimate|expectation)'
    r'|above\s+(?:estimate|expectation|consensus)'
    r'|record\s+(?:revenue|profit|earnings|quarter)'
    r'|strong\s+(?:quarter|results|earnings))',
    re.I,
)
_EARNINGS_MISS_RE = re.compile(
    r'\b(?:miss\w*\s+(?:estimate|expectation|forecast)'
    r'|below\s+(?:estimate|expectation|consensus)'
    r'|disappoint\w+\s+(?:quarter|result|earnings)'
    r'|profit.warning|cut[s]?\s+(?:guidance|outlook|forecast)'
    r'|lower[s]?\s+(?:guidance|outlook|forecast))',
    re.I,
)
_DEAL_CONFIRMED_RE = re.compile(
    r'\b(?:acqui(?:res?|red|sition)\s+\w'
    r'|merger\s+(?:agreement|deal|with)'
    r'|definitive\s+agreement'
    r'|to\s+(?:acquire|buy|purchase)\s+\w'
    r'|takeover\s+(?:bid|offer)'
    r'|buyout\s+(?:deal|offer|firm)'
    r'|going\s+private'
    r'|\$[\d.]+\s*(?:billion|bn|B)\s+(?:deal|acquisition|merger)'
    r'|tender\s+offer)',
    re.I,
)
_RUMOUR_RE = re.compile(
    r'\b(?:report\w*(?:ly)?\s+(?:in\s+talks|considering|exploring|weighing|mulling)'
    r'|said\s+to\s+(?:be|consider|explore|weigh)'
    r'|sources?\s+(?:say|said|familiar)'
    r'|people?\s+familiar\s+with'
    r'|in\s+(?:talks|discussions)\s+(?:to\s+)?(?:acqui|buy|sell|merge)'
    r'|potential\s+(?:deal|merger|buyout|acquisition|takeover|buyer)'
    r'|approach\w+\s+(?:about|for|over)\s+(?:a\s+)?(?:deal|merger|acquisition)'
    r'|bid\s+(?:approach|interest)\s+for)',
    re.I,
)

_AMOUNT_RE  = re.compile(r'\$\s*(\d+(?:\.\d+)?)\s*(billion|bn|million|mn|[bm])\b', re.I)
_TICKER_RE  = re.compile(
    r'(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})'
    r'|\(([A-Z]{2,5})\)(?=\s*(?:,|\.|\s+(?:shares?|stock)))'
)

# 8-K item descriptions that signal M&A / material events
_8K_MA_ITEMS = re.compile(
    r'Item\s+(?:1\.01|1\.02|2\.01|2\.06|5\.02)',  # Material Definitive Agreement, Completion of Acquisition, Changes in Management
    re.I,
)


@dataclass
class RawSignal:
    signal_type:  str
    company:      str
    headline:     str
    source_url:   str
    source_name:  str
    published_at: datetime
    ticker:       Optional[str]  = None
    bullish:      Optional[bool] = None
    magnitude:    Optional[float] = None
    extra_text:   str            = ""


# ── Utilities ─────────────────────────────────────────────────────────────────

def _hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(s.strip()[:19], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc)
    except Exception:
        return _utcnow()


def _parse_amount_bn(text: str) -> Optional[float]:
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


# ── EDGAR Atom RSS helpers ────────────────────────────────────────────────────

_ATOM_NS = "http://www.w3.org/2005/Atom"

async def _fetch_edgar_rss(form_type: str) -> list[dict]:
    """Fetch EDGAR recent-filings Atom feed for a given form type."""
    url = (
        "https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcurrent&type={form_type}&dateb=&owner=include&count=40&output=atom"
    )
    try:
        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": _EDGAR_UA},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()

        root = ET.fromstring(r.content)
        entries = []
        for entry in root.findall(f"{{{_ATOM_NS}}}entry"):
            title   = entry.findtext(f"{{{_ATOM_NS}}}title") or ""
            updated = entry.findtext(f"{{{_ATOM_NS}}}updated") or ""
            summary = entry.findtext(f"{{{_ATOM_NS}}}summary") or ""
            link_el = entry.find(f"{{{_ATOM_NS}}}link")
            link    = link_el.get("href", "") if link_el is not None else ""

            # Title format: "company-name (form-type) - date"
            company = title.split("(")[0].strip() if "(" in title else title.strip()

            entries.append({
                "company": company,
                "title":   title,
                "url":     link,
                "updated": updated,
                "summary": summary,
            })
        return entries
    except ET.ParseError as e:
        logger.warning("EDGAR RSS XML parse error (%s): %s", form_type, e)
        return []
    except Exception as e:
        logger.warning("EDGAR RSS fetch failed (%s): %s", form_type, e)
        return []


# ── Signal fetchers ───────────────────────────────────────────────────────────

async def fetch_edgar_deals() -> list[RawSignal]:
    """8-K filings that mention M&A-related items (1.01, 2.01, etc.)."""
    entries = await _fetch_edgar_rss("8-K")
    signals: list[RawSignal] = []
    cutoff = _utcnow() - timedelta(hours=72)

    for e in entries:
        summary = e["summary"]
        # Filter: only 8-Ks with M&A/material item descriptions
        has_ma_item = _8K_MA_ITEMS.search(summary) or _DEAL_CONFIRMED_RE.search(e["title"] + " " + summary)
        if not has_ma_item:
            continue

        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        text = e["title"] + " " + summary
        signals.append(RawSignal(
            signal_type  = "DEAL",
            company      = e["company"][:200],
            headline     = f"{e['company']} — 8-K Material Event Filing",
            source_url   = e["url"],
            source_name  = "SEC EDGAR 8-K",
            published_at = pub,
            bullish      = True,
            magnitude    = _parse_amount_bn(text),
            extra_text   = summary[:400],
        ))
    return signals


async def fetch_edgar_insider_buys() -> list[RawSignal]:
    """Form 4 filings — recent insider transactions (all activity)."""
    entries = await _fetch_edgar_rss("4")
    signals: list[RawSignal] = []
    cutoff = _utcnow() - timedelta(hours=48)

    seen: set[str] = set()
    for e in entries:
        company = e["company"]
        if company in seen:
            continue  # one signal per company per cycle
        seen.add(company)

        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        ticker = _extract_ticker(e["title"] + " " + e["summary"])
        signals.append(RawSignal(
            signal_type  = "INSIDER_BUY",
            company      = company[:200],
            headline     = f"Insider transaction filed at {company}",
            source_url   = e["url"],
            source_name  = "SEC EDGAR Form 4",
            published_at = pub,
            ticker       = ticker,
            bullish      = None,  # can't determine buy/sell without XML parsing
            extra_text   = e["summary"][:200],
        ))
    return signals


async def fetch_edgar_insider_sells() -> list[RawSignal]:
    # Form 4 RSS doesn't distinguish buys from sells without XML parsing.
    # We return empty here; the RSS approach above captures all insider activity.
    return []


# ── News RSS ──────────────────────────────────────────────────────────────────

async def _fetch_rss_items(feed_name: str, feed_url: str) -> list[dict]:
    """Fetch and parse an RSS 2.0 or Atom feed, returning normalized item dicts."""
    try:
        async with httpx.AsyncClient(
            timeout=12,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; WorldState-OSINT/1.0)",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            },
        ) as client:
            r = await client.get(feed_url)
            r.raise_for_status()

        content = r.content
        root = ET.fromstring(content)

        items: list[dict] = []

        # Detect Atom vs RSS
        if root.tag == f"{{{_ATOM_NS}}}feed" or "atom" in root.tag.lower():
            for entry in root.findall(f"{{{_ATOM_NS}}}entry"):
                title   = entry.findtext(f"{{{_ATOM_NS}}}title") or ""
                link_el = entry.find(f"{{{_ATOM_NS}}}link")
                url     = link_el.get("href", "") if link_el is not None else ""
                updated = entry.findtext(f"{{{_ATOM_NS}}}updated") or entry.findtext(f"{{{_ATOM_NS}}}published") or ""
                summary = entry.findtext(f"{{{_ATOM_NS}}}summary") or entry.findtext(f"{{{_ATOM_NS}}}content") or ""
                items.append({"title": title, "url": url, "pub": updated, "summary": _strip_html(summary)})
        else:
            # RSS 2.0
            for item in root.iter("item"):
                title   = item.findtext("title") or ""
                url     = item.findtext("link") or ""
                pub     = item.findtext("pubDate") or ""
                summary = item.findtext("description") or ""
                items.append({"title": title, "url": url, "pub": pub, "summary": _strip_html(summary)})

        return items

    except ET.ParseError as e:
        logger.debug("RSS XML parse error (%s): %s", feed_name, e)
        return []
    except Exception as e:
        logger.debug("RSS fetch failed (%s %s): %s", feed_name, feed_url[:50], e)
        return []


def _strip_html(text: str) -> str:
    """Very light HTML tag removal for RSS description fields."""
    return re.sub(r'<[^>]+>', ' ', text).strip()


def _classify(title: str, summary: str) -> Optional[str]:
    text = f"{title} {summary}"
    if _UPGRADE_RE.search(text):        return "ANALYST_UPGRADE"
    if _DOWNGRADE_RE.search(text):      return "ANALYST_DOWNGRADE"
    if _EARNINGS_BEAT_RE.search(text):  return "EARNINGS_BEAT"
    if _EARNINGS_MISS_RE.search(text):  return "EARNINGS_MISS"
    if _DEAL_CONFIRMED_RE.search(text): return "DEAL"
    if _RUMOUR_RE.search(text):         return "RUMOR"
    return None


async def fetch_news_signals() -> list[RawSignal]:
    """Parse financial news RSS feeds for stock-moving signals."""
    tasks  = [_fetch_rss_items(name, url) for name, url in _NEWS_FEEDS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    signals: list[RawSignal] = []
    cutoff = _utcnow() - timedelta(hours=48)
    seen_urls: set[str] = set()

    for (feed_name, _), batch in zip(_NEWS_FEEDS, results):
        if isinstance(batch, Exception):
            logger.debug("Feed error (%s): %s", feed_name, batch)
            continue

        for item in batch:
            url     = item.get("url", "")
            title   = item.get("title", "").strip()
            summary = item.get("summary", "").strip()
            pub_str = item.get("pub", "")

            if not url or not title or url in seen_urls:
                continue
            seen_urls.add(url)

            sig_type = _classify(title, summary)
            if not sig_type:
                continue

            try:
                pub = _parse_date(pub_str) if pub_str else _utcnow()
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
            signals.append(RawSignal(
                signal_type  = sig_type,
                company      = (title.split(":")[0] if ":" in title else title[:60]).strip(),
                headline     = title,
                source_url   = url,
                source_name  = feed_name,
                published_at = pub,
                ticker       = _extract_ticker(text),
                bullish      = bullish,
                magnitude    = _parse_amount_bn(text),
                extra_text   = summary[:400],
            ))

    return signals


# ── AI Enrichment ─────────────────────────────────────────────────────────────

_GEMINI_MODEL = None

def _get_gemini():
    global _GEMINI_MODEL
    if _GEMINI_MODEL is None and settings.google_api_key:
        genai.configure(api_key=settings.google_api_key)
        _GEMINI_MODEL = genai.GenerativeModel("gemini-1.5-flash")
    return _GEMINI_MODEL


_PROMPT = """\
You are a senior equity analyst. Write ONE sentence (max 25 words) explaining \
the likely immediate effect on the stock or sector price. Be specific: direction, \
magnitude, and reason. No preamble, no quotes.

Signal : {signal_type}
Company: {company}
News   : {headline}
Context: {context}

One-sentence market impact:"""


async def _ai_enrich(signal: RawSignal) -> Optional[str]:
    model = _get_gemini()
    if not model:
        return None
    prompt = _PROMPT.format(
        signal_type = signal.signal_type,
        company     = signal.company,
        headline    = signal.headline,
        context     = signal.extra_text[:300] or "No additional context.",
    )
    try:
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        return resp.text.strip().strip('"').strip("'")
    except Exception as e:
        logger.debug("Gemini enrich failed: %s", e)
        return None


# ── Persistence ───────────────────────────────────────────────────────────────

async def _persist(db: AsyncSession, raw: list[RawSignal]) -> int:
    now    = _utcnow()
    expiry = now + timedelta(hours=48)
    saved  = 0

    for r in raw:
        h = _hash(r.source_url)
        exists = await db.execute(select(MarketSignal).where(MarketSignal.source_hash == h))
        if exists.scalar_one_or_none():
            continue

        ai = await _ai_enrich(r)

        db.add(MarketSignal(
            source_hash  = h,
            signal_type  = r.signal_type,
            ticker       = r.ticker,
            company      = r.company[:200],
            headline     = r.headline[:500],
            ai_summary   = ai,
            bullish      = r.bullish,
            magnitude    = r.magnitude,
            source_url   = r.source_url[:1000],
            source_name  = r.source_name,
            published_at = r.published_at,
            fetched_at   = now,
            expires_at   = expiry,
            is_active    = True,
        ))
        saved += 1

    await db.commit()
    return saved


# ── Public entry point ────────────────────────────────────────────────────────

async def run_signals_cycle() -> int:
    """Fetch all signal sources in parallel, persist new signals, expire stale ones."""
    results = await asyncio.gather(
        fetch_edgar_deals(),
        fetch_edgar_insider_buys(),
        fetch_edgar_insider_sells(),
        fetch_news_signals(),
        return_exceptions=True,
    )

    all_signals: list[RawSignal] = []
    for batch in results:
        if isinstance(batch, list):
            all_signals.extend(batch)
        elif isinstance(batch, Exception):
            logger.warning("Signal source error: %s", batch)

    logger.info("Signals fetched: %d raw signals from all sources", len(all_signals))

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(MarketSignal)
            .where(MarketSignal.expires_at < _utcnow())
            .values(is_active=False)
        )
        count = await _persist(db, all_signals)

    logger.info("Signals cycle done — %d new persisted", count)
    return count
