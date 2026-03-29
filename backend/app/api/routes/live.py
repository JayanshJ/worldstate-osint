"""
Live tracking endpoints.

GET /api/v1/live/aircraft  — intelligence-relevant aircraft from OpenSky (cached 60 s)
GET /api/v1/live/vessels   — strategic maritime intelligence zones

Only surfaces aircraft that provide real geopolitical insight:
  • Military / government aircraft (by callsign prefix)
  • Any aircraft over active conflict / hot zones
  • Aircraft registered to watched countries (Russia, China, Iran, North Korea)
"""
import time
import logging

import httpx
from fastapi import APIRouter, Depends

from app.core.security import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)

# ─── Cache ────────────────────────────────────────────────────────────────────
_aircraft_cache: dict = {"data": None, "expires": 0.0}
AIRCRAFT_TTL = 60  # seconds

# ─── Military / government callsign prefixes ──────────────────────────────────
# These are ICAO telephony prefixes assigned to state/military operators.
MILITARY_PREFIXES = {
    # United States
    "RCH", "REACH", "JAKE", "ROCKY", "TOPCAT", "VIPER", "SKULL", "GRIM",
    "FURY", "DEMON", "GHOST", "DUKE", "HUNT", "KING", "VENUS", "BRIO",
    "BUICK", "SWIFT", "IRON", "TORCH", "SPAR",
    # United Kingdom
    "RRR", "FORTE", "MAGMA", "ASCOT",
    # NATO / multinational
    "NATO", "AWACS",
    # Germany
    "GAF", "GERMAN",
    # France
    "CTM", "FRFA", "FAF",
    # Russia
    "RFF", "RSU",
    # Israel
    "IAF",
    # China
    "CCA",  # PLAAF
    # Others
    "RNAF", "DAF", "BAF", "NATO", "USAF",
}

# ─── Active conflict / hot zones (lat/lon bounding boxes) ────────────────────
HOT_ZONES = [
    {"name": "Ukraine",          "lat": (44.0, 53.0), "lon": (22.0, 41.0)},
    {"name": "Middle East",      "lat": (20.0, 38.0), "lon": (28.0, 60.0)},
    {"name": "South China Sea",  "lat": (4.0,  25.0), "lon": (105.0, 125.0)},
    {"name": "Korean Peninsula", "lat": (34.0, 42.0), "lon": (124.0, 132.0)},
    {"name": "Black Sea",        "lat": (40.0, 47.0), "lon": (27.0,  42.0)},
    {"name": "Sahel",            "lat": (10.0, 20.0), "lon": (-18.0, 25.0)},
    {"name": "Myanmar",          "lat": (10.0, 28.0), "lon": (92.0,  102.0)},
]

# ─── Countries whose aircraft are always tracked ─────────────────────────────
WATCHED_COUNTRIES = {"Russia", "China", "Iran", "North Korea", "Belarus"}


def _hot_zone(lat: float, lon: float) -> str | None:
    for z in HOT_ZONES:
        if z["lat"][0] <= lat <= z["lat"][1] and z["lon"][0] <= lon <= z["lon"][1]:
            return z["name"]
    return None


def _classify(callsign: str | None, country: str, lat: float, lon: float) -> tuple[str, str] | None:
    """Return (category, reason) or None if not intelligence-relevant."""
    cs = (callsign or "").upper()

    # Military callsign match
    for prefix in MILITARY_PREFIXES:
        if cs.startswith(prefix):
            return ("military", f"{country} military")

    # Hot zone — any aircraft
    zone = _hot_zone(lat, lon)
    if zone:
        return ("hotzone", zone)

    # Watched country registration
    if country in WATCHED_COUNTRIES:
        return ("watched", country)

    return None


async def _fetch_opensky() -> list[dict]:
    now = time.time()
    if _aircraft_cache["data"] is not None and now < _aircraft_cache["expires"]:
        return _aircraft_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
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
        if alt < 1000:  # ignore low-altitude / ground traffic
            continue

        callsign = (s[1] or "").strip() or None
        country  = s[2] or ""

        result = _classify(callsign, country, lat, lon)
        if result is None:
            continue

        category, reason = result
        aircraft.append({
            "icao24":   s[0],
            "callsign": callsign,
            "country":  country,
            "lon":      round(lon, 4),
            "lat":      round(lat, 4),
            "altitude": round(alt),
            "velocity": round(s[9] or 0),
            "heading":  round(s[10] or 0),
            "category": category,   # "military" | "hotzone" | "watched"
            "reason":   reason,
        })

    logger.info("Aircraft filter: %d intelligence-relevant from OpenSky", len(aircraft))
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
