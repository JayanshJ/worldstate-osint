"""
Supply Chain (SPLC) API routes.

GET  /api/v1/splc/                 — list all analysed tickers
GET  /api/v1/splc/search?q=apple   — search companies by name or ticker (uses SEC EDGAR)
GET  /api/v1/splc/{ticker}         — return cached data (404 if not yet analysed)
POST /api/v1/splc/{ticker}         — trigger EDGAR analysis (synchronous, ~15-30 s)
DELETE /api/v1/splc/{ticker}       — clear cached data for a ticker
GET  /api/v1/splc/{ticker}/graph   — return data in force-graph node/edge format
"""

import logging
import re as _re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.intelligence.splc_extractor import (
    enrich_supply_chain_live,
    extract_supply_chain,
    search_companies_by_name,
)
from app.models.supply_chain import SCCompany, SCEdge
from app.models.article import EventCluster

from app.core.security import get_current_user
router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


# ─── Edge deduplication ───────────────────────────────────────────────────
# Catches duplicates that slipped into the DB (e.g. from concurrent background
# enrichment tasks) without requiring a schema migration.

def _norm(name: str) -> str:
    n = _re.sub(r"[,\.;:'\"\(\)]", "", name.lower())
    return _re.sub(r"\s+", " ", n).strip()

def _person_key(name: str) -> str:
    parts = [p for p in _norm(name).split() if len(p) > 1 and not p.endswith(".")]
    return f"{parts[0]} {parts[-1]}" if len(parts) >= 2 else _norm(name)

def _dedup_edges(edges: list) -> list:
    """
    Deduplicate by (normalised_name, direction).
    BOARD uses first+last key so 'Tim Cook' == 'Timothy D. Cook'.
    Keeps the highest-confidence entry per group.
    """
    seen: dict[tuple, object] = {}
    for e in edges:
        name = (e.entity_name or "").strip()
        if not name:
            continue
        name_key = _person_key(name) if e.direction == "BOARD" else _norm(name)
        key = (name_key, e.direction)
        if key not in seen or (e.confidence or 0) > (seen[key].confidence or 0):
            seen[key] = e
    return list(seen.values())



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


@router.get("/search")
async def search_companies(q: str = Query(..., min_length=1)):
    """
    Search SEC EDGAR company list by name or ticker.
    Returns up to 10 matches as {ticker, name, cik} objects.
    """
    try:
        return await search_companies_by_name(q.strip())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach SEC EDGAR: {exc}")


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
        "edges":   [_edge_dict(e) for e in _dedup_edges(company.edges)],
    }


