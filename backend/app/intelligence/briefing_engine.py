"""
Morning Briefing Engine

Generates a daily AI briefing from the last 24 hours of intelligence clusters.
Runs once per UTC day; skips if today's briefing already exists.
Sends briefing email to all active users via Resend.
"""

import asyncio
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.article import EventCluster
from app.models.briefing import MorningBriefing
from app.models.user import User

settings = get_settings()
logger = logging.getLogger(__name__)

BRIEFING_PROMPT = """You are a senior macro analyst writing a morning intelligence briefing for professional traders and portfolio managers.

Based on the active intelligence clusters below, produce a structured daily briefing. Be specific, cite cluster data, and focus on what matters for markets today.

OUTPUT — return exactly this JSON (no markdown, no preamble):
{
  "headline": "10-word max theme headline for today's session",
  "tldr": "2-3 sentence executive summary of the most important market-moving developments",
  "top_events": [
    {
      "title": "Event title",
      "summary": "1-2 sentence summary with market implication",
      "volatility": <float 0-1>,
      "regions": ["Region1", "Region2"]
    }
  ],
  "trade_setups": [
    {
      "direction": "LONG|SHORT|HEDGE|WATCH",
      "asset": "Asset Name (TICKER)",
      "thesis": "1 sentence thesis",
      "timeframe": "INTRADAY|SHORT|MEDIUM"
    }
  ],
  "macro_theme": "1 sentence overarching macro narrative for today"
}

Rules:
- top_events: 3-5 most market-relevant events, ordered by importance
- trade_setups: 3-5 highest conviction setups from today's intelligence
- Be specific: name assets, tickers, regions
- Ground everything in the cluster data provided
"""


def _build_briefing_prompt(clusters: list[EventCluster]) -> str:
    lines = [f"Generate a morning briefing from these {len(clusters)} active intelligence clusters:\n"]
    for i, c in enumerate(clusters, 1):
        bullets = "; ".join(c.summary_bullets or [])
        lines.append(f"[{i}] {c.label} | vol={c.volatility:.2f} | {c.member_count} sources | {bullets}")
    return "\n".join(lines)


async def _generate_briefing_content(clusters: list[EventCluster]) -> dict | None:
    prompt = _build_briefing_prompt(clusters)
    raw = None

    if settings.google_api_key:
        try:
            genai.configure(api_key=settings.google_api_key)
            model = genai.GenerativeModel(
                model_name=settings.gemini_model,
                system_instruction=BRIEFING_PROMPT,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                ),
            )
            resp = await model.generate_content_async(prompt)
            raw = resp.text
        except Exception as e:
            logger.warning("Gemini briefing failed: %s", e)

    if not raw:
        try:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            resp = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": BRIEFING_PROMPT},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.2,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content
        except Exception as e:
            logger.error("OpenAI briefing failed: %s", e)
            return None

    try:
        raw = raw.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
        if fence:
            raw = fence.group(1)
        return json.loads(raw)
    except Exception as e:
        logger.error("Briefing parse failed: %s", e)
        return None


