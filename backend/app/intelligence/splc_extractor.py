"""
Supply Chain Extractor — Multi-source (free forever)

Data sources (in priority order):
  1. Wikipedia  — company article + "supply chain" / "suppliers" sections
  2. SEC EDGAR  — 10-K sections (Items 1, 1A, 7) for corroboration
  3. LLM knowledge — fills gaps for well-known companies

Pipeline:
  1.  Resolve ticker → CIK + legal name (SEC EDGAR ticker map)
  2.  Fetch Wikipedia article for the company (plaintext via MediaWiki API)
  3.  Fetch SEC 10-K excerpt as supplementary context
  4.  LLM extraction combining all sources + model knowledge
  5.  Merge + deduplicate relationships
  6.  Upsert SCCompany + SCEdge rows
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from html import unescape

import httpx
from openai import AsyncOpenAI
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.supply_chain import SCCompany, SCEdge

settings = get_settings()
logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "WorldState OSINT Platform worldstate-osint@proton.me",
    "Accept-Encoding": "gzip, deflate",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

EDGAR_BASE     = "https://data.sec.gov"
EDGAR_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
WIKI_API       = "https://en.wikipedia.org/w/api.php"

_ticker_cache: dict[str, str] = {}


# ─── SEC EDGAR helpers (metadata only) ────────────────────────────────────

async def _resolve_cik(ticker: str, client: httpx.AsyncClient) -> str:
    global _ticker_cache
    if not _ticker_cache:
        r = await client.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=HEADERS, timeout=30,
        )
        r.raise_for_status()
        _ticker_cache = {
            v["ticker"].upper(): str(v["cik_str"])
            for v in r.json().values()
        }
    cik = _ticker_cache.get(ticker.upper())
    if not cik:
        raise ValueError(f"Ticker '{ticker}' not found in SEC EDGAR.")
    return cik


async def _get_company_meta(ticker: str, client: httpx.AsyncClient) -> dict:
    """Return legal name, SIC, filing date from SEC submissions feed."""
    cik = await _resolve_cik(ticker, client)
    r = await client.get(
        f"{EDGAR_BASE}/submissions/CIK{cik.zfill(10)}.json",
        headers=HEADERS, timeout=30,
    )
    r.raise_for_status()
    sub = r.json()

    recent = sub.get("filings", {}).get("recent", {})
    forms  = recent.get("form", [])
    accs   = recent.get("accessionNumber", [])
    dates  = recent.get("filingDate", [])
    pdocs  = recent.get("primaryDocument", [])

    filing_date = None
    accession   = None
    primary_doc = None
    for form, acc, dt, pdoc in zip(forms, accs, dates, pdocs):
        if form in ("10-K", "10-K/A"):
            filing_date = dt
            accession   = acc
            primary_doc = pdoc
            break

    return {
        "cik":         cik,
        "legal_name":  sub.get("name", ticker),
        "sic_code":    str(sub.get("sic", "")),
        "sic_desc":    sub.get("sicDescription", ""),
        "hq_country":  sub.get("stateOfIncorporation", ""),
        "filing_date": filing_date,
        "accession":   accession,
        "primary_doc": primary_doc,
    }


# ─── Wikipedia source ─────────────────────────────────────────────────────

async def _fetch_wiki_article(title: str, client: httpx.AsyncClient) -> str:
    """Fetch a single Wikipedia article by exact title. Returns plaintext or ''."""
    try:
        er = await client.get(WIKI_API, params={
            "action":          "query",
            "prop":            "extracts",
            "titles":          title,
            "format":          "json",
            "explaintext":     True,
            "exsectionformat": "plain",
        }, timeout=20)
        pages = er.json().get("query", {}).get("pages", {})
        for page in pages.values():
            text = page.get("extract", "")
            if len(text) > 300:
                return text
    except Exception as exc:
        logger.debug(f"SPLC Wikipedia article '{title}' failed: {exc}")
    return ""


async def _search_wiki_title(query: str, client: httpx.AsyncClient,
                             prefer: list[str] | None = None) -> str | None:
    """Search Wikipedia for a query, return best matching title or None."""
    try:
        sr = await client.get(WIKI_API, params={
            "action":   "query",
            "list":     "search",
            "srsearch": query,
            "format":   "json",
            "srlimit":  5,
        }, timeout=15)
        results = sr.json().get("query", {}).get("search", [])
        if not results:
            return None
        # Prefer results matching any of the hint strings
        for hint in (prefer or []):
            for r in results:
                if hint.lower() in r["title"].lower():
                    return r["title"]
        return results[0]["title"]
    except Exception as exc:
        logger.debug(f"SPLC Wikipedia search '{query}' failed: {exc}")
        return None


async def _fetch_wikipedia(company_name: str, ticker: str,
                           client: httpx.AsyncClient) -> str:
    """
    Fetch Wikipedia text for the company.
    Strategy:
      1. Try dedicated supply-chain article (e.g. "Apple Inc. supply chain")
      2. Try main company article
      3. Try ticker/name searches as fallback
    Returns up to 40 000 chars (combined), or empty string on total failure.
    """
    chunks: list[str] = []

    # --- Attempt 1: dedicated supply-chain article -------------------------
    sc_title = f"{company_name} supply chain"
    sc_text  = await _fetch_wiki_article(sc_title, client)
    if len(sc_text) > 300:
        logger.info(f"SPLC: Wikipedia SC article '{sc_title}' → {len(sc_text):,} chars")
        chunks.append(f"=== {sc_title} ===\n{sc_text[:18_000]}")

    # --- Attempt 2: main company article -----------------------------------
    # Try direct title first (faster than search)
    main_text = await _fetch_wiki_article(company_name, client)
    if len(main_text) < 500:
        # Fall back to search
        queries = [
            company_name,
            f"{ticker} company",
            f"{company_name.split()[0]} corporation",
        ]
        for q in queries:
            title = await _search_wiki_title(
                q, client,
                prefer=[ticker, company_name.split()[0]],
            )
            if title:
                main_text = await _fetch_wiki_article(title, client)
                if len(main_text) > 500:
                    logger.info(f"SPLC: Wikipedia '{title}' → {len(main_text):,} chars")
                    break

    if len(main_text) > 500:
        chunks.append(f"=== {company_name} (Wikipedia) ===\n{main_text[:22_000]}")

    if not chunks:
        logger.warning(f"SPLC: Wikipedia article not found for {company_name} / {ticker}")
        return ""

    return "\n\n".join(chunks)[:40_000]


# ─── SEC 10-K supplementary text ──────────────────────────────────────────

_REMOVE_BLOCK_RE = re.compile(
    r'<(style|script|head|ix:header|ix:hidden|xbrli:context|xbrli:unit|'
    r'xbrli:xbrl|link:\w+|labelLink|referenceLink)[^>]*>.*?</\1>',
    flags=re.DOTALL | re.IGNORECASE,
)
_IXBRL_TAG_RE = re.compile(r'</?ix:[^>]+>', flags=re.IGNORECASE)
_XBRL_TAG_RE  = re.compile(r'</?[a-z]+:[^>]+>', flags=re.IGNORECASE)
_HTML_TAG_RE  = re.compile(r'<[^>]+>')

_SUPPLY_KEYWORDS = (
    'customer', 'supplier', 'vendor', 'manufacturer', 'partner', 'distributor',
    'percent of revenue', '% of revenue', 'sole source', 'single source',
    'contract manufacturer', 'concentration', 'significant customer',
    'foundry', 'assembly', 'logistics', 'supply chain', 'procurement',
)

_SECTIONS = [
    ("Business",      r'item\s+1[\.\s]+business\b',              r'item\s+1a\b|item\s+2\b'),
    ("Risk Factors",  r'item\s+1a[\.\s]+risk\s+factors\b',       r'item\s+1b\b|item\s+2\b'),
    ("MD&A",          r'item\s+7[\.\s]+management.{0,30}discussion', r'item\s+7a\b|item\s+8\b'),
]


def _strip_html(html: str) -> str:
    html = _REMOVE_BLOCK_RE.sub(' ', html)
    html = _IXBRL_TAG_RE.sub(' ', html)
    html = _XBRL_TAG_RE.sub(' ', html)
    html = _HTML_TAG_RE.sub(' ', html)
    html = unescape(html)
    return re.sub(r'\s+', ' ', html).strip()


def _extract_sec_sections(text: str, max_chars: int = 15_000) -> str:
    """Pull Items 1, 1A, 7 from 10-K text. Returns up to max_chars."""
    lower    = text.lower()
    sections: list[str] = []

    for label, start_pat, stop_pat in _SECTIONS:
        m = re.search(start_pat, lower)
        if not m:
            continue
        body_start = m.end()
        m2 = re.search(stop_pat, lower[body_start:])
        body_end = body_start + (m2.start() if m2 else 12_000)
        chunk = text[body_start:body_end].strip()
        if len(chunk) > 200:
            sections.append(f"=== {label} ===\n{chunk[:5_000]}")

    if not sections:
        # Fallback: keyword sentences
        sents   = re.split(r'(?<=[.!?])\s+', text)
        relevant = [s for s in sents if any(kw in s.lower() for kw in _SUPPLY_KEYWORDS)]
        if relevant:
            sections.append("=== Key Sentences ===\n" + ' '.join(relevant[:200]))

    return '\n\n'.join(sections)[:max_chars]


async def _fetch_sec_excerpt(meta: dict, client: httpx.AsyncClient) -> str:
    """Download 10-K and return cleaned relevant sections (best-effort)."""
    if not meta.get("accession") or not meta.get("primary_doc"):
        return ""
    try:
        cik       = meta["cik"]
        acc_clean = meta["accession"].replace("-", "")
        url       = f"{EDGAR_ARCHIVES}/{cik}/{acc_clean}/{meta['primary_doc']}"
        r = await client.get(url, headers=HEADERS, timeout=60)
        r.raise_for_status()
        plain = _strip_html(r.text)
        return _extract_sec_sections(plain)
    except Exception as exc:
        logger.warning(f"SPLC: SEC excerpt fetch failed: {exc}")
        return ""


# ─── LLM extraction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a senior financial supply chain analyst with encyclopedic knowledge of global corporations.

You will receive:
  [WIKIPEDIA]  — Wikipedia article(s) for the company (primary source — trust named entities here)
  [SEC 10-K]   — excerpt from the latest SEC 10-K filing (supplementary context)

Your task: extract the MOST COMPREHENSIVE list of named supply chain relationships possible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. REAL NAMES ONLY — every entity must have a specific company name.
   GOOD: "TSMC", "Foxconn Technology Group", "Samsung Electronics"
   BAD:  "a Taiwanese chip maker", "contract manufacturers", "certain customers"

2. USE ALL THREE SOURCES:
   a) Wikipedia text provided — named companies mentioned there
   b) SEC 10-K text provided — named companies mentioned there
   c) YOUR TRAINING KNOWLEDGE — for well-known companies you know the full supply chain.
      Apple → TSMC, Foxconn/Hon Hai, Pegatron, Luxshare, Samsung, SK Hynix, Broadcom, Qualcomm...
      TSMC → Apple, NVIDIA, AMD, Qualcomm, Intel... as DOWNSTREAM customers
      Use this knowledge aggressively. It is accurate for well-known companies.

3. MINIMUM TARGETS (extract at least this many if they exist publicly):
   • UPSTREAM suppliers:   ≥ 15 (components, manufacturing, materials, logistics, software)
   • DOWNSTREAM customers: ≥ 8  (major buyers, distributors, channel partners)
   • COMPETITORS:          ≥ 5  (direct market competitors)

4. INCLUDE ALL CATEGORIES:
   Suppliers: raw materials, components, chip foundries, assemblers/EMS, ODMs, software, cloud, logistics
   Customers: direct enterprise customers, major retailers, distribution partners, OEM customers
   Competitors: all direct product/market competitors you know

5. RESOLVE ALIASES to best-known name:
   "Foxconn" → "Foxconn Technology Group" (Hon Hai Precision Industry)
   "Samsung" → "Samsung Electronics" (not "Samsung Group")

6. TIER ASSIGNMENT:
   Tier 1 = direct supplier/customer (direct commercial relationship)
   Tier 2 = supplier's supplier (indirect, e.g. component supplier to an EMS)

7. COUNTRY CODES: Use ISO-3166-1 alpha-3 (TWN, CHN, USA, KOR, JPN, DEU, etc.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — return ONLY valid JSON:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "company_name": "<official legal name>",
  "relationships": [
    {
      "entity_name":       "<real company name>",
      "direction":         "UPSTREAM" | "DOWNSTREAM" | "COMPETITOR",
      "relationship_type": "SUPPLIER" | "CUSTOMER" | "CONTRACT_MANUFACTURER" | "FOUNDRY" | "JV_PARTNER" | "LICENSEE" | "DISTRIBUTOR" | "RESELLER" | "LOGISTICS",
      "tier":              1,
      "pct_revenue":       <float | null>,
      "pct_cogs":          <float | null>,
      "sole_source":       <true | false>,
      "hq_country":        "<ISO-3166-1 alpha-3 | null>",
      "confidence":        <0.1–1.0>,
      "disclosure_type":   "DISCLOSED" | "ESTIMATED" | "INFERRED",
      "evidence":          "<verbatim quote from source, OR 'Model knowledge: [brief reason]'>"
    }
  ]
}

Confidence:
  1.0  = named + quantified in source
  0.85 = named explicitly in Wikipedia or 10-K
  0.65 = well-known/widely reported relationship (model knowledge)
  0.40 = inferred from strong context

disclosure_type:
  DISCLOSED = named with figures in filing/Wikipedia
  ESTIMATED = named; figures estimated from context
  INFERRED  = from model knowledge or contextual inference

direction:
  UPSTREAM   = entity supplies TO the focal company
  DOWNSTREAM = focal company supplies TO this entity (i.e. this entity is a customer)
  COMPETITOR = competes in the same primary market

Do NOT hallucinate obscure or unverifiable relationships. If uncertain, use confidence ≤ 0.4.
"""


