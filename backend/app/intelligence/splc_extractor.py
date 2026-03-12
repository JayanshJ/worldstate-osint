"""
Supply Chain Extractor — SEC EDGAR + LLM (free forever)

Free data sources:
  • https://www.sec.gov/files/company_tickers.json  — ticker → CIK
  • https://data.sec.gov/submissions/CIK{n}.json    — company + filing list
  • https://www.sec.gov/Archives/edgar/data/…       — 10-K documents

Pipeline:
  1.  Resolve ticker → CIK
  2.  Find latest 10-K in submissions feed
  3.  Fetch the filing document index to pick the best text source
  4.  Download + clean (handles iXBRL, plain HTML, .txt wrappers)
  5.  Extract relevant sections (Items 1, 1A, 7)
  6.  Multi-chunk LLM extraction (3 chunks × ~13 k chars)
  7.  Merge + deduplicate relationships
  8.  Upsert SCCompany + SCEdge rows
"""

from __future__ import annotations

import json
import logging
import re
import uuid
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

_ticker_cache: dict[str, str] = {}


# ─── EDGAR helpers ────────────────────────────────────────────────────────

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


async def _get_latest_10k(cik: str, client: httpx.AsyncClient) -> dict:
    """Return metadata dict for the most recent 10-K (or 10-K/A)."""
    r = await client.get(
        f"{EDGAR_BASE}/submissions/CIK{cik.zfill(10)}.json",
        headers=HEADERS, timeout=30,
    )
    r.raise_for_status()
    sub = r.json()

    recent = sub.get("filings", {}).get("recent", {})
    forms   = recent.get("form",            [])
    accs    = recent.get("accessionNumber", [])
    dates   = recent.get("filingDate",      [])
    pdocs   = recent.get("primaryDocument", [])

    for form, acc, dt, pdoc in zip(forms, accs, dates, pdocs):
        if form in ("10-K", "10-K/A"):
            return {
                "accession":   acc,
                "filed_date":  dt,
                "primary_doc": pdoc,
                "legal_name":  sub.get("name", ""),
                "sic_code":    str(sub.get("sic", "")),
                "sic_desc":    sub.get("sicDescription", ""),
                "hq_country":  sub.get("stateOfIncorporation", ""),
            }
    raise ValueError(f"No 10-K found in EDGAR for CIK {cik}")


async def _get_filing_docs(cik: str, accession: str,
                           client: httpx.AsyncClient) -> list[dict]:
    """
    Fetch the filing-index JSON to get every document in the submission.
    Returns list of {name, type, size} dicts.
    """
    acc_clean = accession.replace("-", "")
    url = f"{EDGAR_ARCHIVES}/{cik}/{acc_clean}/{accession}-index.json"
    try:
        r = await client.get(url, headers=HEADERS, timeout=20)
        if r.status_code == 200:
            return r.json().get("documents", [])
    except Exception:
        pass
    return []


async def _pick_best_doc(cik: str, accession: str, primary_doc: str,
                         client: httpx.AsyncClient) -> tuple[str, str]:
    """
    Return (url, doc_type) for the best-quality text source:
    1. A plain-HTML 10-K document (non-iXBRL) if one exists in the index
    2. Otherwise the primary_doc (likely iXBRL — we handle it)
    """
    docs = await _get_filing_docs(cik, accession, client)
    acc_clean = accession.replace("-", "")
    base = f"{EDGAR_ARCHIVES}/{cik}/{acc_clean}"

    # Look for explicit 10-K type doc that isn't the iXBRL viewer
    for doc in docs:
        name = doc.get("name", "")
        dtype = doc.get("type", "")
        if dtype in ("10-K", "10-K/A") and name.lower().endswith((".htm", ".html")):
            return f"{base}/{name}", "html"

    # Fallback to primary doc
    return f"{base}/{primary_doc}", "html"


async def _download(url: str, client: httpx.AsyncClient) -> str:
    r = await client.get(url, headers=HEADERS, timeout=90)
    r.raise_for_status()
    return r.text


# ─── Text cleaning ────────────────────────────────────────────────────────