async def _send_briefing_emails(briefing: MorningBriefing, db: AsyncSession) -> None:
    """Send the morning briefing to all active users via Resend."""
    from app.core.email import send_email

    if not settings.resend_api_key:
        return

    result = await db.execute(select(User).where(User.is_approved == True))
    users = result.scalars().all()

    setups_html = ""
    for s in (briefing.trade_setups or [])[:5]:
        dir_color = "#22c55e" if s.get("direction") == "LONG" else "#ef4444" if s.get("direction") == "SHORT" else "#eab308"
        setups_html += f"""
        <tr>
          <td style="padding:6px 8px;color:{dir_color};font-weight:700;font-size:11px;">{s.get('direction','')}</td>
          <td style="padding:6px 8px;color:#ffffff;font-size:11px;">{s.get('asset','')}</td>
          <td style="padding:6px 8px;color:#9ca3af;font-size:11px;">{s.get('thesis','')}</td>
          <td style="padding:6px 8px;color:#6b7280;font-size:10px;">{s.get('timeframe','')}</td>
        </tr>"""

    events_html = ""
    for ev in (briefing.top_events or [])[:5]:
        vol_pct = int(float(ev.get('volatility', 0.5)) * 100)
        vol_color = "#ef4444" if vol_pct >= 70 else "#f97316" if vol_pct >= 40 else "#22c55e"
        events_html += f"""
        <div style="border-left:3px solid {vol_color};padding:8px 12px;margin-bottom:8px;background:#0d0f1a;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#ffffff;font-size:13px;font-weight:600;">{ev.get('title','')}</span>
            <span style="color:{vol_color};font-size:10px;font-weight:700;">VOL {vol_pct}%</span>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">{ev.get('summary','')}</p>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<body style="background:#08090f;font-family:monospace;color:#e5e7eb;padding:32px;max-width:620px;margin:0 auto;">
  <p style="color:#00d4ff;font-size:10px;letter-spacing:4px;margin:0 0 4px;">WORLDSTATE</p>
  <p style="color:#374151;font-size:10px;margin:0 0 24px;">Morning Briefing · {briefing.date.strftime('%A, %B %d %Y')}</p>

  <h1 style="color:#ffffff;font-size:22px;margin:0 0 8px;line-height:1.3;">{briefing.headline}</h1>
  <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 24px;">{briefing.tldr}</p>

  <p style="color:#00d4ff;font-size:10px;letter-spacing:3px;margin:0 0 12px;">TOP EVENTS</p>
  {events_html}

  <p style="color:#00d4ff;font-size:10px;letter-spacing:3px;margin:24px 0 12px;">TRADE SETUPS</p>
  <table style="width:100%;border-collapse:collapse;background:#13151f;border:1px solid #1f2937;">
    <thead>
      <tr style="border-bottom:1px solid #1f2937;">
        <th style="padding:6px 8px;text-align:left;color:#374151;font-size:9px;letter-spacing:2px;">DIR</th>
        <th style="padding:6px 8px;text-align:left;color:#374151;font-size:9px;letter-spacing:2px;">ASSET</th>
        <th style="padding:6px 8px;text-align:left;color:#374151;font-size:9px;letter-spacing:2px;">THESIS</th>
        <th style="padding:6px 8px;text-align:left;color:#374151;font-size:9px;letter-spacing:2px;">TF</th>
      </tr>
    </thead>
    <tbody>{setups_html}</tbody>
  </table>

  <div style="margin-top:20px;padding:12px;background:#0d0f1a;border:1px solid #1f2937;">
    <p style="color:#6b7280;font-size:10px;letter-spacing:2px;margin:0 0 4px;">MACRO THEME</p>
    <p style="color:#d1d5db;font-size:12px;margin:0;">{briefing.macro_theme}</p>
  </div>

  <a href="{settings.app_base_url}" style="display:inline-block;margin-top:20px;background:#00d4ff;color:#08090f;padding:10px 20px;font-size:11px;font-weight:700;letter-spacing:2px;text-decoration:none;">
    OPEN WORLDSTATE →
  </a>

  <p style="color:#374151;font-size:10px;margin-top:24px;">
    NOT FINANCIAL ADVICE · AI-generated research for informational purposes only.
  </p>
</body>
</html>"""

    subject = f"WorldState Briefing: {briefing.headline}"
    tasks = [send_email(u.email, subject, html) for u in users if u.email]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    logger.info("Briefing emails sent to %d users", len(tasks))


async def generate_morning_briefing(db: AsyncSession, force: bool = False) -> MorningBriefing | None:
    """
    Generate today's morning briefing. Skips if already generated for today
    (unless force=True). Returns the briefing record.
    """
    today = datetime.now(timezone.utc).date()

    # Check if already generated today
    if not force:
        existing = await db.execute(
            select(MorningBriefing).where(MorningBriefing.date == today)
        )
        if existing.scalar_one_or_none():
            logger.info("Briefing for %s already exists — skipping", today)
            return None

    # Fetch top active clusters from last 24h
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(EventCluster)
        .where(
            EventCluster.is_active == True,
            EventCluster.label != None,
            EventCluster.first_seen_at >= cutoff,
        )
        .order_by((EventCluster.volatility * EventCluster.weighted_score).desc())
        .limit(20)
    )
    clusters = result.scalars().all()

    if len(clusters) < 3:
        logger.info("Not enough clusters (%d) for morning briefing", len(clusters))
        return None

    logger.info("Generating morning briefing from %d clusters", len(clusters))
    content = await _generate_briefing_content(clusters)
    if not content:
        return None

    # Upsert: delete any existing record for today, then insert
    existing = await db.execute(
        select(MorningBriefing).where(MorningBriefing.date == today)
    )
    old = existing.scalar_one_or_none()
    if old:
        await db.delete(old)
        await db.flush()

    briefing = MorningBriefing(
        date=today,
        headline=str(content.get("headline", ""))[:300],
        tldr=str(content.get("tldr", "")),
        top_events=content.get("top_events", [])[:5],
        trade_setups=content.get("trade_setups", [])[:5],
        macro_theme=str(content.get("macro_theme", "")),
    )
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)

    logger.info("Morning briefing generated: %s", briefing.headline)

    # Send email to all users
    asyncio.create_task(_send_briefing_emails(briefing, AsyncSessionLocal()))
    return briefing


async def briefing_worker_loop() -> None:
    """Checks once per hour whether today's briefing needs to be generated."""
    logger.info("Briefing worker started")
    await asyncio.sleep(120)   # initial delay

    while True:
        try:
            now = datetime.now(timezone.utc)
            # Generate between 07:00 and 08:00 UTC
            if 7 <= now.hour < 8:
                async with AsyncSessionLocal() as db:
                    await generate_morning_briefing(db)
        except Exception as e:
            logger.error("Briefing worker error: %s", e, exc_info=True)
        await asyncio.sleep(3600)   # check once per hour
