"""
Supply Chain Extractor — SEC EDGAR + LLM (free forever)

Free data sources used:
  • https://www.sec.gov/files/company_tickers.json   — ticker → CIK map
  • https://data.sec.gov/submissions/CIK{n}.json     — company + filing metadata
  • https://www.sec.gov/Archives/edgar/data/...       — 10-K full text

Flow:
  1. Resolve ticker → CIK via SEC ticker map (cached in memory)
  2. Fetch company submissions → latest 10-K accession + primary document
  3. Download 10-K HTML → strip → extract Item 1 / Item 1A sections
  4. LLM extraction → structured supply chain relationships
  5. Upsert sc_companies + sc_edges in PostgreSQL
"""

import json
import logging
import re
import uuid
from datetime import date, datetime, timezone
from html import unescape

import httpx
from openai import AsyncOpenAI
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.supply_chain import SCCompany, SCEdge

settings = get_settings()
logger = logging.getLogger(__name__)

# SEC requires a User-Agent header identifying your app + contact
HEADERS = {
    "User-Agent": "WorldState OSINT Platform worldstate-osint@proton.me",
    "Accept-Encoding": "gzip, deflate",
}

EDGAR_BASE      = "https://data.sec.gov"
EDGAR_ARCHIVES  = "https://www.sec.gov/Archives/edgar/data"

# In-process cache: ticker → CIK (populated once per restart)
_ticker_cache: dict[str, str] = {}


# ─── SEC EDGAR helpers ────────────────────────────────────────────────────

async def _resolve_cik(ticker: str, client: httpx.AsyncClient) -> str:
    """Resolve ticker symbol → SEC CIK string."""
    global _ticker_cache
    if not _ticker_cache:
        r = await client.get(
            "https://www.sec.gov/files/company_tickers.json",
            headers=HEADERS, timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        _ticker_cache = {v["ticker"].upper(): str(v["cik_str"]) for v in data.values()}

    cik = _ticker_cache.get(ticker.upper())
    if not cik:
        raise ValueError(f"Ticker '{ticker}' not found in SEC EDGAR. Check the symbol.")
    return cik


async def _get_latest_10k(cik: str, client: httpx.AsyncClient) -> dict:
    """
    Returns dict with keys: accession, filed_date, primary_doc,
    legal_name, sic_code, sic_desc from company submissions JSON.
    """
    cik_padded = cik.zfill(10)
    r = await client.get(
        f"{EDGAR_BASE}/submissions/CIK{cik_padded}.json",
        headers=HEADERS, timeout=20,
    )
    r.raise_for_status()
    sub = r.json()

    recent = sub.get("filings", {}).get("recent", {})
    forms       = recent.get("form",            [])
    accessions  = recent.get("accessionNumber", [])
    dates       = recent.get("filingDate",      [])
    primary_docs = recent.get("primaryDocument", [])

    for form, acc, dt, pdoc in zip(forms, accessions, dates, primary_docs):
        if form in ("10-K", "10-K/A"):
            return {
                "accession":    acc,
                "filed_date":   dt,
                "primary_doc":  pdoc,
                "legal_name":   sub.get("name", ""),
                "sic_code":     str(sub.get("sic", "")),
                "sic_desc":     sub.get("sicDescription", ""),
                "hq_country":   sub.get("stateOfIncorporation", ""),
            }

    raise ValueError(f"No 10-K filing found in EDGAR for CIK {cik}")


async def _download_filing(cik: str, accession: str, primary_doc: str,
                            client: httpx.AsyncClient) -> str:
    """Download the primary 10-K HTML document and return raw text."""
    acc_clean = accession.replace("-", "")
    url = f"{EDGAR_ARCHIVES}/{cik}/{acc_clean}/{primary_doc}"
    r = await client.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text


# ─── HTML → plain text ────────────────────────────────────────────────────

def _strip_html(html: str) -> str:
    """Remove HTML markup, decode entities, normalise whitespace."""
    # Kill style/script blocks entirely
    html = re.sub(r'<(style|script|head)[^>]*>.*?</\1>', ' ', html,
                  flags=re.DOTALL | re.IGNORECASE)
    # Remove all remaining tags
    html = re.sub(r'<[^>]+>', ' ', html)
    # Decode HTML entities (&amp; &nbsp; etc.)
    html = unescape(html)
    # Normalise whitespace
    return re.sub(r'\s+', ' ', html).strip()


def _extract_relevant_sections(text: str) -> str:
    """
    Pull out Item 1 (Business) and Item 1A (Risk Factors) from 10-K text.
    Falls back to keyword-targeted sentence extraction if section headers
    aren't found (common in older inline XBRL filings).
    """
    lower = text.lower()
    sections: list[str] = []

    # ── Try Item 1 Business ──────────────────────────────────────────────
    m = re.search(
        r'item\s+1\.?\s+business([\s\S]{200,40000}?)(?=item\s+1a|item\s+2\.)',
        lower,
    )
    if m:
        sections.append(text[m.start(1): m.end(1)][:10000])

    # ── Try Item 1A Risk Factors ─────────────────────────────────────────
    m = re.search(
        r'item\s+1a\.?\s+risk\s+factors([\s\S]{200,40000}?)(?=item\s+1b|item\s+2\.)',
        lower,
    )
    if m:
        sections.append(text[m.start(1): m.end(1)][:10000])

    # ── Fallback: keyword-targeted sentences ─────────────────────────────
    if not sections:
        KEYWORDS = (
            'customer', 'supplier', 'vendor', 'manufacturer', 'partner',
            'percent of revenue', '% of revenue', 'sole source', 'single source',
            'contract manufacturer', 'concentration', 'significant customer',
            'key supplier', 'primary supplier', 'outsource',
        )
        sents = re.split(r'(?<=[.!?])\s+', text)
        relevant = [s for s in sents if any(kw in s.lower() for kw in KEYWORDS)]
        sections.append(' '.join(relevant[:300]))

    combined = '\n\n'.join(sections)
    # Cap at ~14 000 chars to stay within LLM context
    return combined[:14000]


# ─── LLM Extraction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a financial supply chain analyst specialising in SEC 10-K filings.
Extract every supplier, customer, partner, and competitor relationship from the
filing excerpt provided.

Return ONLY a valid JSON object matching this schema exactly:

{
  "company_name": "<official legal name>",
  "relationships": [
    {
      "entity_name":       "<company name OR '[Confidential] <description>' if unnamed>",
      "direction":         "UPSTREAM" | "DOWNSTREAM" | "COMPETITOR",
      "relationship_type": "SUPPLIER" | "CUSTOMER" | "CONTRACT_MANUFACTURER" | "JV_PARTNER" | "LICENSEE" | "DISTRIBUTOR",
      "pct_revenue":       <float | null>,   // % of focal company revenue (DOWNSTREAM only)
      "pct_cogs":          <float | null>,   // % of focal company COGS (UPSTREAM only)
      "sole_source":       <true | false>,
      "hq_country":        "<ISO 3-char alpha or null>",
      "confidence":        <0.1-1.0>,
      "disclosure_type":   "DISCLOSED" | "ESTIMATED" | "INFERRED",
      "evidence":          "<verbatim sentence from filing>"
    }
  ]
}

Rules:
• confidence 1.0 = explicitly named AND quantified in the text
• confidence 0.7 = named but no percentage given
• confidence 0.4 = strongly implied / inferred from context
• disclosure_type DISCLOSED  = named in filing with a figure
• disclosure_type ESTIMATED  = named but figure is LLM-estimated from context
• disclosure_type INFERRED   = entity deduced from description (e.g. "Taiwanese foundry")
• Do NOT hallucinate entities. If no relationships exist, return {"company_name":"…","relationships":[]}
• pct_revenue is the percentage of THIS company's total revenue the customer represents
• pct_cogs is the percentage of THIS company's COGS the supplier represents
"""


async def _run_extraction(text: str, ticker: str) -> dict:
    """Call the LLM to extract supply chain entities from filing text."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    prompt = f"Company ticker: {ticker}\n\nFiling excerpt:\n{text}"

    resp = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=2500,
    )
    return json.loads(resp.choices[0].message.content)


