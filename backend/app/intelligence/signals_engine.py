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
from sqlalchemy import select, update, and_
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
    ("Seeking Alpha",  "https://seekingalpha.com/market_currents.xml"),
    ("Benzinga",       "https://www.benzinga.com/feed"),
    ("Investing.com",  "https://www.investing.com/rss/news_25.rss"),
]

# ── Broad classifiers (match common headline language) ────────────────────────

_RE_FLAGS = re.IGNORECASE

# Analyst actions — must mention a rating action verb
_UPGRADE_RE = re.compile(
    r'upgrad(?:e[ds]?|ing)|raises? (?:price )?target|initiates? (?:at |with )?(?:buy|overweight|outperform)'
    r'|starts? coverage (?:at |with )?(?:buy|overweight|outperform)'
    r'|resumes? (?:at |with )?(?:buy|overweight|outperform)'
    r'|(?:buy|overweight|outperform) from (?:neutral|hold|sell|underweight|underperform)',
    _RE_FLAGS,
)
_DOWNGRADE_RE = re.compile(
    r'downgrad(?:e[ds]?|ing)|cuts? (?:price )?target|lowers? (?:price )?target'
    r'|(?:neutral|hold|sell|underperform|underweight) from (?:buy|overweight|outperform|outperform)'
    r'|price target (?:cut|lower|reduc)',
    _RE_FLAGS,
)

# Earnings — must mention actual results vs expectations
_BEAT_RE = re.compile(
    r'beat[s]? (?:estimate|expectation|forecast|consensus|wall street|analyst)'
    r'|top[s]? (?:estimate|expectation|forecast|analyst)'
    r'|(?:Q[1-4]|quarter(?:ly)?) (?:earnings?|results?|profit).{0,40}(?:beat|top|exceed|surpass|above)'
    r'|record (?:revenue|profit|earnings|quarter|sales)'
    r'|above (?:estimate|expectation|consensus|forecast)'
    r'|surpass(?:es)? (?:estimate|expectation)'
    r'|(?:strong|better(?:.{0,10}than)?|solid|robust).{0,20}(?:earnings?|results?|quarter)'
    r'|shares? (?:rise|jump|surge|gain).{0,30}(?:earnings?|results?|quarter)',
    _RE_FLAGS,
)
_MISS_RE = re.compile(
    r'miss(?:es|ing)?\s*.{0,30}(?:estimate|expectation|forecast|consensus|wall street|analyst)'
    r'|falls? short'
    r'|(?:Q[1-4]|quarter(?:ly)?) (?:earnings?|results?|profit).{0,40}(?:miss|below|disappoint|fall short)'
    r'|profit.warning'
    r'|cuts? (?:guidance|outlook|forecast)'
    r'|lowers? (?:guidance|outlook|forecast)'
    r'|below (?:estimate|expectation|consensus|forecast)'
    r'|shares? (?:fall|drop|plunge|slide|sink).{0,30}(?:earnings?|results?|quarter)',
    _RE_FLAGS,
)

# M&A confirmed — strict: must indicate actual transaction, not "to buy" listicles
_DEAL_RE = re.compile(
    r'acquir(?:es?|ed|ing)\b|merger\b|acquisition\b'
    r'|definitive agreement|takeover (?:bid|offer|deal)'
    r'|going.private'
    r'|\$[\d.]+ (?:billion|bn|million) (?:deal|acquisition|merger|buyout|takeover)'
    r'|tender offer|deal (?:valued|worth)|buyout'
    r'|completes? (?:acquisition|merger|buyout|takeover)'
    r'|agrees? to (?:acquire|buy|merge|purchase)',
    _RE_FLAGS,
)

# Rumours / unconfirmed
_RUMOUR_RE = re.compile(
    r'report(?:ed)?ly|sources? (?:say|said|familiar|close to)'
    r'|said to (?:be |consider|explore|weigh|mull|fall|have|be )'
    r'|in talks? (?:to |about |with )'
    r'|considering (?:a )?(?:sale|bid|deal|merger|acquisition|buyout)'
    r'|potential (?:deal|merger|buyout|acquisition|takeover|buyer|sale)'
    r'|approach(?:ed|es|ing) (?:about|for|over) (?:a )?(?:deal|bid|merger)'
    r'|exploring? (?:a )?(?:sale|deal|merger|options?)'
    r'|(?:bid|offer|deal).{0,20}(?:said|reported|rumor|rumour)',
    _RE_FLAGS,
)

