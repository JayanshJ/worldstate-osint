"""
Intelligence Layer — AI Summarizer

Uses Gemini 1.5 Flash (primary) with GPT-4o-mini as fallback.
Returns structured intelligence briefs in "agency" style.
"""

import json
import logging
import re

import google.generativeai as genai
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

# ─── System Prompt ────────────────────────────────────────────────────────
# This is the "intelligence agency" style prompt. Designed for:
# - Zero hedging language ("it appears", "seems to be")
# - Active voice, present/immediate tense
# - Entity extraction with geopolitical context
# - Volatility scoring based on escalation indicators

SYSTEM_PROMPT = """You are a senior intelligence analyst at a signals intelligence agency.
Your output feeds directly into a real-time geopolitical dashboard.

RULES — NEVER VIOLATE:
1. Write in DIRECT, DECLARATIVE sentences. Zero hedging. No "reportedly", "allegedly", "appears to".
2. Use PRESENT or PRESENT PERFECT tense for confirmed facts.
3. ACTIVE voice only.
4. Every sentence must be independently verifiable from the provided sources.
5. If sources conflict, state the CONFLICT explicitly in one bullet: "Sources diverge on X: [A] vs [B]."
6. Maximum 25 words per bullet.
7. Output ONLY valid JSON — no markdown, no preamble.

OUTPUT SCHEMA (strict JSON):
{
  "title": "8-word max declarative headline, no verbs like 'update' or 'report'",
  "bullets": [
    "First confirmed development — most critical",
    "Second confirmed development or key context",
    "Third: escalation potential OR source divergence note"
  ],
  "entities": {
    "people": ["Full Name (Role/Country)"],
    "organizations": ["Org Name (Type)"],
    "locations": ["City, Country (relevance: e.g., conflict zone)"]
  },
  "volatility": <float 0.0-1.0>,
  "sentiment": <float -1.0-1.0>,
  "volatility_rationale": "One sentence explaining the volatility score"
}

VOLATILITY SCORING GUIDE:
  0.0–0.2: Routine diplomatic/economic news
  0.2–0.4: Noteworthy political developments, protests, sanctions
  0.4–0.6: Armed confrontation, crisis escalation, significant casualties
  0.6–0.8: Active conflict, major attack, government collapse
  0.8–1.0: Nuclear/WMD threat, imminent war declaration, mass casualty event

SENTIMENT SCORING:
  -1.0 = Severe negative (war, disaster, collapse)
   0.0 = Neutral / ambiguous
  +1.0 = Strongly positive (ceasefire, treaty, resolution)"""


def _build_user_prompt(articles: list[RawArticle]) -> str:
    lines = [
        f"Analyze the following {len(articles)} intelligence source(s) and produce a structured brief:\n"
    ]
    for i, article in enumerate(articles, 1):
        source_tier = (
            "Tier-1 Wire Service" if article.credibility_score >= 0.9
            else "Major Outlet" if article.credibility_score >= 0.75
            else "Secondary Source"
        )
        lines.append(f"[SOURCE {i} — {source_tier} | weight={article.credibility_score:.2f}]")
        lines.append(f"TITLE: {article.title}")
        if article.body:
            lines.append(f"BODY: {article.body[:1000]}")
        lines.append("")

    return "\n".join(lines)


def _parse_response(raw: str) -> dict:
    """Extract JSON from model response, handle markdown fences."""
    raw = raw.strip()
    # Strip ```json ... ``` fences if present
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    return json.loads(raw)


# ─── Gemini ───────────────────────────────────────────────────────────────

async def _summarize_with_gemini(articles: list[RawArticle]) -> dict:
    genai.configure(api_key=settings.google_api_key)
    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=0.1,        # low temp = factual, deterministic
            max_output_tokens=1024,
            response_mime_type="application/json",
        ),
    )
    user_prompt = _build_user_prompt(articles)
    response = await model.generate_content_async(user_prompt)
    return _parse_response(response.text)


# ─── GPT-4o-mini (fallback) ───────────────────────────────────────────────

async def _summarize_with_openai(articles: list[RawArticle]) -> dict:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    user_prompt = _build_user_prompt(articles)
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.1,
        max_tokens=1024,
        response_format={"type": "json_object"},
    )
    return _parse_response(response.choices[0].message.content)


# ─── Facade with fallback ─────────────────────────────────────────────────

async def summarize_cluster(articles: list[RawArticle]) -> dict:
    """
    Attempt Gemini first; fall back to GPT-4o-mini on failure.
    Returns the intelligence brief dict.
    """
    if not articles:
        raise ValueError("No articles provided for summarization")

    # Try Gemini if key configured
    if settings.google_api_key:
        try:
            result = await _summarize_with_gemini(articles)
            logger.info("Intelligence brief generated via Gemini Flash")
            return result
        except Exception as e:
            logger.warning("Gemini summarization failed: %s. Falling back to OpenAI.", e)

    # Fallback: GPT-4o-mini
    result = await _summarize_with_openai(articles)
    logger.info("Intelligence brief generated via GPT-4o-mini")
    return result
