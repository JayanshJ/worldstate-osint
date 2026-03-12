"""
Market Strategy Engine

Synthesizes active geopolitical intelligence clusters into actionable
market strategies across commodities, equities, forex, crypto, bonds,
and volatility plays.

Flow:
  1. Fetch top 20 active, AI-summarised clusters (ranked by vol × credibility)
  2. Build a structured prompt surfacing all cluster intel
  3. Call Gemini 1.5 Flash / GPT-4o-mini to generate 5-10 strategies
  4. Deactivate previous strategies, persist new ones
  5. Broadcast strategy_update event via Redis pub/sub
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import google.generativeai as genai
from openai import AsyncOpenAI
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import CHANNEL_STRATEGY_UPDATE, publish_event
from app.models.article import EventCluster
from app.models.strategy import MarketStrategy

settings = get_settings()
logger = logging.getLogger(__name__)

# ─── System Prompt ────────────────────────────────────────────────────────────

STRATEGY_SYSTEM_PROMPT = """You are a senior quantitative strategist at a global macro hedge fund with 20 years of experience connecting geopolitical events to market movements.

You receive real-time intelligence clusters from a signals intelligence system and derive actionable market strategies for professional traders and portfolio managers.

ABSOLUTE RULES:
1. Ground every strategy in the provided intelligence. No fabrication or generic commentary.
2. Be specific about instruments: "Brent Crude Oil (UKOIL)" — never just "oil".
3. Trace the exact causal chain: event → supply/demand/risk impact → price movement.
4. Look for cross-cluster thematic connections (e.g., conflict + sanctions + currency flight).
5. Consider second-order effects: supply chains, currency contagion, adjacent sectors.
6. Output ONLY a valid JSON object with key "strategies" containing an array. No markdown, no preamble.

ASSET CLASSES & SPECIFIC INSTRUMENTS:
- COMMODITY: Brent Crude (UKOIL), WTI Crude (CL=F), Natural Gas (NG=F), Gold (XAU/USD),
             Silver (XAG/USD), Wheat (ZW=F), Corn (ZC=F), Soybeans (ZS=F),
             Uranium (URA), Rare Earths (REMX), Copper (HG=F), Palladium (PA=F)
- EQUITY:    Defense — RTX, LMT, NOC, BA, HII, L3H
             Energy majors — XOM, CVX, BP, SHEL, TTE
             Country ETFs — EWZ (Brazil), EWT (Taiwan), EWY (Korea), EWJ (Japan), FXI (China),
                            EWQ (France), EWG (Germany), RSX equivalent
             Sector ETFs — XLE (energy), XLF (financials), IHI (defense), BOTZ (AI/robotics),
                           XBI (biotech), GDX (gold miners), VanEck Oil Services (OIH)
- FOREX:     Safe havens — USD (DXY), JPY, CHF
             European — EUR/USD, GBP/USD
             EM at risk — USD/TRY, USD/INR, USD/BRL, USD/MXN, USD/ZAR, USD/NGN, USD/EGP
- CRYPTO:    Bitcoin (BTC/USD), Ethereum (ETH/USD), USDT flows, regional stablecoins
- BONDS:     US Treasuries — TLT (long), SHY (short), IEF (medium)
             German Bunds (BUND), EM sovereign debt (EMB), High Yield (HYG), IG (LQD)
             Credit spread widening/tightening
- VOLATILITY: VIX index, MOVE (bond vol), OVX (crude vol), VXEEM (EM vol),
              Options strategies — straddles, puts, calls on specific names