# ── Noise filter — reject headlines that aren't real market signals ──────────
_NOISE_RE = re.compile(
    r'\b(?:'
    # Personal finance / consumer
    r'retiree|retirement|401\(k\)|ira\s+contribution|pension|social\s+security'
    r'|pool\s+upgrade|home\s+renovation|contractor|landscap|remodel'
    r'|coupon|discount|deal\s+of\s+the\s+day|black\s+friday|cyber\s+monday'
    r'|best\s+(?:credit\s+cards?|savings?\s+accounts?|mortgage|loans?)'
    r'|how\s+to\s+(?:save|invest|buy|choose|pick|retire|budget)'
    r'|should\s+you\s+(?:buy|sell|invest|rent|refinance)'
    r'|what\s+(?:is|are)\s+(?:a\s+)?(?:roth|ira|etf|reit|annuity|bond)'
    r'|personal\s+finance|budgeting|debt\s+consolidation|net\s+worth'
    r'|student\s+loan|mortgage\s+rate|refinance|credit\s+score'
    r'|car\s+insurance|life\s+insurance|health\s+insurance|auto\s+insurance'
    # Listicles / opinion / clickbait
    r'\d+\s+(?:best|top|worst)\s+\w+'
    r'\d+\s+stocks?\s+(?:to\s+buy|down|up|that|you|for)'
    r'(?:best|top)\s+\w+\s+to\s+(?:buy|sell|invest|watch)'
    r'(?:buy|sell)\s+now|stocks?\s+to\s+buy\s+now'
    r'should\s+i\s+(?:buy|sell|invest)'
    r'is\s+(?:this|it)\s+(?:a\s+)?(?:signal|buy|sell)'
    r'what.{0,20}(?:behind|means|next|outlook)'
    r'why\s+(?:i\s+)?(?:bought|sold|bought|invested)'
    r'(?:my|our)\s+(?:contractor|pool|home|kitchen|bathroom|roof)'
    # Non-financial
    r'(?:recipe|restaurant|travel|hotel|flight|vacation|cruise)'
    r'(?:sport|nfl|nba|mlb|nhl|soccer|football|baseball|basketball|tennis|golf|olympics?)'
    r'(?:horoscope|astrology|zodiac)'
    r'(?:celebrity|gossip|entertainment|movie|tv\s+show|streaming|netflix|spotify|apple\s+tv)'
    r'(?:weather|forecast\s+for|temperature)'
    r')\b',
    re.IGNORECASE,
)

