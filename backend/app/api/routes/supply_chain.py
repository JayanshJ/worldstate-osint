"""
Supply Chain (SPLC) API routes.

GET  /api/v1/splc/{ticker}         — return cached data (404 if not yet analysed)
POST /api/v1/splc/{ticker}         — trigger EDGAR analysis (synchronous, ~15-30 s)
DELETE /api/v1/splc/{ticker}       — clear cached data for a ticker
GET  /api/v1/splc/{ticker}/graph   — return data in force-graph node/edge format
GET  /api/v1/splc/                 — list all analysed tickers
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.intelligence.splc_extractor import extract_supply_chain
from app.models.supply_chain import SCCompany, SCEdge

router = APIRouter()
logger = logging.getLogger(__name__)


# ─── DB dependency ────────────────────────────────────────────────────────

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ─── Serialisers ─────────────────────────────────────────────────────────

def _company_dict(c: SCCompany) -> dict:
    return {
        "id":               str(c.id),
        "ticker":           c.ticker,
        "legal_name":       c.legal_name,
        "sector":           c.sector,
        "sic_code":         c.sic_code,
        "hq_country":       c.hq_country,
        "last_filing_date": str(c.last_filing_date) if c.last_filing_date else None,
    }


def _edge_dict(e: SCEdge) -> dict:
    return {
        "id":               str(e.id),
        "entity_name":      e.entity_name,
        "entity_ticker":    e.entity_ticker,
        "direction":        e.direction,
        "relationship_type": e.relationship_type,
        "tier":             e.tier,
        "pct_revenue":      float(e.pct_revenue) if e.pct_revenue is not None else None,
        "pct_cogs":         float(e.pct_cogs)    if e.pct_cogs    is not None else None,
        "sole_source":      e.sole_source,
        "disclosure_type":  e.disclosure_type,
        "confidence":       float(e.confidence) if e.confidence is not None else None,
        "evidence":         e.evidence,
        "hq_country":       e.hq_country,
        "as_of_date":       str(e.as_of_date) if e.as_of_date else None,
    }


# ─── Routes ───────────────────────────────────────────────────────────────

@router.get("/")
async def list_analysed(db: AsyncSession = Depends(get_db)):
    """Return all tickers that have been analysed."""
    res = await db.execute(select(SCCompany).order_by(SCCompany.ticker))
    companies = res.scalars().all()
    return [_company_dict(c) for c in companies]


@router.get("/{ticker}")
async def get_supply_chain(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """Return cached supply chain data for a ticker."""
    ticker = ticker.upper().strip()
    res = await db.execute(
        select(SCCompany)
        .where(SCCompany.ticker == ticker)
        .options(selectinload(SCCompany.edges))
    )
    company = res.scalar_one_or_none()
    if company is None:
        raise HTTPException(
            status_code=404,
            detail=f"No supply chain data for {ticker}. POST to /{ticker} to trigger analysis.",
        )
    return {
        "company": _company_dict(company),
        "edges":   [_edge_dict(e) for e in company.edges],
    }


@router.post("/{ticker}")
async def analyse_ticker(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger EDGAR download + LLM extraction for a ticker.
    Runs synchronously — expect 15–30 s.  Results cached in PostgreSQL.
    """
    ticker = ticker.upper().strip()
    try:
        result = await extract_supply_chain(ticker, db)
        return {"status": "ok", **result}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"SPLC extraction failed for {ticker}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")


@router.delete("/{ticker}")
async def delete_supply_chain(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """Remove all cached supply chain data for a ticker."""
    ticker = ticker.upper().strip()
    res = await db.execute(select(SCCompany).where(SCCompany.ticker == ticker))
    company = res.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")
    await db.delete(company)
    await db.commit()
    return {"status": "deleted", "ticker": ticker}


@router.get("/{ticker}/graph")
async def get_graph(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return supply chain data in a node-link format optimised for
    force-directed graph rendering.
    """
    ticker = ticker.upper().strip()
    res = await db.execute(
        select(SCCompany)
        .where(SCCompany.ticker == ticker)
        .options(selectinload(SCCompany.edges))
    )
    company = res.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail=f"No data for {ticker}")

    nodes: list[dict] = [{
        "id":    ticker,
        "label": company.legal_name or ticker,
        "type":  "FOCAL",
        "tier":  0,
        "sector": company.sector,
    }]
    links: list[dict] = []

    for e in company.edges:
        node_id = e.entity_name.replace(" ", "_")
        # Avoid duplicate nodes
        if not any(n["id"] == node_id for n in nodes):
            exposure = float(e.pct_revenue or e.pct_cogs or 0)
            risk = (
                "HIGH"   if (e.sole_source or exposure >= 20) else
                "MEDIUM" if exposure >= 10 else
                "LOW"
            )
            nodes.append({
                "id":               node_id,
                "label":            e.entity_name,
                "type":             e.direction,
                "tier":             e.tier,
                "hq_country":       e.hq_country,
                "exposure":         exposure,
                "sole_source":      e.sole_source,
                "disclosure_type":  e.disclosure_type,
                "confidence":       float(e.confidence) if e.confidence else 1.0,
                "risk":             risk,
            })

        src = ticker        if e.direction == "UPSTREAM"   else node_id
        tgt = node_id       if e.direction == "UPSTREAM"   else ticker
        if e.direction == "COMPETITOR":
            src, tgt = ticker, node_id

        links.append({
            "source":           src,
            "target":           tgt,
            "direction":        e.direction,
            "relationship_type": e.relationship_type,
            "pct_revenue":      float(e.pct_revenue) if e.pct_revenue else None,
            "pct_cogs":         float(e.pct_cogs)    if e.pct_cogs    else None,
            "evidence":         e.evidence,
        })

    return {"nodes": nodes, "links": links, "company": _company_dict(company)}