# Tags whose ENTIRE content (including children) should be removed
_REMOVE_BLOCK_RE = re.compile(
    r'<(style|script|head|ix:header|ix:hidden|xbrli:context|xbrli:unit|'
    r'xbrli:xbrl|link:\w+|labelLink|referenceLink)[^>]*>.*?</\1>',
    flags=re.DOTALL | re.IGNORECASE,
)

# iXBRL inline tags — strip tag but keep text content
_IXBRL_TAG_RE = re.compile(r'</?ix:[^>]+>', flags=re.IGNORECASE)
_XBRL_TAG_RE  = re.compile(r'</?[a-z]+:[^>]+>', flags=re.IGNORECASE)

# All remaining HTML tags
_HTML_TAG_RE = re.compile(r'<[^>]+>')


def _strip_html(html: str) -> str:
    """
    Convert raw 10-K HTML (including iXBRL) to clean plain text.
    Handles inline XBRL tags used in modern EDGAR submissions.
    """
    # 1. Remove entire blocks (style, script, iXBRL metadata)
    html = _REMOVE_BLOCK_RE.sub(' ', html)
    # 2. Strip iXBRL inline tags but keep their text content
    html = _IXBRL_TAG_RE.sub(' ', html)
    html = _XBRL_TAG_RE.sub(' ', html)
    # 3. Strip remaining HTML tags
    html = _HTML_TAG_RE.sub(' ', html)
    # 4. Decode entities
    html = unescape(html)
    # 5. Normalise whitespace
    return re.sub(r'\s+', ' ', html).strip()


# ─── Section extraction ───────────────────────────────────────────────────

# Section headers we want to extract (label, start-pattern, stop-pattern)
_SECTIONS = [
    (
        "Business",
        r'item\s+1[\.\s]+business\b',
        r'item\s+1a\b|item\s+2\b',
    ),
    (
        "Risk Factors",
        r'item\s+1a[\.\s]+risk\s+factors\b',
        r'item\s+1b\b|item\s+2\b',
    ),
    (
        "MD&A",
        r'item\s+7[\.\s]+management.{0,30}discussion',
        r'item\s+7a\b|item\s+8\b',
    ),
]

_SUPPLY_KEYWORDS = (
    'customer', 'supplier', 'vendor', 'manufacturer', 'partner', 'distributor',
    'percent of revenue', '% of revenue', 'sole source', 'single source',
    'contract manufacturer', 'concentration', 'significant customer',
    'key supplier', 'primary supplier', 'outsource', 'third-party',
    'component', 'raw material', 'foundry', 'assembly', 'logistics',
    'supply chain', 'procurement', 'reseller', 'wholesale',
)


def _extract_relevant_sections(text: str, max_chars: int = 40_000) -> str:
    """
    Pull out Items 1, 1A, 7 from 10-K plain text.
    Falls back to keyword-sentence extraction if section headers aren't found.
    """
    lower = text.lower()
    sections: list[str] = []

    for label, start_pat, stop_pat in _SECTIONS:
        m_start = re.search(start_pat, lower)
        if not m_start:
            continue
        body_start = m_start.end()
        m_stop = re.search(stop_pat, lower[body_start:])
        if m_stop:
            body_end = body_start + m_stop.start()
        else:
            body_end = body_start + 25_000

        chunk = text[body_start:body_end].strip()
        if len(chunk) > 200:
            sections.append(f"=== {label} ===\n{chunk[:15_000]}")

    if not sections:
        # Fallback: grab every sentence that mentions supply-chain keywords
        sents = re.split(r'(?<=[.!?])\s+', text)
        relevant = [s for s in sents if any(kw in s.lower() for kw in _SUPPLY_KEYWORDS)]
        if relevant:
            sections.append("=== Keyword Sentences ===\n" + ' '.join(relevant[:400]))

    combined = '\n\n'.join(sections)
    return combined[:max_chars]


# ─── LLM extraction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a financial supply chain analyst reading SEC 10-K filings.
Extract every identifiable supplier, customer, partner, and competitor
relationship for the focal company from the provided text.