# ─── Public entry point ───────────────────────────────────────────────────

async def extract_supply_chain(ticker: str, db: AsyncSession) -> dict:
    """
    Full pipeline: resolve ticker → EDGAR → LLM → PostgreSQL upsert.
    Returns a summary dict with company info + edge count.
    """
    ticker = ticker.upper().strip()

    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 1. Ticker → CIK
        cik = await _resolve_cik(ticker, client)

        # 2. Latest 10-K metadata
        filing = await _get_latest_10k(cik, client)

        # 3. Download filing
        raw_html = await _download_filing(
            cik, filing["accession"], filing["primary_doc"], client
        )

    # 4. Strip HTML + extract relevant sections
    plain   = _strip_html(raw_html)
    excerpt = _extract_relevant_sections(plain)

    if len(excerpt.strip()) < 50:
        raise ValueError(
            f"Could not extract usable text from the 10-K for {ticker}. "
            "The filing may use an unsupported format."
        )

    # 5. LLM extraction
    extracted = await _run_extraction(excerpt, ticker)

    # 6. Upsert SCCompany
    res = await db.execute(select(SCCompany).where(SCCompany.ticker == ticker))
    company: SCCompany | None = res.scalar_one_or_none()

    as_of = (
        date.fromisoformat(filing["filed_date"])
        if filing.get("filed_date") else date.today()
    )

    if company is None:
        company = SCCompany(
            ticker        = ticker,
            cik           = cik,
            legal_name    = extracted.get("company_name") or filing["legal_name"] or ticker,
            sector        = filing.get("sic_desc"),
            sic_code      = filing.get("sic_code"),
            last_filing_date = as_of,
        )
        db.add(company)
        await db.flush()  # get the generated id
    else:
        company.legal_name       = extracted.get("company_name") or filing["legal_name"] or ticker
        company.sector           = filing.get("sic_desc")
        company.last_filing_date = as_of
        # Wipe old edges before re-inserting
        await db.execute(delete(SCEdge).where(SCEdge.focal_id == company.id))
        await db.flush()

    # 7. Insert edges
    edges_inserted = 0
    for rel in extracted.get("relationships", []):
        direction = rel.get("direction", "UPSTREAM")
        if direction not in ("UPSTREAM", "DOWNSTREAM", "COMPETITOR"):
            continue

        edge = SCEdge(
            focal_id          = company.id,
            entity_name       = rel.get("entity_name", "Unknown Entity"),
            entity_ticker     = rel.get("entity_ticker"),
            direction         = direction,
            relationship_type = rel.get("relationship_type", "SUPPLIER"),
            tier              = int(rel.get("tier", 1)),
            pct_revenue       = rel.get("pct_revenue"),
            pct_cogs          = rel.get("pct_cogs"),
            sole_source       = bool(rel.get("sole_source", False)),
            disclosure_type   = rel.get("disclosure_type", "DISCLOSED"),
            confidence        = float(rel.get("confidence", 1.0)),
            evidence          = rel.get("evidence"),
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
