import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.intelligence.researcher import research_entity

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/entity")
async def get_entity_research(
    name: str = Query(..., min_length=1, description="Entity name to research"),
    type: Optional[str] = Query(None, description="Contextual type (e.g. SUPPLIER, ANALYST)")
):
    """
    Perform live OSINT research on a specific entity using AI + Search.
    Returns a structured dictionary with summary, key developments, etc.
    """
    try:
        context = f"This entity is identified as a {type} in the supply chain." if type else "No specific context provided."
        result = await research_entity(name, context)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception(f"Entity research failed for {name}")
        raise HTTPException(status_code=500, detail="Failed to research entity")