Return ONLY a valid JSON object:

{
  "company_name": "<official legal name of the FOCAL company>",
  "relationships": [
    {
      "entity_name":       "<company name, OR '[Unnamed] <description>' if anonymous>",
      "direction":         "UPSTREAM" | "DOWNSTREAM" | "COMPETITOR",
      "relationship_type": "SUPPLIER" | "CUSTOMER" | "CONTRACT_MANUFACTURER" | "JV_PARTNER" | "LICENSEE" | "DISTRIBUTOR" | "RESELLER",
      "tier":              1,
      "pct_revenue":       <float | null>,
      "pct_cogs":          <float | null>,
      "sole_source":       <true | false>,
      "hq_country":        "<ISO-3166-1 alpha-3 | null>",
      "confidence":        <0.1–1.0>,
      "disclosure_type":   "DISCLOSED" | "ESTIMATED" | "INFERRED",
      "evidence":          "<verbatim sentence from the filing>"
    }
  ]
}

Field rules:
• direction UPSTREAM   = company provides goods/services TO the focal company (supplier, manufacturer)
• direction DOWNSTREAM = focal company provides goods/services TO this entity (customer, reseller)
• direction COMPETITOR = competes in the same market segment
• confidence 1.0  = explicitly named AND quantified
• confidence 0.75 = named, no figure given
• confidence 0.45 = strongly implied / inferred from context (e.g. "Taiwanese foundry")
• disclosure_type DISCLOSED = name + figure in filing
• disclosure_type ESTIMATED = name present; figure estimated from context
• disclosure_type INFERRED  = entity deduced from description alone
• pct_revenue: % of focal company total revenues this DOWNSTREAM entity represents
• pct_cogs:    % of focal company COGS this UPSTREAM entity represents
• Do NOT hallucinate. If uncertain, use lower confidence and INFERRED.
• If no relationships, return {"company_name":"…","relationships":[]}
"""


async def _run_extraction_chunk(text: str, ticker: str, chunk_idx: int) -> list[dict]:
    """Run LLM on one text chunk; return list of relationship dicts."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = f"Focal company ticker: {ticker}\n\nFiling text (chunk {chunk_idx}):\n\n{text}"

    try:
        resp = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.05,
            max_tokens=3000,
        )
        data = json.loads(resp.choices[0].message.content)
        rels = data.get("relationships", [])
        logger.info(f"SPLC chunk {chunk_idx}: extracted {len(rels)} relationships")
        return rels
    except Exception as e:
        logger.warning(f"SPLC chunk {chunk_idx} extraction failed: {e}")
        return []


def _split_chunks(text: str, chunk_size: int = 13_000, overlap: int = 500) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def _merge_relationships(all_rels: list[dict]) -> list[dict]:
    """
    Deduplicate relationships by (entity_name, direction).
    Keeps the entry with highest confidence; merges evidence if different.
    """
    seen: dict[tuple, dict] = {}
    for rel in all_rels:
        name = (rel.get("entity_name") or "").strip()
        direction = rel.get("direction", "UPSTREAM")
        if not name:
            continue
        key = (name.lower(), direction)
        if key not in seen or (rel.get("confidence") or 0) > (seen[key].get("confidence") or 0):
            seen[key] = rel
        else:
            # Merge evidence snippets
            existing_ev = seen[key].get("evidence") or ""
            new_ev = rel.get("evidence") or ""
            if new_ev and new_ev not in existing_ev:
                seen[key]["evidence"] = (existing_ev + " | " + new_ev)[:800]
    return list(seen.values())


async def _multi_chunk_extract(text: str, ticker: str) -> list[dict]:
    """Split filing text into chunks, extract from each, and merge results."""
    chunks = _split_chunks(text)
    logger.info(f"SPLC: processing {len(chunks)} chunk(s) for {ticker}")

    all_rels: list[dict] = []
    for i, chunk in enumerate(chunks):
        rels = await _run_extraction_chunk(chunk, ticker, i + 1)
        all_rels.extend(rels)

    merged = _merge_relationships(all_rels)
    logger.info(f"SPLC: {len(all_rels)} raw → {len(merged)} merged relationships for {ticker}")
    return merged