async def _run_llm_extraction(
    ticker: str,
    company_name: str,
    wiki_text: str,
    sec_text: str,
) -> list[dict]:
    """Single LLM call combining Wikipedia + SEC + model knowledge."""
    oai = AsyncOpenAI(api_key=settings.openai_api_key)

    wiki_block = f"[WIKIPEDIA]\n{wiki_text}" if wiki_text else "[WIKIPEDIA]\n(not available)"
    sec_block  = f"[SEC 10-K]\n{sec_text}"   if sec_text  else "[SEC 10-K]\n(not available)"

    user_msg = (
        f"Focal company: {company_name} (ticker: {ticker})\n\n"
        f"{wiki_block}\n\n"
        f"{sec_block}"
    )

    try:
        resp = await oai.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.15,
            max_tokens=8000,
        )
        data = json.loads(resp.choices[0].message.content)
        rels = data.get("relationships", [])
        logger.info(f"SPLC LLM: extracted {len(rels)} relationships for {ticker}")
        return rels
    except Exception as exc:
        logger.error(f"SPLC LLM extraction failed for {ticker}: {exc}")
        return []


def _merge_relationships(all_rels: list[dict]) -> list[dict]:
    """Deduplicate by (entity_name_lower, direction). Keep highest confidence."""
    seen: dict[tuple, dict] = {}
    for rel in all_rels:
        name = (rel.get("entity_name") or "").strip()
        if not name or name.lower().startswith("[unnamed]"):
            continue
        direction = rel.get("direction", "UPSTREAM")
        key = (name.lower(), direction)
        if key not in seen or (rel.get("confidence") or 0) > (seen[key].get("confidence") or 0):
            seen[key] = rel
        else:
            ev_old = seen[key].get("evidence") or ""
            ev_new = rel.get("evidence") or ""
            if ev_new and ev_new not in ev_old:
                seen[key]["evidence"] = (ev_old + " | " + ev_new)[:800]
    return list(seen.values())