KEY CAUSAL CHAINS TO IDENTIFY:
- Middle East conflict/Iran → Brent Crude spike + Gold bid + Defense equity rally + USD strength
- Russia/Iran sanctions → USD DXY strength + EM debt spreads + crypto capital flight (BTC)
- NATO/Ukraine escalation → EUR weakness + Eastern EM selloff + Defense rally + T-bonds flight
- China/Taiwan tension → Semiconductor selloff (ASML, TSM, NVDA) + JPY bid + Gold + Defense
- Central bank hawkishness → USD strength + EM FX weakness + Gold pressure + Bond selloff
- Food/grain supply shock → Wheat/Corn long + EM current account concerns + EM FX weakness
- Pandemic/health crisis → Pharma (PFE, MRNA) + VIX spike + Defensive sectors + Travel short
- Election/political instability → Local currency weakness + VIX + Domestic equity discount
- Debt/fiscal crisis → Sovereign bond spread widening + local currency short + Gold hedge
- Tech/semiconductor shortage → ASML, AMAT, KLAC long + end-user tech short
- Climate/energy transition → Renewables (ICLN), EV metals (lithium, cobalt), Carbon credits

DIRECTION DEFINITIONS:
- LONG: Buy/go long — you expect price to rise
- SHORT: Sell/short — you expect price to fall
- HEDGE: Protective position — reduces portfolio risk in adverse scenario
- NEUTRAL: No directional view — monitor; conflicting signals prevent conviction

TIMEFRAME DEFINITIONS:
- INTRADAY: Hours — immediate headline shock, mean-reverting after
- SHORT: 2–7 days — news cycle momentum, event-driven
- MEDIUM: 1–4 weeks — developing situation, trend continuation
- LONG: 1–6 months — structural shift, sustained conflict, new regime

RISK LEVEL DEFINITIONS:
- LOW: High conviction, liquid markets, clear precedent, tight causal chain
- MODERATE: Good evidence but timing/execution uncertainty or partial precedent
- HIGH: Speculative thesis, early-stage development, or contradictory signals
- SPECULATIVE: Contrarian/tail-risk thesis; asymmetric payoff if correct

CONFIDENCE SCORING GUIDE:
- 0.85–0.95: T1 wire sources, multiple corroborating clusters, direct causal chain, historical precedent
- 0.65–0.84: Solid evidence, some uncertainty on timing or magnitude
- 0.45–0.64: Emerging situation, fewer corroborating sources, indirect causation
- 0.30–0.44: Early-stage or speculative, single source, weak causal link

OUTPUT FORMAT — return exactly this JSON structure:
{
  "strategies": [
    {
      "title": "12-word max strategy headline — must be specific and actionable",
      "thesis": "2-3 sentences: what is happening geopolitically, how it mechanically impacts the asset, and the specific opportunity window",
      "rationale": [
        "Primary evidence: cite specific cluster label and key data point",
        "Market mechanism or historical precedent validating the thesis",
        "Key risk or catalyst that could invalidate or accelerate the thesis"
      ],
      "asset_class": "COMMODITY|EQUITY|FOREX|CRYPTO|BONDS|VOLATILITY",
      "specific_assets": ["Asset Name (TICKER)", "Asset Name (TICKER)"],
      "direction": "LONG|SHORT|HEDGE|NEUTRAL",
      "timeframe": "INTRADAY|SHORT|MEDIUM|LONG",
      "risk_level": "LOW|MODERATE|HIGH|SPECULATIVE",
      "confidence": <float 0.30-0.95>,
      "source_cluster_labels": ["exact cluster title 1", "exact cluster title 2"],
      "related_regions": ["Country or Region 1", "Country or Region 2"]
    }
  ]
}