# ── Company identifier — headline must mention a real company/ticker ────────
# This is the key gate: if the headline doesn't reference a specific company
# (by ticker, Inc/Corp suffix, or known company name), it's not a tradeable signal.
_TICKER_RE = re.compile(
    r'(?:NYSE|NASDAQ|AMEX):\s*([A-Z]{1,5})'
    r'|\$([A-Z]{2,5})\b'
    r'|\(([A-Z]{2,5})\)(?=[\s,.])',
    re.ASCII,
)
_TICKER_CTX_RE = re.compile(
    r'\b([A-Z]{2,5})\s+(?:stock|shares|earnings)\b',
    re.ASCII,
)
# Company suffixes that indicate a real corporate entity
_COMPANY_RE = re.compile(
    r'\b(?:'
    r'(?:Inc\.?|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|LLC|LP)'
    r'|(?:Holdings|Group|Technologies?|Pharmaceuticals?|Therapeutics?)'
    r'|(?:Bancorp|Bancshares|Bank|Financial|Capital|Partners?)'
    r'|(?:Energy|Industries?|Materials|Chemicals?|Biotech|Bio)'
    r'|(?:Motors?|Airlines?|Airways?|Aerospace|Defense|Solutions?)'
    r')\b',
    re.IGNORECASE,
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
    if m:
        return next((g for g in m.groups() if g), None)
    # Fallback: "AAPL stock", "NVDA shares"
    m2 = _TICKER_CTX_RE.search(text)
    if m2:
        return m2.group(1)
    return None

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


# ── Non-tradeable entity filter ────────────────────────────────────────────────
# 8-K filings from these entity types are not actionable trade signals.
# They're SEC-registered but not publicly traded stocks.
_NON_TRADEABLE_RE = re.compile(
    r'\b(?:'
    r'mortgage\s+trust|receivables\s+trust|automobile\s+receivables|credit\s+card\s+receivables'
    r'|private\s+credit\s+fund|credit\s+income\s+fund|credit\s+solutions\s+fund'
    r'|real\s+estate\s+(?:income\s+)?(?:fund|trust)|income\s+property\s+trust'
    r'|private\s+equity\s+fund|hedge\s+fund|lending\s+fund|capital\s+(?:income|lending)\s+fund'
    r'|federal\s+home\s+loan\s+bank'
    r'|commodity\s+index\s+fund|oil\s+fund|gasoline\s+fund|natural\s+gas\s+fund'
    r'|commodity\s+index\s+funds\s+trust'
    r'|asset\s+backed\s+securities|ABS\s+trust'
    r'|merger\s+corp\.?(?:\s|$)|SPAC\b'
    r'|enhanced\s+corporate\s+lending'
    r'|private\s+capital\s+income'
    r')\b',
    re.IGNORECASE,
)

# Suffixes / entity types that indicate non-public entities
_NON_PUBLIC_SUFFIX_RE = re.compile(
    r'\b(?:LLC|L\.P\.|LP|Ltd\.?|Limited)$',
    re.IGNORECASE,
)


def _is_tradeable(company: str) -> bool:
    """Filter out non-public entities (trusts, funds, SPACs, private cos)."""
    if _NON_TRADEABLE_RE.search(company):
        return False
    if _NON_PUBLIC_SUFFIX_RE.search(company):
        return False
    return True


# ── Signal fetchers ───────────────────────────────────────────────────────────

async def fetch_edgar_deals() -> list[RawSignal]:
    """
    8-K filings from the last 72h that are tradeable public companies.
    Filters out mortgage trusts, private credit funds, SPACs, and other
    non-stock entities that flood the feed with noise.
    """
    entries = await _edgar_rss("8-K")
    signals: list[RawSignal] = []
    cutoff  = _utcnow() - timedelta(hours=72)

    for e in entries:
        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        company = e["company"]

        # Skip non-tradeable entities (trusts, funds, SPACs, private cos)
        if not _is_tradeable(company):
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
            f"{company} — 8-K: {item_label}"
            if item_no else
            f"{company} — 8-K Material Event"
        )

        signals.append(RawSignal(
            signal_type  = sig_type,
            company      = company[:200],
            headline     = headline,
            source_url   = e["url"],
            source_name  = "SEC EDGAR 8-K",
            published_at = pub,
            ticker       = _ticker(text),
            bullish      = bullish,
            magnitude    = _amount_bn(text),
            extra_text   = summary[:400],
        ))

    return signals


async def fetch_edgar_insider_buys() -> list[RawSignal]:
    """
    Form 4 filings — fetch XML for the top 15 to determine actual buy vs sell.
    Falls back to WATCH if we can't parse direction.
    """
    entries = await _edgar_rss("4")
    signals: list[RawSignal] = []
    cutoff  = _utcnow() - timedelta(hours=48)
    seen: set[str] = set()

    for e in entries[:15]:   # only top 15 to avoid hammering EDGAR
        company = e["company"]
        if company in seen:
            continue
        seen.add(company)

        pub = _parse_date(e["updated"]) if e["updated"] else _utcnow()
        if pub < cutoff:
            continue

        ticker_str = _ticker(e["title"] + " " + e["summary"])

        # Try to parse the filing XML to determine buy vs sell
        direction = await _parse_form4_direction(e["url"])
        if direction is None:
            # Skip if we can't determine direction — not useful to show as WATCH
            continue

        is_buy = direction == "buy"
        signals.append(RawSignal(
            signal_type  = "INSIDER_BUY" if is_buy else "INSIDER_SELL",
            company      = company[:200],
            headline     = f"Insider {'purchase' if is_buy else 'sale'} at {company}",
            source_url   = e["url"],
            source_name  = "SEC EDGAR Form 4",
            published_at = pub,
            ticker       = ticker_str,
            bullish      = is_buy,
            extra_text   = f"{'Executive open-market purchase' if is_buy else 'Insider open-market sale'} at {company}. Insider transactions often precede significant price moves.",
        ))

    return signals