# ─── Public entry point ───────────────────────────────────────────────────

async def extract_supply_chain(ticker: str, db: AsyncSession) -> dict:
    """
    Full pipeline: resolve ticker → EDGAR → LLM → PostgreSQL upsert.
    Returns summary dict.
    """
    ticker = ticker.upper().strip()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        cik    = await _resolve_cik(ticker, client)
        filing = await _get_latest_10k(cik, client)

        doc_url, _ = await _pick_best_doc(
            cik, filing["accession"], filing["primary_doc"], client
        )
        logger.info(f"SPLC: downloading {doc_url}")
        raw_html = await _download(doc_url, client)

    # Clean + extract relevant sections
    plain   = _strip_html(raw_html)
    excerpt = _extract_relevant_sections(plain)

    logger.info(
        f"SPLC {ticker}: plain text {len(plain):,} chars → "
        f"excerpt {len(excerpt):,} chars"
    )

    if len(excerpt.strip()) < 100:
        raise ValueError(
            f"Could not extract usable text from the 10-K for {ticker}. "
            f"Plain text length was {len(plain)} chars."
        )

    # Multi-chunk LLM extraction
    relationships = await _multi_chunk_extract(excerpt, ticker)

    # ── Upsert SCCompany ──────────────────────────────────────────────────
    res     = await db.execute(select(SCCompany).where(SCCompany.ticker == ticker))
    company = res.scalar_one_or_none()

    as_of = (
        date.fromisoformat(filing["filed_date"])
        if filing.get("filed_date") else date.today()
    )

    # Infer legal name from first result that has one, or from filing
    llm_name = next(
        (r.get("company_name") for r in [{}]),  # placeholder; name comes from chunk 1
        None,
    )
    legal_name = filing.get("legal_name") or ticker

    if company is None:
        company = SCCompany(
            ticker           = ticker,
            cik              = cik,
            legal_name       = legal_name,
            sector           = filing.get("sic_desc"),
            sic_code         = filing.get("sic_code"),
            last_filing_date = as_of,
        )
        db.add(company)
        await db.flush()
    else:
        company.legal_name       = legal_name
        company.sector           = filing.get("sic_desc")
        company.last_filing_date = as_of
        await db.execute(delete(SCEdge).where(SCEdge.focal_id == company.id))
        await db.flush()

    # ── Insert edges ──────────────────────────────────────────────────────
    edges_inserted = 0
    for rel in relationships:
        direction = rel.get("direction", "UPSTREAM")
        if direction not in ("UPSTREAM", "DOWNSTREAM", "COMPETITOR"):
            continue

        edge = SCEdge(
            focal_id          = company.id,
            entity_name       = (rel.get("entity_name") or "Unknown")[:255],
            entity_ticker     = rel.get("entity_ticker"),
            direction         = direction,
            relationship_type = rel.get("relationship_type", "SUPPLIER"),
            tier              = int(rel.get("tier") or 1),
            pct_revenue       = rel.get("pct_revenue"),
            pct_cogs          = rel.get("pct_cogs"),
            sole_source       = bool(rel.get("sole_source", False)),
            disclosure_type   = rel.get("disclosure_type", "DISCLOSED"),
            confidence        = float(rel.get("confidence") or 1.0),
            evidence          = (rel.get("evidence") or "")[:1000],
            hq_country        = rel.get("hq_country"),
            as_of_date        = as_of,
        )
        db.add(edge)
        edges_inserted += 1

    await db.commit()
    await db.refresh(company)

    logger.info(f"SPLC: {ticker} → {edges_inserted} relationships stored from {filing['filed_date']} 10-K")

    return {
        "company": {
            "id":               str(company.id),
            "ticker":           company.ticker,
            "legal_name":       company.legal_name,
            "sector":           company.sector,
            "last_filing_date": str(company.last_filing_date) if company.last_filing_date else None,
        },
        "edges_created": edges_inserted,
        "filing_date":   filing.get("filed_date"),
        "source":        "SEC EDGAR (free)",
    }