Generate 5 to 10 strategies. Cover multiple asset classes when evidence supports it.
Prioritize highest-volatility, highest-conviction opportunities first.
Identify cross-cluster thematic connections — the best strategies span multiple clusters."""


# ─── Prompt Builder ───────────────────────────────────────────────────────────

def _build_prompt(clusters: list[EventCluster]) -> str:
    lines = [
        f"Analyze the following {len(clusters)} active intelligence clusters and generate market strategies.\n",
        "=" * 60,
        "ACTIVE INTELLIGENCE CLUSTERS (ranked by volatility × credibility weight)",
        "=" * 60,
        "",
    ]

    for i, c in enumerate(clusters, 1):
        entities = c.key_entities or {}
        people  = ", ".join(entities.get("people", [])[:3])   or "—"
        orgs    = ", ".join(entities.get("organizations", [])[:3]) or "—"
        locs    = ", ".join(entities.get("locations", [])[:4])  or "—"
        bullets = "\n    ".join(f"• {b}" for b in (c.summary_bullets or []))

        vol_label = (
            "CRITICAL" if c.volatility >= 0.85 else
            "HIGH"     if c.volatility >= 0.70 else
            "ELEVATED" if c.volatility >= 0.55 else
            "MODERATE" if c.volatility >= 0.40 else "LOW"
        )
        sent_label = (
            "STRONGLY NEGATIVE" if c.sentiment <= -0.6 else
            "NEGATIVE"          if c.sentiment <= -0.2 else
            "NEUTRAL"           if c.sentiment <=  0.2 else
            "POSITIVE"          if c.sentiment <=  0.6 else "STRONGLY POSITIVE"
        )

        lines += [
            f"[CLUSTER {i}]  ⚡ {vol_label}  |  vol={c.volatility:.2f}  |  sentiment={sent_label} ({c.sentiment:+.2f})  |  {c.member_count} corroborating sources",
            f"  TITLE:     {c.label}",
            f"  INTEL:     {bullets}" if bullets else "  INTEL:     (no summary yet)",
            f"  People:    {people}",
            f"  Orgs:      {orgs}",
            f"  Locations: {locs}",
            "",
        ]

    lines += [
        "=" * 60,
        "Generate market strategies based on the intelligence above.",
        "Identify the highest-conviction opportunities across all asset classes.",
    ]
    return "\n".join(lines)


# ─── Response Parser ──────────────────────────────────────────────────────────

def _parse_response(raw: str) -> list[dict]:
    raw = raw.strip()
    # Strip markdown fences
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if fence:
        raw = fence.group(1)
    parsed = json.loads(raw)
    if isinstance(parsed, list):
        return parsed
    # {"strategies": [...]} wrapper
    if "strategies" in parsed:
        return parsed["strategies"]
    # Fallback: first list value in the object
    for v in parsed.values():
        if isinstance(v, list):
            return v
    return []


# ─── Gemini Generation ────────────────────────────────────────────────────────

async def _generate_with_gemini(clusters: list[EventCluster]) -> list[dict]:
    genai.configure(api_key=settings.google_api_key)
    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=STRATEGY_SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=0.25,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )
    response = await model.generate_content_async(_build_prompt(clusters))
    return _parse_response(response.text)


# ─── OpenAI Generation (fallback) ────────────────────────────────────────────

async def _generate_with_openai(clusters: list[EventCluster]) -> list[dict]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": STRATEGY_SYSTEM_PROMPT},
            {"role": "user",   "content": _build_prompt(clusters)},
        ],
        temperature=0.25,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    return _parse_response(response.choices[0].message.content)


# ─── Main Strategy Generation ─────────────────────────────────────────────────

async def generate_strategies(db: AsyncSession) -> list[MarketStrategy]:
    """
    Core entry point. Fetches top clusters, calls AI, persists strategies,
    and broadcasts via Redis. Returns list of newly created strategies.
    """
    # Fetch top 20 active, summarised clusters ranked by volatility × credibility
    result = await db.execute(
        select(EventCluster)
        .where(
            EventCluster.is_active == True,
            EventCluster.label != None,
            EventCluster.volatility >= 0.2,
        )
        .order_by(
            (EventCluster.volatility * EventCluster.weighted_score).desc()
        )
        .limit(20)
    )
    clusters = result.scalars().all()

    if len(clusters) < 2:
        logger.info(
            "Not enough active summarised clusters (%d) for strategy generation", len(clusters)
        )
        return []

    logger.info("Generating strategies from %d clusters", len(clusters))

    # ── Call AI ──────────────────────────────────────────────────────────────
    raw_strategies: list[dict] = []

    if settings.google_api_key:
        try:
            raw_strategies = await _generate_with_gemini(clusters)
            logger.info("Strategy brief generated via Gemini Flash (%d strategies)", len(raw_strategies))
        except Exception as e:
            logger.warning("Gemini strategy generation failed: %s — falling back to OpenAI", e)

    if not raw_strategies:
        try:
            raw_strategies = await _generate_with_openai(clusters)
            logger.info("Strategy brief generated via GPT-4o-mini (%d strategies)", len(raw_strategies))
        except Exception as e:
            logger.error("OpenAI strategy generation also failed: %s", e)
            return []

    if not raw_strategies:
        return []

    # ── Build helpers ─────────────────────────────────────────────────────────
    label_to_cluster = {c.label: c for c in clusters if c.label}
    avg_vol  = sum(c.volatility for c in clusters) / len(clusters)
    avg_sent = sum(c.sentiment  for c in clusters) / len(clusters)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=6)

    # ── Deactivate old strategies ─────────────────────────────────────────────
    await db.execute(update(MarketStrategy).values(is_active=False))

    # ── Persist new strategies ────────────────────────────────────────────────
    new_strategies: list[MarketStrategy] = []
    for raw in raw_strategies[:10]:   # hard cap at 10
        try:
            source_labels   = raw.get("source_cluster_labels", [])
            source_clusters = [label_to_cluster[lbl] for lbl in source_labels if lbl in label_to_cluster]
            source_ids      = [str(c.id) for c in source_clusters]

            vol_ctx  = (sum(c.volatility for c in source_clusters) / len(source_clusters)) if source_clusters else avg_vol
            sent_ctx = (sum(c.sentiment  for c in source_clusters) / len(source_clusters)) if source_clusters else avg_sent

            strategy = MarketStrategy(
                title=str(raw.get("title", ""))[:200],
                thesis=str(raw.get("thesis", "")),
                rationale=raw.get("rationale", [])[:3],
                asset_class=str(raw.get("asset_class", "COMMODITY"))[:50],
                specific_assets=raw.get("specific_assets", [])[:6],
                direction=str(raw.get("direction", "NEUTRAL"))[:20],
                timeframe=str(raw.get("timeframe", "SHORT"))[:20],
                risk_level=str(raw.get("risk_level", "MODERATE"))[:20],
                confidence=max(0.0, min(1.0, float(raw.get("confidence", 0.5)))),
                volatility_context=round(vol_ctx, 4),
                sentiment_context=round(sent_ctx, 4),
                source_cluster_ids=source_ids,
                related_regions=raw.get("related_regions", [])[:8],
                expires_at=expires_at,
            )
            db.add(strategy)
            new_strategies.append(strategy)
        except Exception as e:
            logger.warning("Skipped malformed strategy: %s — %s", raw.get("title", "?"), e)

    await db.commit()
    logger.info("Persisted %d market strategies", len(new_strategies))

    # ── Broadcast to frontend ─────────────────────────────────────────────────
    payload = [_serialize(s) for s in new_strategies]
    await publish_event(CHANNEL_STRATEGY_UPDATE, {"strategies": payload})

    return new_strategies


def _serialize(s: MarketStrategy) -> dict:
    return {
        "id": str(s.id),
        "title": s.title,
        "thesis": s.thesis,
        "rationale": s.rationale,
        "asset_class": s.asset_class,
        "specific_assets": s.specific_assets,
        "direction": s.direction,
        "timeframe": s.timeframe,
        "risk_level": s.risk_level,
        "confidence": s.confidence,
        "volatility_context": s.volatility_context,
        "sentiment_context": s.sentiment_context,
        "source_cluster_ids": s.source_cluster_ids,
        "related_regions": s.related_regions,
        "generated_at": s.generated_at.isoformat() if s.generated_at else None,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "is_active": s.is_active,
    }


# ─── Background Worker Loop ───────────────────────────────────────────────────

async def strategy_worker_loop() -> None:
    INTERVAL_SECONDS = 15 * 60  # run every 15 minutes
    logger.info("Strategy worker started. Interval: %ds", INTERVAL_SECONDS)

    # Initial delay — give cluster worker time to summarise first clusters
    await asyncio.sleep(90)

    while True:
        try:
            async with AsyncSessionLocal() as db:
                await generate_strategies(db)
        except Exception as e:
            logger.error("Strategy worker error: %s", e, exc_info=True)
        await asyncio.sleep(INTERVAL_SECONDS)