@router.post("/{ticker}")
async def analyse_ticker(
    ticker: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger EDGAR download + LLM extraction for a ticker.
    Supply-chain edges are inserted synchronously (~15-30 s).
    Shareholder / board / analyst / industry enrichment runs in the background
    via yfinance (live Yahoo Finance / SEC 13F data) with retry logic.
    """
    ticker = ticker.upper().strip()
    try:
        result = await extract_supply_chain(ticker, db)
        # Enrich with live yfinance data after returning the response
        background_tasks.add_task(enrich_supply_chain_live, ticker)
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

    for e in _dedup_edges(company.edges):
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


@router.get("/{ticker}/disruptions")
async def get_disruptions(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Return active event clusters whose key_entities match this company's
    upstream/downstream supply chain partners.

    Each result includes which edges (supplier/customer names) triggered the match.
    """
    ticker = ticker.upper().strip()
    res = await db.execute(
        select(SCCompany)
        .where(SCCompany.ticker == ticker)
        .options(selectinload(SCCompany.edges))
    )
    company = res.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail=f"No supply chain data for {ticker}")

    # Build set of entity names (suppliers + customers) and countries
    edges = _dedup_edges(company.edges)
    supply_entities: set[str] = set()
    supply_countries: set[str] = set()
    for e in edges:
        if e.direction in ("UPSTREAM", "DOWNSTREAM"):
            # normalised lower name for matching
            supply_entities.add(e.entity_name.lower())
            # also first word (e.g. "TSMC" from "Taiwan Semiconductor Manufacturing")
            supply_entities.add(e.entity_name.split()[0].lower())
            if e.hq_country:
                supply_countries.add(e.hq_country.lower())
    # Also add the company name itself
    if company.legal_name:
        supply_entities.add(company.legal_name.lower())
        supply_entities.add(company.legal_name.split()[0].lower())
    supply_entities.add(ticker.lower())

    # Load active clusters (volatile, not expired)
    from datetime import datetime, timezone
    cluster_res = await db.execute(
        select(EventCluster)
        .where(EventCluster.volatility >= 0.3)
        .order_by(EventCluster.volatility.desc())
        .limit(200)
    )
    clusters = cluster_res.scalars().all()

    results = []
    for cluster in clusters:
        if not cluster.key_entities:
            continue

        orgs  = [o.lower() for o in (cluster.key_entities.get("organizations") or [])]
        locs  = [l.lower() for l in (cluster.key_entities.get("locations") or [])]
        label = (cluster.label or "").lower()

        # Find which supply chain entities triggered a match
        affected_edges: list[str] = []
        for e in edges:
            if e.direction not in ("UPSTREAM", "DOWNSTREAM"):
                continue
            name   = e.entity_name.lower()
            first  = e.entity_name.split()[0].lower()
            country = (e.hq_country or "").lower()

            # Match org list or location list or cluster label
            org_match = any(
                (name in org or org in name or first in org or org in first)
                for org in orgs
            )
            loc_match = country and any(country in loc or loc in country for loc in locs)
            label_match = name in label or first in label

            if org_match or loc_match or label_match:
                affected_edges.append(e.entity_name)

        if not affected_edges:
            # Also check if ticker/company name appears in orgs
            ticker_match = any(ticker.lower() in org or org in ticker.lower() for org in orgs)
            if company.legal_name:
                ticker_match = ticker_match or any(
                    company.legal_name.lower().split()[0] in org
                    for org in orgs
                )
            if not ticker_match:
                continue

        results.append({
            "cluster_id":   str(cluster.id),
            "label":        cluster.label,
            "volatility":   float(cluster.volatility),
            "bullets":      cluster.summary_bullets,
            "affected":     list(dict.fromkeys(affected_edges))[:5],  # dedup, max 5
            "last_updated": cluster.last_updated_at.isoformat() if cluster.last_updated_at else "",
        })

    # Sort by volatility desc, cap at 20
    results.sort(key=lambda x: x["volatility"], reverse=True)
    return results[:20]


@router.get("/{ticker}/contagion")
async def get_contagion(
    ticker: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Find other analyzed companies that share upstream suppliers with this ticker.
    Returns: [{shared_supplier, other_tickers: [{ticker, company_name}]}]
    """
    ticker = ticker.upper().strip()

    # Load focal company's upstream edges
    res = await db.execute(
        select(SCCompany)
        .where(SCCompany.ticker == ticker)
        .options(selectinload(SCCompany.edges))
    )
    company = res.scalar_one_or_none()
    if company is None:
        raise HTTPException(status_code=404, detail=f"No supply chain data for {ticker}")

    focal_edges   = _dedup_edges(company.edges)
    focal_upstream = {_norm(e.entity_name) for e in focal_edges if e.direction == "UPSTREAM"}

    if not focal_upstream:
        return []

    # Load all other companies + their edges
    all_res = await db.execute(
        select(SCCompany)
        .where(SCCompany.ticker != ticker)
        .options(selectinload(SCCompany.edges))
    )
    other_companies = all_res.scalars().all()

    # Build: shared_supplier_norm → {ticker: company_name}
    shared: dict[str, dict[str, str | None]] = {}
    for oc in other_companies:
        oc_edges = _dedup_edges(oc.edges)
        for e in oc_edges:
            if e.direction != "UPSTREAM":
                continue
            norm = _norm(e.entity_name)
            if norm in focal_upstream:
                if norm not in shared:
                    shared[norm] = {}
                shared[norm][oc.ticker] = oc.legal_name

    if not shared:
        return []

    # Map norm back to display name (use focal company's edge name)
    norm_to_display: dict[str, str] = {}
    for e in focal_edges:
        if e.direction == "UPSTREAM":
            norm_to_display[_norm(e.entity_name)] = e.entity_name

    results = [
        {
            "shared_supplier": norm_to_display.get(norm, norm),
            "other_tickers": [
                {"ticker": t, "company_name": name}
                for t, name in tickers.items()
            ],
        }
        for norm, tickers in shared.items()
        if tickers  # only include if at least one other company shares it
    ]

    # Sort by number of sharing companies (most shared = most systemic risk)
    results.sort(key=lambda x: len(x["other_tickers"]), reverse=True)
    return results[:25]