async def _parse_form4_direction(filing_index_url: str) -> str | None:
    """
    Fetch a Form 4 filing index and parse the XML to determine buy vs sell.
    Returns 'buy', 'sell', or None if undetermined.
    """
    try:
        # Convert index page URL to .json index for document listing
        # e.g. https://www.sec.gov/Archives/edgar/data/.../0001234-26-000001-index.htm
        # →    https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany... (can't easily get XML)
        # Instead: fetch the filing page and look for form4.xml link
        async with httpx.AsyncClient(
            timeout=10, headers={"User-Agent": _EDGAR_UA}, follow_redirects=True
        ) as c:
            r = await c.get(filing_index_url)
            r.raise_for_status()
            html = r.text

        # Find link to form4.xml or primary document
        xml_match = re.search(r'href="(/Archives/edgar/data/[^"]+\.xml)"', html, re.I)
        if not xml_match:
            return None

        xml_url = "https://www.sec.gov" + xml_match.group(1)
        async with httpx.AsyncClient(
            timeout=10, headers={"User-Agent": _EDGAR_UA}, follow_redirects=True
        ) as c:
            r2 = await c.get(xml_url)
            r2.raise_for_status()
            root = ET.fromstring(r2.content)

        # Sum acquired (A) vs disposed (D) shares in nonDerivativeTransaction
        acquired  = 0.0
        disposed  = 0.0
        for tx in root.iter("nonDerivativeTransaction"):
            code = (tx.findtext(".//transactionAcquiredDisposedCode/value") or "").strip().upper()
            try:
                shares = float(tx.findtext(".//transactionShares/value") or "0")
            except ValueError:
                shares = 0.0
            if code == "A":
                acquired += shares
            elif code == "D":
                disposed += shares

        if acquired == 0 and disposed == 0:
            return None
        return "buy" if acquired >= disposed else "sell"

    except Exception as e:
        logger.debug("Form 4 XML parse failed: %s", e)
        return None


async def fetch_edgar_insider_sells() -> list[RawSignal]:
    # Sells are already captured by fetch_edgar_insider_buys (which parses
    # Form 4 direction and returns INSIDER_SELL for disposal transactions).
    # This no-op exists only for the gather() symmetry in run_signals_cycle.
    return []


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


# Dollar amount extractor
_AMOUNT_RE = re.compile(r'\$\s*(\d+(?:\.\d+)?)\s*(billion|bn|million|mn|[bm])\b', _RE_FLAGS)

# ── Noise filter — headlines that look like signals but aren't ─────────────────
# Already defined above with the expanded pattern set.
# This section removed to avoid duplicate _NOISE_RE.


# ── Known company names for the company-identifier gate ─────────────────────
# If a headline mentions any of these, it passes the "is this a real company?" check.
_KNOWN_COMPANIES = {
    # Mag 7 + major tech
    "nvidia", "apple", "google", "alphabet", "microsoft", "amazon", "meta",
    "tesla", "netflix", "spotify", "uber", "airbnb", "palantir",
    "salesforce", "oracle", "intel", "amd", "qualcomm", "snowflake",
    "broadcom", "avgo", "tsmc", "asml", "applied materials", "klac",
    "anthropic", "openai", "deepmind", "crowdstrike", "okta", "workday",
    # Finance
    "jpmorgan", "goldman sachs", "morgan stanley", "bank of america",
    "wells fargo", "citigroup", "blackrock", "blackstone", "vanguard",
    "fidelity", "berkshire", "klarna", "paypal", "block", "coinbase",
    "visa", "mastercard", "allstate", "progressive",
    # Defense
    "lockheed martin", "raytheon", "northrop grumman", "boeing",
    "general dynamics", "l3harris", "hii",
    # Energy
    "exxonmobil", "chevron", "shell", "bp", "totalenergies", "conocophillips",
    # Pharma/Biotech
    "pfizer", "moderna", "johnson & johnson", "abbvie", "merck", "eli lilly",
    "biontech", "novartis", "roche", "astrazeneca", "gilead", "regeneron",
    # Retail/Consumer
    "walmart", "target", "costco", "home depot", "lowe's", "ulta beauty",
    "estee lauder", "mcdonald's", "starbucks", "nike", "coca-cola", "pepsi",
    "advance auto parts", "autozone",
    # Industrial/Other
    "general electric", "3m", "caterpillar", "deere", "fedex", "ups",
    "delta airlines", "united airlines", "american airlines",
    "take-two", "rockstar", "samsung", "sony", "nintendo",
    # Crypto companies
    "binance", "ripple", "coinbase", "kraken", "bitgo", "nydig",
    "microstrategy", "strategy", "iren", "marathon digital",
    # Media
    "fox", "disney", "warner", "paramount", "comcast", "discovery",
}


