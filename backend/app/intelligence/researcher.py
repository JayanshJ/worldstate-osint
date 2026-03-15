"""
Intelligence Layer — Live Entity Researcher

Uses Gemini 1.5 Flash with Google Search Grounding to perform 
on-the-fly OSINT intelligence gathering for entities without local data.
"""

import json
import logging
import re
from typing import Dict, Any

import google.generativeai as genai
from openai import AsyncOpenAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ─── System Prompt ────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a senior intelligence analyst at a signals intelligence agency.
Your task is to provide an immediate, structured briefing on a specific entity (person, company, or organization).
You have access to live Google Search. 

RULES — NEVER VIOLATE:
1. Write in DIRECT, DECLARATIVE sentences. Zero hedging. No "reportedly", "allegedly", "appears to".
2. Use PRESENT or PRESENT PERFECT tense for confirmed facts.
3. Provide the MOST RECENT and RELEVANT information based on your search.
4. If you cannot find any information after searching, explicitly state that in the summary.
5. Do not include markdown formatting outside of the JSON block. Output ONLY valid JSON.

OUTPUT SCHEMA (strict JSON):
{
  "summary": "A 2-4 sentence declarative briefing summarizing who they are, their current status, and recent material events.",
  "key_developments": [
    "First confirmed recent fact or development (max 20 words).",
    "Second confirmed recent fact or development (max 20 words).",
    "Third confirmed recent fact or development (max 20 words)."
  ],
  "known_affiliations": [
    "List of known companies, people, or groups they are affiliated with."
  ],
  "risk_indicators": [
    "List any controversies, legal issues, or risk factors (e.g., 'Sanctioned by OFAC', 'Involved in litigation'). Leave empty if none."
  ]
}
"""

def _parse_response(raw: str) -> Dict[str, Any]:
    """Extract JSON from model response, handle markdown fences."""
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
    if match:
        raw = match.group(1)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse research JSON: {raw}")
        return {
            "summary": "Failed to parse intelligence response.",
            "key_developments": [],
            "known_affiliations": [],
            "risk_indicators": []
        }

# ─── Gemini (Primary - with Search Grounding) ─────────────────────────────

async def _research_with_gemini(entity_name: str, context: str) -> Dict[str, Any]:
    genai.configure(api_key=settings.google_api_key)
    
    # Initialize the model with the Google Search tool
    model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=SYSTEM_PROMPT,
        tools="google_search_retrieval",
        generation_config=genai.GenerationConfig(
            temperature=0.2, 
            response_mime_type="application/json",
        ),
    )
    
    user_prompt = f"Conduct an immediate intelligence briefing on the following entity.\nTarget Entity: {entity_name}\nKnown Context: {context}\n\nSearch the live web for the most recent information and provide the requested JSON structure."
    
    response = await model.generate_content_async(user_prompt)
    return _parse_response(response.text)

# ─── OpenAI (Fallback - No Live Search) ───────────────────────────────────

async def _research_with_openai(entity_name: str, context: str) -> Dict[str, Any]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    user_prompt = f"Conduct an immediate intelligence briefing based on your internal knowledge for the following entity.\nTarget Entity: {entity_name}\nKnown Context: {context}\n\nProvide the requested JSON structure."
    
    response = await client.chat.completions.create(
        model=settings.openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return _parse_response(response.choices[0].message.content)

# ─── Facade ───────────────────────────────────────────────────────────────

async def research_entity(entity_name: str, context: str = "") -> dict:
    """
    Perform live OSINT research on an entity.
    Attempts Gemini with Search Grounding first; falls back to OpenAI on failure.
    """
    if not entity_name:
        raise ValueError("Entity name is required for research")

    if settings.google_api_key:
        try:
            result = await _research_with_gemini(entity_name, context)
            logger.info(f"Live research completed for {entity_name} via Gemini Flash Search")
            return result
        except Exception as e:
            logger.warning("Gemini live research failed: %s. Falling back to OpenAI (no live web).", e)

    result = await _research_with_openai(entity_name, context)
    logger.info(f"Research completed for {entity_name} via GPT-4o-mini (fallback)")
    return result
