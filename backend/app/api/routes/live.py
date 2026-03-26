"""
Live tracking endpoints.

GET /api/v1/live/aircraft  — real-time aircraft positions from OpenSky Network (cached 2 min)
GET /api/v1/live/vessels   — strategic maritime intelligence zones
"""
import random
import time
import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.models.user import User

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)

# ─── In-process cache (shared across workers via module state) ────────────────
_aircraft_cache: dict = {"data": None, "expires": 0.0}
AIRCRAFT_TTL = 120  # seconds


async def _fetch_opensky() -> list[dict]:
    now = time.time()
    if _aircraft_cache["data"] is not None and now < _aircraft_cache["expires"]:
        return _aircraft_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get("https://opensky-network.org/api/states/all")
            r.raise_for_status()
            raw = r.json()
    except Exception as e:
        logger.warning("OpenSky fetch failed: %s", e)
        return _aircraft_cache["data"] or []

    aircraft = []
    for s in (raw.get("states") or []):
        if len(s) < 12:
            continue
        lon, lat, on_ground = s[5], s[6], s[8]
        if lon is None or lat is None or on_ground:
            continue
        alt = s[7] or 0
        if alt < 500:          # skip very low / take-off noise
            continue
        aircraft.append({
            "icao24":   s[0],
            "callsign": (s[1] or "").strip() or None,
            "country":  s[2],
            "lon":      round(lon, 4),
            "lat":      round(lat, 4),
            "altitude": round(alt),        # metres
            "velocity": round(s[9] or 0),  # m/s
            "heading":  round(s[10] or 0), # degrees (0 = north)
        })

    # Cap at 600 spread across the globe
    if len(aircraft) > 600:
        aircraft = random.sample(aircraft, 600)

    _aircraft_cache["data"] = aircraft
    _aircraft_cache["expires"] = now + AIRCRAFT_TTL
    return aircraft


# ─── Strategic maritime intelligence zones ───────────────────────────────────
MARITIME_ZONES = [
    {
        "id": "hormuz",
        "name": "Strait of Hormuz",
        "lon": 56.27, "lat": 26.58,
        "query": "Strait Hormuz Iran oil tanker",
        "significance": "~20% of global oil supply transits here daily",
        "threat": "HIGH",
    },
    {
        "id": "bab",
        "name": "Bab el-Mandeb / Red Sea",
        "lon": 43.47, "lat": 12.58,
        "query": "Red Sea Houthi Yemen shipping attack",
        "significance": "Red Sea access for Suez route — active Houthi anti-ship threat",
        "threat": "CRITICAL",
    },
    {
        "id": "malacca",
        "name": "Strait of Malacca",
        "lon": 103.85, "lat": 1.35,
        "query": "Malacca Strait China shipping piracy",
        "significance": "~80% of China's oil imports transit here",
        "threat": "MODERATE",
    },
    {
        "id": "taiwan",
        "name": "Taiwan Strait",
        "lon": 119.5, "lat": 24.5,
        "query": "Taiwan Strait China military PLA",
        "significance": "Half of global container ships pass annually; active PLA naval activity",
        "threat": "HIGH",
    },
    {
        "id": "suez",
        "name": "Suez Canal",
        "lon": 32.55, "lat": 30.45,
        "query": "Suez Canal Egypt shipping blockage",
        "significance": "12% of global trade — primary European↔Asia route",
        "threat": "MODERATE",
    },
    {
        "id": "black_sea",
        "name": "Black Sea",
        "lon": 31.5, "lat": 43.5,
        "query": "Black Sea Ukraine Russia grain fleet",
        "significance": "Ukraine grain exports and Russian naval activity",
        "threat": "HIGH",
    },
    {
        "id": "baltic",
        "name": "Baltic Sea",
        "lon": 18.0, "lat": 57.5,
        "query": "Baltic Sea pipeline NATO Russia sabotage",
        "significance": "Critical pipeline infrastructure; recent sabotage incidents",
        "threat": "ELEVATED",
    },
    {
        "id": "south_china_sea",
        "name": "South China Sea",
        "lon": 114.0, "lat": 14.0,
        "query": "South China Sea Philippines dispute island",
        "significance": "~$5T annual trade; active territorial dispute with US/Philippines",
        "threat": "HIGH",
    },
    {
        "id": "persian_gulf",
        "name": "Persian Gulf",
        "lon": 51.0, "lat": 26.0,
        "query": "Persian Gulf Iran sanctions tanker seizure",
        "significance": "Iran tanker seizures and drone attacks on oil infrastructure",
        "threat": "HIGH",
    },
    {
        "id": "gibraltar",
        "name": "Strait of Gibraltar",
        "lon": -5.35, "lat": 35.99,
        "query": "Gibraltar Mediterranean shipping",
        "significance": "Gateway between Atlantic and Mediterranean — NATO western choke point",
        "threat": "LOW",
    },
    {
        "id": "cape",
        "name": "Cape of Good Hope",
        "lon": 18.4, "lat": -34.1,
        "query": "Cape Good Hope shipping route Red Sea diversion",
        "significance": "Alternative Suez bypass — traffic surged after Red Sea crisis",
        "threat": "LOW",
    },
    {
        "id": "panama",
        "name": "Panama Canal",
        "lon": -79.92, "lat": 9.08,
        "query": "Panama Canal drought water level restrictions",
        "significance": "Pacific↔Atlantic link — drought-related transit restrictions ongoing",
        "threat": "MODERATE",
    },
]

THREAT_COLORS = {
    "CRITICAL":  "#dc2626",
    "HIGH":      "#ef4444",
    "ELEVATED":  "#f97316",
    "MODERATE":  "#eab308",
    "LOW":       "#22c55e",
}

for z in MARITIME_ZONES:
    z["color"] = THREAT_COLORS.get(z["threat"], "#6b7280")


@router.get("/aircraft")
async def get_aircraft():
    return await _fetch_opensky()


@router.get("/vessels")
async def get_vessels():
    return MARITIME_ZONES