# ─── Search endpoint helper ────────────────────────────────────────────────

async def search_companies_by_name(q: str) -> list[dict]:
    """Search SEC ticker map by name or ticker. Returns [{ticker, name, cik}]."""
    global _ticker_cache
    if not _ticker_cache:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://www.sec.gov/files/company_tickers.json",
                headers=HEADERS, timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            _ticker_cache = {
                v["ticker"].upper(): str(v["cik_str"])
                for v in data.values()
            }
            # Build name map separately
            _name_map = {
                v["ticker"].upper(): v.get("title", "")
                for v in data.values()
            }
    else:
        # Rebuild name map from raw data if cache already populated
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://www.sec.gov/files/company_tickers.json",
                headers=HEADERS, timeout=30,
            )
            data = r.json()
            _name_map = {
                v["ticker"].upper(): v.get("title", "")
                for v in data.values()
            }

    q_upper = q.upper()
    q_lower = q.lower()
    results = []
    for ticker, name in _name_map.items():
        if ticker.startswith(q_upper) or q_lower in name.lower():
            results.append({
                "ticker": ticker,
                "name":   name,
                "cik":    _ticker_cache.get(ticker, ""),
            })
        if len(results) >= 10:
            break
    return results


# ─── Public entry point ───────────────────────────────────────────────────