def _has_company_identifier(title: str, summary: str) -> bool:
    """Check if the headline references a real company — by ticker, suffix, or known name."""
    text = f"{title} {summary}".lower()
    # Ticker pattern: (AAPL), $AAPL, NYSE: AAPL
    if _TICKER_RE.search(title) or _TICKER_CTX_RE.search(title):
        return True
    # Company suffix: Inc, Corp, Ltd, etc.
    if _COMPANY_RE.search(text):
        return True
    # Known company name
    for name in _KNOWN_COMPANIES:
        if name in text:
            return True
    return False


def _classify(title: str, summary: str) -> Optional[str]:
    text = f"{title} {summary}"

    # Gate 1: Reject noise (personal finance, listicles, sports, etc.)
    if _NOISE_RE.search(title):
        return None

    # Gate 2: Must reference a real company
    if not _has_company_identifier(title, summary):
        return None

    # Gate 3: Classify by signal type
    # Check RUMOR before DEAL — a "takeover bid said to fall through" is a rumour,
    # not a confirmed deal. Only classify as DEAL if no rumour language is present.
    if _RUMOUR_RE.search(text):    return "RUMOR"
    if _UPGRADE_RE.search(text):   return "ANALYST_UPGRADE"
    if _DOWNGRADE_RE.search(text): return "ANALYST_DOWNGRADE"
    if _BEAT_RE.search(text):      return "EARNINGS_BEAT"
    if _MISS_RE.search(text):      return "EARNINGS_MISS"
    if _DEAL_RE.search(text):      return "DEAL"
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
        _MODEL = genai.GenerativeModel(settings.gemini_model)
    return _MODEL

_PROMPT = (
    "You are a senior equity trader at a hedge fund. Based on this market signal, give a clear "
    "actionable trade recommendation.\n\n"
    "Signal : {type}\n"
    "Company: {company}\n"
    "News   : {headline}\n"
    "Context: {ctx}\n\n"
    "Respond in EXACTLY this format (one line, no extra text):\n"
    "ACTION | reason (max 20 words)\n\n"
    "ACTION must be one of: BUY | SHORT | HOLD | WATCH\n"
    "- BUY   = clear upside catalyst, enter long position\n"
    "- SHORT = clear downside catalyst, consider short or put options\n"
    "- HOLD  = existing holders stay, no new entry yet\n"
    "- WATCH = developing situation, monitor before acting\n\n"
    "Examples:\n"
    "BUY | Insider cluster purchase signals Q2 beat — enter before earnings catalyst\n"
    "SHORT | Profit warning + guidance cut likely triggers 10-15% drawdown\n"
    "WATCH | M&A rumour unconfirmed — wait for official announcement before entry\n\n"
    "Your recommendation:"
)

async def _enrich(sig: RawSignal) -> Optional[str]:
    prompt = _PROMPT.format(
        type=sig.signal_type, company=sig.company,
        headline=sig.headline, ctx=sig.extra_text[:300] or "—"
    )

    # Try Gemini first
    model = _gemini()
    if model:
        try:
            loop = asyncio.get_event_loop()
            r = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
            text = r.text.strip().strip('"').strip("'")
            return text if text else None
        except Exception as e:
            logger.debug("Gemini enrich failed: %s", e)

    # Fallback: OpenAI
    if settings.openai_api_key:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            r = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=1,
                max_completion_tokens=200,
            )
            text = r.choices[0].message.content
            if not text or not text.strip():
                return None
            return text.strip().strip('"').strip("'")
        except Exception as e:
            logger.debug("OpenAI enrich failed: %s", e)

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


async def _backfill_enrichment(db: AsyncSession, limit: int = 20) -> int:
    """Enrich existing signals that have ai_summary=None.
    Called after each cycle to gradually fill in missing analyses."""
    result = await db.execute(
        select(MarketSignal).where(
            and_(
                MarketSignal.ai_summary.is_(None),
                MarketSignal.is_active.is_(True),
            )
        ).limit(limit)
    )
    signals = result.scalars().all()
    if not signals:
        return 0

    enriched = 0
    for s in signals:
        raw = RawSignal(
            signal_type=s.signal_type,
            company=s.company or "",
            headline=s.headline or "",
            source_url=s.source_url or "",
            source_name=s.source_name or "",
            published_at=s.published_at or _utcnow(),
            extra_text=(s.headline or "")[:400],
        )
        ai = await _enrich(raw)
        if ai:
            s.ai_summary = ai
            enriched += 1
    await db.commit()
    logger.info("Backfilled %d/%d signal enrichments", enriched, len(signals))
    return enriched


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
        # Backfill missing AI summaries for existing signals
        await _backfill_enrichment(db)
    logger.info("Signals done — %d new", count)
    return count
