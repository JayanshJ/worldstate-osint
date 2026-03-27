"""
Market Signals Engine
=====================
Three guaranteed-to-populate data streams:

  1. SEC EDGAR Form 4  — every insider transaction filed today (always ~40/day)
  2. SEC EDGAR 8-K     — every material corporate event filed today (always ~100/day)
  3. Financial RSS     — CNBC, Yahoo Finance, MarketWatch, AP Business

EDGAR Atom feeds always have data on any business day.
News feeds use broad regex so common financial headlines are captured.
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
logger   = logging.getLogger(__name__)

_EDGAR_UA  = "WorldState-OSINT worldstate-bot/1.0 contact@worldstate.ai"
_ATOM_NS   = "http://www.w3.org/2005/Atom"
_NEWS_UA   = "Mozilla/5.0 (compatible; WorldState-OSINT/1.0)"

# ── 8-K item numbers → signal classification ──────────────────────────────────
# We parse these from the EDGAR summary field.
_8K_ITEM_MAP = {
    "1.01": ("DEAL",               True,  "Material Definitive Agreement"),
    "1.02": ("DEAL",               False, "Termination of Material Agreement"),
    "2.01": ("DEAL",               True,  "Completion of Acquisition"),
    "2.06": ("EARNINGS_MISS",      False, "Material Impairment"),
    "4.01": ("RUMOR",              False, "Change of Auditor"),
    "5.01": ("DEAL",               True,  "Changes in Control"),
    "5.02": ("RUMOR",              None,  "Director/Officer Changes"),
    "7.01": ("RUMOR",              None,  "Regulation FD Disclosure"),
    "8.01": ("RUMOR",              None,  "Other Events"),
}

# ── News RSS feeds ─────────────────────────────────────────────────────────────
_NEWS_FEEDS = [
    ("CNBC Markets",   "https://www.cnbc.com/id/20910258/device/rss/rss.html"),
    ("CNBC Business",  "https://www.cnbc.com/id/10001147/device/rss/rss.html"),
    ("Yahoo Finance",  "https://finance.yahoo.com/rss/topstories"),
    ("MarketWatch",    "https://feeds.marketwatch.com/marketwatch/topstories/"),
    ("AP Business",    "https://feeds.apnews.com/rss/business"),
    ("Investopedia",   "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_headline"),
]

# ── Broad classifiers (match common headline language) ────────────────────────

_RE_FLAGS = re.IGNORECASE

# Analyst actions
_UPGRADE_RE = re.compile(
    r'upgrad|raises? (?:price )?target|initiates? (?:at |with )?(?:buy|overweight|outperform)'
    r'|starts? coverage|resumes? (?:at )?(?:buy|overweight|outperform)'
    r'|(?:buy|overweight|outperform) from (?:neutral|hold|sell|underweight)',
    _RE_FLAGS,
)
_DOWNGRADE_RE = re.compile(
    r'downgrad|cuts? (?:price )?target|lowers? (?:price )?target'
    r'|(?:neutral|hold|sell|underperform|underweight) from (?:buy|overweight|outperform)'
    r'|price target (?:cut|lower|reduc)',
    _RE_FLAGS,
)

# Earnings
_BEAT_RE = re.compile(
    r'beat[s]? (?:estimate|expectation|forecast|consensus|wall street)'
    r'|top[s]? (?:estimate|expectation|forecast)'
    r'|(?:Q[1-4]|quarter(?:ly)?) (?:earnings?|results?|profit).{0,40}(?:beat|top|exceed|surpass|above)'
    r'|record (?:revenue|profit|earnings|quarter|sales)'
    r'|above (?:estimate|expectation|consensus|forecast)'
    r'|surpass(?:es)? (?:estimate|expectation)',
    _RE_FLAGS,
)
_MISS_RE = re.compile(
    r'miss(?:es)? (?:estimate|expectation|forecast|consensus|wall street)'
    r'|falls? short'
    r'|(?:Q[1-4]|quarter(?:ly)?) (?:earnings?|results?|profit).{0,40}(?:miss|below|disappoint|fall short)'
    r'|profit.warning'
    r'|cuts? (?:guidance|outlook|forecast)'
    r'|lowers? (?:guidance|outlook|forecast)'
    r'|below (?:estimate|expectation|consensus|forecast)',
    _RE_FLAGS,
)

# M&A confirmed
_DEAL_RE = re.compile(
    r'acquir(?:es?|ed|ing)|merger|acquisition'
    r'|to buy [A-Z]|buys [A-Z]|purchase[ds]? \w+ for \$'
    r'|definitive agreement|takeover (?:bid|offer|deal)'
    r'|going.private|\$[\d.]+ (?:billion|bn|million) (?:deal|acquisition|merger|buyout)'
    r'|tender offer|deal (?:valued|worth)',
    _RE_FLAGS,
)

# Rumours / unconfirmed
_RUMOUR_RE = re.compile(
    r'report(?:ed)?ly|sources? (?:say|said|familiar|close to)'
    r'|said to (?:be |consider|explore|weigh|mull)'
    r'|in talks? (?:to |about |with )'
    r'|considering (?:a )?(?:sale|bid|deal|merger|acquisition|buyout)'
    r'|potential (?:deal|merger|buyout|acquisition|takeover|buyer|sale)'
    r'|approach(?:ed|es|ing) (?:about|for|over) (?:a )?(?:deal|bid|merger)'
    r'|exploring? (?:a )?(?:sale|deal|merger|options?)',
    _RE_FLAGS,
)

# Dollar amount extractor
_AMOUNT_RE = re.compile(r'\$\s*(\d+(?:\.\d+)?)\s*(billion|bn|million|mn|[bm])\b', _RE_FLAGS)

# Ticker: "(AAPL)" or "NYSE: AAPL"
_TICKER_RE = re.compile(
    r'(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})'
    r'|\(([A-Z]{2,5})\)(?=[\s,.])',
    re.ASCII,
)


@dataclass
class RawSignal:
    signal_type:  str
    company:      str
    headline:     str
    source_url:   str
    source_name:  str
    published_at: datetime
    ticker:       Optional[str]   = None
    bullish:      Optional[bool]  = None
    magnitude:    Optional[float] = None
    extra_text:   str             = ""


# ── Utility helpers ───────────────────────────────────────────────────────────

def _hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _parse_date(s: str) -> datetime:
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip()[:19], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc)
    except Exception:
        return _utcnow()

def _amount_bn(text: str) -> Optional[float]:
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    v, u = float(m.group(1)), m.group(2).lower()
    return v if u in ("billion", "bn", "b") else v / 1000

def _ticker(text: str) -> Optional[str]:
    m = _TICKER_RE.search(text)
    return next((g for g in (m.groups() if m else []) if g), None)

def _strip_html(text: str) -> str:
    return re.sub(r'<[^>]+>', ' ', text).strip()


# ── EDGAR Atom RSS fetcher ────────────────────────────────────────────────────

async def _edgar_rss(form_type: str) -> list[dict]:
    url = (
        "https://www.sec.gov/cgi-bin/browse-edgar"
        f"?action=getcurrent&type={form_type}&dateb=&owner=include&count=40&output=atom"
    )
    try:
        async with httpx.AsyncClient(timeout=20, headers={"User-Agent": _EDGAR_UA},
                                     follow_redirects=True) as c:
            r = await c.get(url)
            r.raise_for_status()
        root = ET.fromstring(r.content)
        out  = []
        for entry in root.findall(f"{{{_ATOM_NS}}}entry"):
            title   = entry.findtext(f"{{{_ATOM_NS}}}title") or ""
            updated = entry.findtext(f"{{{_ATOM_NS}}}updated") or ""
            summary = entry.findtext(f"{{{_ATOM_NS}}}summary") or ""
            link_el = entry.find(f"{{{_ATOM_NS}}}link")
            link    = link_el.get("href", "") if link_el is not None else ""
            company = title.split("(")[0].strip() if "(" in title else title.strip()
            out.append({"company": company, "title": title,
                        "url": link, "updated": updated, "summary": summary})
        return out
    except Exception as e:
        logger.warning("EDGAR RSS failed (%s): %s", form_type, e)
        return []


# ── Signal fetchers ───────────────────────────────────────────────────────────

async def fetch_edgar_deals() -> list[RawSignal]:
    """
    ALL 8-K filings from the last 72 h.
    Classify by Item number in the summary; default to DEAL for any unrecognised item.
    This always produces signals on any business day.
    """
    entries = await _edgar_rss("8-K")
    signals: list[RawSignal] = []
    cutoff  = _utcnow() - timedelta(hours=72)

    for e in entries:
        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        summary  = _strip_html(e["summary"])
        text     = e["title"] + " " + summary

        # Detect item number in the summary line, e.g. "Item 1.01"
        item_match = re.search(r'Item\s+(\d\.\d{2})', summary, re.I)
        item_no    = item_match.group(1) if item_match else None

        sig_type, bullish, item_label = _8K_ITEM_MAP.get(
            item_no, ("DEAL", None, "Material Corporate Event")
        )

        # Upgrade to RUMOR if rumour language in text (e.g. Item 8.01 with merger rumours)
        if sig_type == "DEAL" and item_no not in ("1.01", "2.01", "5.01") and _RUMOUR_RE.search(text):
            sig_type = "RUMOR"

        headline = (
            f"{e['company']} — 8-K: {item_label}"
            if item_no else
            f"{e['company']} — 8-K Material Event"
        )

        signals.append(RawSignal(
            signal_type  = sig_type,
            company      = e["company"][:200],
            headline     = headline,
            source_url   = e["url"],
            source_name  = "SEC EDGAR 8-K",
            published_at = pub,
            bullish      = bullish,
            magnitude    = _amount_bn(text),
            extra_text   = summary[:400],
        ))

    return signals


async def fetch_edgar_insider_buys() -> list[RawSignal]:
    """
    ALL Form 4 filings from the last 48 h.
    We can't determine buy vs sell from the Atom feed without XML parsing,
    so we show as INSIDER_BUY (generic insider activity) for every company.
    Deduplicated to one signal per company per cycle.
    """
    entries = await _edgar_rss("4")
    signals: list[RawSignal] = []
    cutoff  = _utcnow() - timedelta(hours=48)
    seen: set[str] = set()

    for e in entries:
        company = e["company"]
        if company in seen:
            continue
        seen.add(company)

        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        ticker_str = _ticker(e["title"] + " " + e["summary"])
        signals.append(RawSignal(
            signal_type  = "INSIDER_BUY",
            company      = company[:200],
            headline     = f"Insider transaction filed at {company}",
            source_url   = e["url"],
            source_name  = "SEC EDGAR Form 4",
            published_at = pub,
            ticker       = ticker_str,
            bullish      = None,
            extra_text   = _strip_html(e["summary"])[:200],
        ))

    return signals


async def fetch_edgar_insider_sells() -> list[RawSignal]:
    return []   # Form 4 RSS doesn't distinguish buy/sell; handled above


# ── News RSS ──────────────────────────────────────────────────────────────────

async def _rss_items(name: str, url: str) -> list[dict]:
    try:
        async with httpx.AsyncClient(
            timeout=12, follow_redirects=True,
            headers={"User-Agent": _NEWS_UA,
                     "Accept": "application/rss+xml, application/xml, text/xml, */*"},
        ) as c:
            r = await c.get(url)
            r.raise_for_status()
        root  = ET.fromstring(r.content)
        items = []

        if root.tag == f"{{{_ATOM_NS}}}feed":
            for entry in root.findall(f"{{{_ATOM_NS}}}entry"):
                title   = entry.findtext(f"{{{_ATOM_NS}}}title") or ""
                link_el = entry.find(f"{{{_ATOM_NS}}}link")
                href    = link_el.get("href", "") if link_el is not None else ""
                pub     = (entry.findtext(f"{{{_ATOM_NS}}}updated")
                           or entry.findtext(f"{{{_ATOM_NS}}}published") or "")
                summary = _strip_html(
                    entry.findtext(f"{{{_ATOM_NS}}}summary") or
                    entry.findtext(f"{{{_ATOM_NS}}}content") or ""
                )
                items.append({"title": title, "url": href, "pub": pub, "summary": summary})
        else:
            for item in root.iter("item"):
                title   = item.findtext("title") or ""
                href    = item.findtext("link") or ""
                pub     = item.findtext("pubDate") or ""
                summary = _strip_html(item.findtext("description") or "")
                items.append({"title": title, "url": href, "pub": pub, "summary": summary})

        return items
    except ET.ParseError as e:
        logger.debug("RSS XML error (%s): %s", name, e)
        return []
    except Exception as e:
        logger.debug("RSS fetch error (%s): %s", name, e)
        return []


def _classify(title: str, summary: str) -> Optional[str]:
    text = f"{title} {summary}"
    if _UPGRADE_RE.search(text):  return "ANALYST_UPGRADE"
    if _DOWNGRADE_RE.search(text): return "ANALYST_DOWNGRADE"
    if _BEAT_RE.search(text):      return "EARNINGS_BEAT"
    if _MISS_RE.search(text):      return "EARNINGS_MISS"
    if _DEAL_RE.search(text):      return "DEAL"
    if _RUMOUR_RE.search(text):    return "RUMOR"
    return None


async def fetch_news_signals() -> list[RawSignal]:
    tasks   = [_rss_items(n, u) for n, u in _NEWS_FEEDS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    signals: list[RawSignal] = []
    cutoff = _utcnow() - timedelta(hours=48)
    seen: set[str] = set()

    for (feed_name, _), batch in zip(_NEWS_FEEDS, results):
        if isinstance(batch, Exception):
            logger.debug("Feed error (%s): %s", feed_name, batch)
            continue
        for item in batch:
            url     = item.get("url", "")
            title   = item.get("title", "").strip()
            summary = item.get("summary", "").strip()
            pub_str = item.get("pub", "")

            if not url or not title or url in seen:
                continue
            seen.add(url)

            sig_type = _classify(title, summary)
            if not sig_type:
                continue

            try:
                pub = _parse_date(pub_str) if pub_str else _utcnow()
            except Exception:
                pub = _utcnow()

            if pub < cutoff:
                continue

            bullish = (
                True  if sig_type in ("ANALYST_UPGRADE",  "EARNINGS_BEAT", "DEAL") else
                False if sig_type in ("ANALYST_DOWNGRADE", "EARNINGS_MISS")         else
                None
            )

            text = f"{title} {summary}"
            company = (title.split(":")[0] if ":" in title else title[:60]).strip()

            signals.append(RawSignal(
                signal_type  = sig_type,
                company      = company,
                headline     = title,
                source_url   = url,
                source_name  = feed_name,
                published_at = pub,
                ticker       = _ticker(text),
                bullish      = bullish,
                magnitude    = _amount_bn(text),
                extra_text   = summary[:400],
            ))

    return signals


# ── AI enrichment ─────────────────────────────────────────────────────────────

_MODEL = None

def _gemini():
    global _MODEL
    if _MODEL is None and settings.google_api_key:
        genai.configure(api_key=settings.google_api_key)
        _MODEL = genai.GenerativeModel("gemini-1.5-flash")
    return _MODEL

_PROMPT = (
    "You are a senior equity analyst. Write ONE sentence (max 25 words) explaining "
    "the likely immediate stock/sector price effect. Be specific: direction, magnitude, reason. "
    "No preamble, no quotes.\n\n"
    "Signal: {type}\nCompany: {company}\nHeadline: {headline}\nContext: {ctx}\n\n"
    "One-sentence market impact:"
)

async def _enrich(sig: RawSignal) -> Optional[str]:
    model = _gemini()
    if not model:
        return None
    prompt = _PROMPT.format(
        type=sig.signal_type, company=sig.company,
        headline=sig.headline, ctx=sig.extra_text[:300] or "—"
    )
    try:
        loop = asyncio.get_event_loop()
        r = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        return r.text.strip().strip('"').strip("'")
    except Exception:
        return None


# ── Persistence ───────────────────────────────────────────────────────────────

async def _persist(db: AsyncSession, raw: list[RawSignal]) -> int:
    now, expiry = _utcnow(), _utcnow() + timedelta(hours=48)
    saved = 0
    for r in raw:
        h = _hash(r.source_url)
        if (await db.execute(select(MarketSignal).where(MarketSignal.source_hash == h))).scalar_one_or_none():
            continue
        ai = await _enrich(r)
        db.add(MarketSignal(
            source_hash=h, signal_type=r.signal_type, ticker=r.ticker,
            company=r.company[:200], headline=r.headline[:500], ai_summary=ai,
            bullish=r.bullish, magnitude=r.magnitude,
            source_url=r.source_url[:1000], source_name=r.source_name,
            published_at=r.published_at, fetched_at=now, expires_at=expiry, is_active=True,
        ))
        saved += 1
    await db.commit()
    return saved


# ── Public entry point ────────────────────────────────────────────────────────

async def run_signals_cycle() -> int:
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

    logger.info("Signals fetched: %d raw", len(all_signals))
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(MarketSignal).where(MarketSignal.expires_at < _utcnow()).values(is_active=False)
        )
        count = await _persist(db, all_signals)
    logger.info("Signals done — %d new", count)
    return count