async def extract_supply_chain(ticker: str, db: AsyncSession) -> dict:
    """
    Full pipeline: multi-source → LLM → PostgreSQL upsert.
    Sources: Wikipedia (primary) + SEC 10-K (supplementary) + LLM knowledge.
    """
    ticker = ticker.upper().strip()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 1. Company metadata from SEC
        meta = await _get_company_meta(ticker, client)
        logger.info(f"SPLC: {ticker} → {meta['legal_name']} (CIK {meta['cik']})")

        # 2. Wikipedia article (primary source)
        wiki_text = await _fetch_wikipedia(meta["legal_name"], ticker, client)

        # 3. SEC 10-K excerpt (supplementary)
        sec_text = await _fetch_sec_excerpt(meta, client)

    logger.info(
        f"SPLC {ticker}: Wikipedia {len(wiki_text):,} chars, "
        f"SEC {len(sec_text):,} chars"
    )

    # 4. LLM extraction
    raw_rels = await _run_llm_extraction(
        ticker, meta["legal_name"], wiki_text, sec_text
    )
    relationships = _merge_relationships(raw_rels)
    logger.info(f"SPLC {ticker}: {len(raw_rels)} raw → {len(relationships)} merged")

    # 5. Upsert SCCompany
    as_of = (
        date.fromisoformat(meta["filing_date"])
        if meta.get("filing_date") else date.today()
    )

    res     = await db.execute(select(SCCompany).where(SCCompany.ticker == ticker))
    company = res.scalar_one_or_none()

    if company is None:
        company = SCCompany(
            ticker           = ticker,
            cik              = meta["cik"],
            legal_name       = meta["legal_name"],
            sector           = meta.get("sic_desc"),
            sic_code         = meta.get("sic_code"),
            last_filing_date = as_of,
        )
        db.add(company)
        await db.flush()
    else:
        company.legal_name       = meta["legal_name"]
        company.sector           = meta.get("sic_desc")
        company.last_filing_date = as_of
        await db.execute(delete(SCEdge).where(SCEdge.focal_id == company.id))
        await db.flush()

    # 6. Insert edges
    edges_inserted = 0
    for rel in relationships:
        direction = rel.get("direction", "UPSTREAM")
        if direction not in ("UPSTREAM", "DOWNSTREAM", "COMPETITOR"):
            continue

        entity_name = (rel.get("entity_name") or "").strip()
        if not entity_name or entity_name.lower().startswith("[unnamed]"):
            continue

        edge = SCEdge(
            focal_id          = company.id,
            entity_name       = entity_name[:255],
            entity_ticker     = rel.get("entity_ticker"),
            direction         = direction,
            relationship_type = rel.get("relationship_type", "SUPPLIER"),
            tier              = int(rel.get("tier") or 1),
            pct_revenue       = rel.get("pct_revenue"),
            pct_cogs          = rel.get("pct_cogs"),
            sole_source       = bool(rel.get("sole_source", False)),
            disclosure_type   = rel.get("disclosure_type", "INFERRED"),
            confidence        = float(rel.get("confidence") or 0.75),
            evidence          = (rel.get("evidence") or "")[:1000],
            hq_country        = rel.get("hq_country"),
            as_of_date        = as_of,
        )
        db.add(edge)
        edges_inserted += 1

    await db.commit()
    await db.refresh(company)

    logger.info(f"SPLC: {ticker} → {edges_inserted} relationships stored")

    return {
        "company": {
            "id":               str(company.id),
            "ticker":           company.ticker,
            "legal_name":       company.legal_name,
            "sector":           company.sector,
            "last_filing_date": str(company.last_filing_date) if company.last_filing_date else None,
        },
        "edges_created": edges_inserted,
        "filing_date":   meta.get("filing_date"),
        "source":        "Wikipedia + SEC EDGAR + LLM knowledge (free)",
    }
