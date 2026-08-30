# Source Expansion — Implementation Plan

> Assessment of how to broaden WorldState's intelligence sources,
> what's worth doing, what isn't, and how to build it.

---

## Current State

| Source Type | Count | Implementation | Status |
|---|---|---|---|
| RSS | 50 feeds | `rss_worker.py` — feedparser + httpx | Mature |
| Reddit | 35 subreddits | `reddit_worker.py` — asyncpraw | Mature |
| Twitter/X | 35 accounts | `SourceType.TWITTER` enum, no worker | **Stub only — never implemented** |
| Playwright | 1 scraper (AFP) | `playwright_worker.py` | Works, single source |
| Telegram | 0 | `SourceType.TELEGRAM` enum, no worker | **Stub only — never implemented** |

### What Works Well
- RSS ingestion is fire-and-forget: add a `Source()` to `sources.py`, restart, done
- Dedup (SHA-256 + cosine) and vectorization pipelines are source-agnostic — anything that produces `{title, body, url, published_at}` slots in
- Clustering, summarization, and strategy engines don't care where articles come from
- The `Source` dataclass + `SOURCE_MAP` + `get_credibility()` pattern is clean and extensible

### What Doesn't
- **Twitter enum exists but no worker** — 35 accounts defined, zero articles ingested
- **Telegram enum exists but no worker** — same story
- **No non-English sources** — blind to French, Arabic, Chinese, Spanish language news
- **No government/official sources** — Fed, Treasury, SEC filings, FOMC, State Dept
- **No think-tank analysis** — CSIS, RAND, Foreign Policy, Lowy Institute
- **Weak regional coverage** — Latin America, Africa, Southeast Asia
- **No commodities/energy-specific sources** — OilPrice, Rigzone, S&P Platts
- **No structured data feeds** — GDELT, NewsAPI, Event Registry
- **No SEC EDGAR as event source** — used for SPLC company lookups but not monitored for filings
- **No Substack/newsletter RSS** — a lot of alpha is in independent newsletters now

---

## Evaluation: What's Worth It?

Rated on **signal value × effort**, where the platform already works and the goal is
better intelligence, not more noise.

### Tier 1 — High Value, Low Effort (do now)

| Source | Why | Effort |
|---|---|---|
| Think tanks (CSIS, RAND, Foreign Policy, Lowy, IISS) | Geopolitical analysis that wire services miss. High credibility, low volume. | Add RSS feeds — 5 min |
| Government/central banks (Fed, Treasury, ECB, BoE, BoJ, FOMC) | Market-moving statements, rate decisions. Highest credibility. | Add RSS feeds — 10 min |
| Defense/MoD feeds (UK MoD, Israel MoD, Pentagon) | Primary-source conflict reporting. Often ahead of wire services. | Add RSS feeds — 10 min |
| Regional outlets (Nikkei Asia, El País EN, Politico EU, Straits Times, BBC Mundo) | Fills geographic blind spots. | Add RSS feeds — 10 min |
| Commodities/energy (OilPrice, Rigzone, S&P Platts) | Supply-chain intelligence needs commodity coverage. | Add RSS feeds — 5 min |
| Substack newsletters (Stratechery, Matt Levine, etc.) | Independent analysis with high signal. Most Substacks expose RSS. | Add RSS feeds — 5 min |
| SEC EDGAR filings RSS (8-K, 10-K, 13D/13G) | Corporate events that move markets. Already integrated for SPLC. | Add RSS feeds — 15 min |

**Total effort: ~1 hour. No code changes — just append to `RSS_SOURCES` in `sources.py`.**

### Tier 2 — High Value, Medium Effort

| Source | Why | Effort |
|---|---|---|
| GDELT (Global Database of Events, Language, and Tone) | Free, real-time global event stream from 50k+ news sources. Already extracted entities, geolocation, sentiment. Would massively expand coverage without adding individual sources. | New worker `gdelt_worker.py` — fetch CSV from GDELT API every 15 min, normalize to article schema, dedup. ~150 lines. |
| NewsAPI.org | 80k+ sources with a single API. Free tier: 100 req/day (developer plan). Good for filling gaps without managing individual feeds. | New worker `newsapi_worker.py` — poll `/v2/top-headlines` every 30 min. ~100 lines. |
| Telegram OSINT channels | Conflict-zone reporting often breaks on Telegram before anywhere else (Rybar, WarMonitor, various regional channels). | New worker `telegram_worker.py` using Telethon library. Need Telegram API credentials. ~200 lines. |
| Non-English sources + translation | Le Monde, Der Spiegel, El País, Asahi Shimbun, Xinhua. | RSS feeds exist. Would need to pipe titles/bodies through translation before embedding — adds latency and cost. Could use Gemini for translation (already have the key). Medium complexity. |

### Tier 3 — Medium Value, High Effort (skip for now)

| Source | Why | Effort | Verdict |
|---|---|---|---|
| Twitter/X API | Real-time alpha from accounts already defined. | X API is expensive ($100-500/mo for basic tier), rate-limited, and increasingly hostile to scrapers. The 35 accounts are curated well but the cost/effort ratio is bad. | **Skip** unless you have a paid X API tier. |
| LinkedIn posts | Professional/network signals. | LinkedIn API is gated, anti-scraping is aggressive, ToS is hostile. | **Skip.** |
| Bloomberg Terminal / Refinitiv | Gold-standard financial data. | Enterprise pricing ($2k+/mo). Not feasible for personal use. | **Skip.** |
| Reuters/API syndication | Direct wire feed. | Enterprise licensing. | **Skip.** |

### Tier 4 — Low Value (skip permanently)

| Source | Why | Verdict |
|---|---|---|
| Facebook, Instagram | Not news sources. | Skip |
| TikTok | Not news. | Skip |
| Discord servers | Niche, noisy, hard to access. | Skip |
| 4chan / anonymous forums | Too noisy, low credibility, legal risk. | Skip |

---

## Implementation Plan

### Phase 1: RSS Expansion (no code, ~1 hour)

Add ~30 new RSS sources to `sources.py`. These work immediately with
existing infrastructure.

#### Think Tanks & Analysis
```
CSIS               — https://www.csis.org/rss
RAND               — https://www.rand.org/rss
Foreign Policy     — https://foreignpolicy.com/feed/
The Diplomat       — https://thediplomat.com/feed/
War on the Rocks   — https://warontherocks.com/feed/
Lowy Institute     — https://www.lowyinstitute.org/rss
IISS               — https://www.iiss.org/rss
Brookings          — https://www.brookings.edu/feed/
Carnegie           — https://carnegieendowment.org/rss
```

#### Government & Central Banks
```
White House        — https://www.whitehouse.gov/feed/
State Dept         — https://www.state.gov/rss-feeds/
Federal Reserve    — https://www.federalreserve.gov/feeds/press_all.xml  (already have)
US Treasury        — https://home.treasury.gov/rss/press-releases
ECB                — https://www.ecb.europa.eu/rss/pressbox.html
Bank of England    — https://www.bankofengland.co.uk/news/rss
Bank of Japan      — https://www.boj.or.jp/en/rss/index.htm
FOMC Statements    — https://www.federalreserve.gov/feeds/monetary_policy.rss
BLS                — https://www.bls.gov/feed/
BIS                — https://www.bis.org/list/press/index.rss
```

#### Defense / MoD
```
UK MoD             — https://www.gov.uk/government/organisations/ministry-of-defence.atom
Israel MoD         — https://www.idf.il/en/rss/
Pentagon (DoD)     — https://www.defense.gov/rss/ (multiple feeds)
NATO               — https://www.nato.int/cps/en/natohq/news.rss
```

#### Regional Coverage
```
Nikkei Asia        — https://asia.nikkei.com/rss (multiple category feeds)
Straits Times      — https://www.straitstimes.com/news/world/rss
Politico EU        — https://www.politico.eu/rss/
Euronews           — https://www.euronews.com/rss
BBC Mundo          — https://feeds.bbci.co.uk/spanish/news/rss.xml
El País (EN)       — https://english.elpais.com/rss/
Le Monde           — https://www.lemonde.fr/rss/en/
Der Spiegel (EN)   — https://www.spiegel.de/international/index.rss
Jakarta Post       — https://www.thejakartapost.com/rss
Buenos Aires Times — https://www.batimes.com.ar/rss
```

#### Commodities & Energy
```
OilPrice.com       — https://oilprice.com/rss
Rigzone            — https://www.rigzone.com/news/rss/
S&P Platts         — https://www.spglobal.com/commodityinsights/en/rss
World Energy Monitor — https://www.worldenergymonitor.org/rss
```

#### Substack / Newsletters (high-signal independent analysis)
```
Stratechery        — https://stratechery.com/feed/
Matt Levine (Bloomberg) — https://feeds.bloomberg.com/markets/news.rss (already have)
The Information    — https://www.theinformation.com/feed/
Semafor            — https://www.semafor.com/feed
Punchbowl News     — https://punchbowl.news/feed/
Axios              — https://api.axios.com/feed/
```

#### SEC EDGAR Filings
```
SEC 8-K filings    — https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&action=getcurrent&output=atom
SEC 13D/13G        — https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC+13D&output=atom
```

### Phase 2: GDELT Integration (~1 day)

**What:** GDELT monitors 50k+ news sources globally, extracts events, actors,
geolocation, and sentiment, and publishes everything as free CSVs updated every
15 minutes.

**Why it's worth it:**
- Free, no API key, no rate limits
- Covers sources we'd never add individually (non-English, regional, local)
- Already has entity extraction and geolocation — enriches our clustering
- Acts as a safety net: catches events that our curated sources miss

**How:**

```
New file: backend/app/ingestion/gdelt_worker.py

1. Every 15 min, fetch the latest GDELT 2.0 events CSV:
   https://api.gdeltproject.org/api/v2/events/csv?mode=artlist&format=csv
   &timespan=15min&outputfields=htmlsocialshareimage,domain,language

2. Parse CSV rows → normalize to our article schema:
   {source_id: "gdelt", title: <from title field>, body: <from description>,
    url: <from sourceurl>, published_at: <from datefield>}

3. Apply credibility: 0.60 default (GDELT aggregates unknown sources)

4. Run through existing dedup pipeline (SHA-256 + cosine) — GDELT will
   often overlap with our RSS sources, dedup handles that automatically.

5. Enqueue for vectorization — same pipeline as everything else.

6. Bonus: GDELT includes GeoLocation (lat/lon) and Actor names — could
   store these in raw_json for the map/clustering enrichment.
```

**Worker skeleton:**
```python
# backend/app/ingestion/gdelt_worker.py

import asyncio, csv, logging, httpx
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

GDELT_URL = (
    "https://api.gdeltproject.org/api/v2/events/csv"
    "?mode=artlist&format=csv&timespan=15min"
    "&outputfields=htmlsocialshareimage,domain,language"
)

async def run_gdelt_cycle():
    async with httpx.AsyncClient() as client:
        resp = await client.get(GDELT_URL, timeout=30)
        # GDELT returns CSV (tab or comma separated)
        rows = list(csv.DictReader(resp.text.splitlines(), delimiter="\t"))

    new_ids = []
    async with AsyncSessionLocal() as db:
        for row in rows:
            title = row.get("title", "").strip()
            url = row.get("sourceurl", "").strip()
            if not title or not url:
                continue

            dedup = await check_duplicate(db, title, row.get("description"))
            if dedup.is_duplicate:
                continue

            article = RawArticle(
                source_id="gdelt",
                source_type="rss",  # reuse existing type
                url=url,
                title=title,
                body=row.get("description"),
                published_at=datetime.now(timezone.utc),
                raw_json={"domain": row.get("domain"),
                          "language": row.get("language"),
                          "geo": row.get("geolocation")},
                content_hash=dedup.content_hash,
                credibility_score=0.60,
            )
            db.add(article)
            try:
                async with db.begin_nested():
                    await db.flush()
                new_ids.append(str(article.id))
            except Exception:
                pass
        await db.commit()

    for aid in new_ids:
        await enqueue_article(aid)
    logger.info("GDELT cycle: %d new articles", len(new_ids))


async def gdelt_worker_loop():
    INTERVAL = 900  # 15 min
    logger.info("GDELT worker started. Interval: %ds", INTERVAL)
    while True:
        try:
            await run_gdelt_cycle()
        except Exception as e:
            logger.error("GDELT cycle error: %s", e)
        await asyncio.sleep(INTERVAL)
```

**Register in `ingestion_runner.py`:**
```python
from app.ingestion.gdelt_worker import gdelt_worker_loop

await asyncio.gather(
    rss_worker_loop(),
    reddit_worker_loop(),
    playwright_worker_loop(),
    gdelt_worker_loop(),      # new
    *vec_tasks,
)
```

**Effort:** ~150 lines. No new dependencies (httpx + csv are stdlib).
**Risk:** GDELT volume is high (~500-1000 articles per 15min cycle). May need to
raise `vectorization_workers` or add a credibility filter to skip low-signal items.

### Phase 3: Telegram Worker (~1 day)

**What:** Monitor Telegram channels for OSINT signals — conflict reports,
regional news, insider analysis.

**Why:**
- Telegram is where conflict news often breaks first (Ukraine, Middle East)
- OSINT aggregators post raw intel before it reaches wire services
- Complements our geopolitical coverage with real-time primary-source signals

**How:**

```
Prerequisites:
  - Telegram API credentials (api_id, api_hash) from https://my.telegram.org
  - Add to .env: TELEGRAM_API_ID, TELEGRAM_API_HASH
  - Install: pip install telethon (async Telegram client)

New file: backend/app/ingestion/telegram_worker.py

1. Define channels in sources.py as SourceType.TELEGRAM with channel
   username in extra dict:
   Source("tg_rybar", "Rybar", SourceType.TELEGRAM, 0.65,
          extra={"channel": "rybar_group"}),

2. Worker iterates channels, fetches recent messages via Telethon:
   - Get last 20 messages from each channel
   - Dedup by message_id
   - Normalize: title = first line or first 80 chars, body = full text
   - Set credibility from Source definition
   - Run through standard dedup + persist + enqueue pipeline

3. Run on ingestion_interval_seconds (same as RSS)

4. Add TELEGRAM_SOURCES to ALL_SOURCES in sources.py
```

**Channel suggestions (OSINT/conflict):**
```
rybar_group         — Russian milblogger, maps + front-line updates
                   (credibility: 0.55 — biased but timely)
WarMonitor          — Ukraine front-line tracking (0.60)
intel_sky           — Open-source intel aggregator (0.55)
nexta_live          —Belarus/Eastern Europe breaking (0.50)
                    (Use sparingly — high noise)
```

**Worker skeleton:**
```python
# backend/app/ingestion/telegram_worker.py

import asyncio, logging
from datetime import datetime, timezone

from telethon import TelegramClient
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate
from app.ingestion.sources import TELEGRAM_SOURCES
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

_seen_ids: dict[str, set[int]] = {}

async def run_telegram_cycle():
    client = TelegramClient(
        "worldstate", settings.telegram_api_id, settings.telegram_api_hash
    )
    await client.start()

    new_ids = []
    async with AsyncSessionLocal() as db:
        for src in TELEGRAM_SOURCES:
            channel = src.extra.get("channel")
            if not channel:
                continue

            try:
                messages = await client.get_messages(channel, limit=20)
            except Exception as e:
                logger.warning("Telegram fetch failed for %s: %s", channel, e)
                continue

            for msg in messages:
                if msg.id in _seen_ids.setdefault(src.id, set()):
                    continue
                _seen_ids[src.id].add(msg.id)

                text = (msg.message or "").strip()
                if not text or len(text) < 20:
                    continue

                title = text.split("\n")[0][:120]
                body = text

                dedup = await check_duplicate(db, title, body)
                if dedup.is_duplicate:
                    continue

                article = RawArticle(
                    source_id=src.id,
                    source_type="telegram",
                    url=f"https://t.me/{channel}/{msg.id}",
                    title=title,
                    body=body,
                    published_at=msg.date or datetime.now(timezone.utc),
                    raw_json={"message_id": msg.id, "channel": channel},
                    content_hash=dedup.content_hash,
                    credibility_score=src.credibility,
                )
                db.add(article)
                try:
                    async with db.begin_nested():
                        await db.flush()
                    new_ids.append(str(article.id))
                except Exception:
                    pass

        await db.commit()
    await client.disconnect()

    for aid in new_ids:
        await enqueue_article(aid)
    logger.info("Telegram cycle: %d new articles", len(new_ids))


async def telegram_worker_loop():
    logger.info("Telegram worker started. Interval: %ds",
                settings.ingestion_interval_seconds)
    while True:
        try:
            await run_telegram_cycle()
        except Exception as e:
            logger.error("Telegram cycle error: %s", e)
        await asyncio.sleep(settings.ingestion_interval_seconds)
```

**Caveats:**
- Telegram channels are inherently biased (state-aligned milbloggers, propaganda)
- Credibility scores should be low (0.50-0.65) — they're early-signal, not reliable-signal
- Telegram requires a one-time interactive auth flow (phone number + code) for the first session
- In Docker, the session file needs to persist across container restarts (mount a volume)
- Telethon sessions are stateful — if the session file is lost, re-auth is needed

**Effort:** ~200 lines + Telethon dependency + Telegram API credentials.
**Risk:** Telegram auth in Docker is annoying. One-time setup friction.

### Phase 4: NewsAPI.org Integration (~half day)

**What:** NewsAPI aggregates 80k+ news sources behind a single REST API.

**Why:**
- One API call replaces managing 80k individual RSS feeds
- Good for catching sources we'd never add manually
- Has a free tier (100 requests/day, 1 req per 30 min is enough)

**How:**
```
Prerequisites:
  - NewsAPI key from https://newsapi.org/register
  - Add to .env: NEWSAPI_KEY
  - Add to config.py: newsapi_key: str = ""

New file: backend/app/ingestion/newsapi_worker.py

1. Poll https://newsapi.org/v2/top-headlines?language=en&apiKey=...
   every 30 minutes (free tier: 100 req/day, this uses ~48)

2. Normalize response articles to our schema:
   {source_id: "newsapi_<domain>", title, body: description, url,
    published_at, credibility: 0.70 default}

3. Map NewsAPI source names to our credibility tiers where possible:
   - If source domain matches existing SOURCE_MAP entry, use that credibility
   - Otherwise default to 0.70

4. Run through standard dedup + persist + enqueue pipeline
   (Many articles will overlap with RSS — dedup handles this)
```

**Worker skeleton:**
```python
# backend/app/ingestion/newsapi_worker.py

import asyncio, logging, httpx
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.redis_client import enqueue_article
from app.ingestion.deduplication import check_duplicate
from app.ingestion.sources import SOURCE_MAP
from app.models.article import RawArticle

settings = get_settings()
logger = logging.getLogger(__name__)

NEWSAPI_URL = "https://newsapi.org/v2/top-headlines"

async def run_newsapi_cycle():
    params = {
        "language": "en",
        "pageSize": 100,
        "apiKey": settings.newsapi_key,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(NEWSAPI_URL, params=params, timeout=15)
        data = resp.json()

    if data.get("status") != "ok":
        logger.warning("NewsAPI error: %s", data.get("message"))
        return

    new_ids = []
    async with AsyncSessionLocal() as db:
        for article in data.get("articles", []):
            title = (article.get("title") or "").strip()
            url = article.get("url", "")
            if not title or not url or title == "[Removed]":
                continue

            source_name = article.get("source", {}).get("name", "unknown")
            source_id = f"newsapi_{source_name.lower().replace(' ', '_')}"

            # Inherit credibility from existing source if domain matches
            credibility = 0.70
            for existing_id, src in SOURCE_MAP.items():
                if source_name.lower() in existing_id.lower():
                    credibility = src.credibility
                    source_id = existing_id
                    break

            dedup = await check_duplicate(db, title, article.get("description"))
            if dedup.is_duplicate:
                continue

            art = RawArticle(
                source_id=source_id,
                source_type="rss",
                url=url,
                title=title,
                body=article.get("description"),
                published_at=datetime.fromisoformat(
                    article["publishedAt"].replace("Z", "+00:00")
                ) if article.get("publishedAt") else datetime.now(timezone.utc),
                raw_json={"source_name": source_name,
                          "image": article.get("urlToImage")},
                content_hash=dedup.content_hash,
                credibility_score=credibility,
            )
            db.add(art)
            try:
                async with db.begin_nested():
                    await db.flush()
                new_ids.append(str(art.id))
            except Exception:
                pass
        await db.commit()

    for aid in new_ids:
        await enqueue_article(aid)
    logger.info("NewsAPI cycle: %d new articles", len(new_ids))


async def newsapi_worker_loop():
    INTERVAL = 1800  # 30 min
    logger.info("NewsAPI worker started. Interval: %ds", INTERVAL)
    while True:
        try:
            await run_newsapi_cycle()
        except Exception as e:
            logger.error("NewsAPI cycle error: %s", e)
        await asyncio.sleep(INTERVAL)
```

**Register in `ingestion_runner.py`:**
```python
from app.ingestion.newsapi_worker import newsapi_worker_loop

await asyncio.gather(
    rss_worker_loop(),
    reddit_worker_loop(),
    playwright_worker_loop(),
    gdelt_worker_loop(),
    newsapi_worker_loop(),   # new
    *vec_tasks,
)
```

**Effort:** ~100 lines + NewsAPI key (free).
**Risk:** Free tier is 100 req/day. Paid tier is $449/mo for unlimited — not worth it
unless we need more than top-headlines. The free tier is sufficient for our use case.

### Phase 5: Non-English Sources + Translation (~1-2 days)

**What:** Add French, German, Spanish, Arabic, Chinese, Japanese sources and
translate before embedding.

**Why:**
- 60% of global news is not in English
- Le Monde, Der Spiegel, El País, Asahi Shimbun, Xinhua, Al Jazeera Arabic
- Translated articles expand cluster diversity and catch events English media misses

**How:**

```
Option A — Translate at ingestion time (adds latency, costs):
  1. Add non-English RSS sources with a language field:
     Source("lemonde", "Le Monde", SourceType.RSS, 0.85,
            "https://www.lemonde.fr/rss/en/", extra={"language": "fr"})
     (Note: many outlets have English RSS — use those where available to avoid
     translation cost. Only translate when no English feed exists.)

  2. In rss_worker.py, after fetching, if source.extra.get("language") != "en":
     - Send title + body to Gemini for translation
     - Store translated text, keep original in raw_json
     - This adds ~1-2s latency per article and Gemini API calls

  3. Embedding is done on the translated (English) text

Option B — Use English feeds where they exist (free, no translation needed):
  - Le Monde has https://www.lemonde.fr/rss/en/ (English edition)
  - Der Spiegel has https://www.spiegel.de/international/ (English)
  - El País has https://english.elpais.com/rss/ (English)
  - NHK has https://www3.nhk.or.jp/nhkworld/rss/news/ (English)
  - Xinhua has http://www.xinhuanet.com/english/rss.xml (English)
  - Al Jazeera Arabic: no English equivalent, would need translation

Recommendation: Start with Option B (English feeds). Add Option A only for
sources with no English edition (Xinhua Chinese, regional Arabic, local Japanese).
```

**Effort:** Option B: 10 min (just add feeds). Option A: 1-2 days (translation
pipeline, Gemini integration, latency management).
**Recommendation:** Do Option B now. Consider Option A later for specific
high-value non-English sources.

### Phase 6: SEC EDGAR Filings as Events (~half day)

**What:** Monitor SEC EDGAR for 8-K (current reports), 10-K (annual),
13D/13G (ownership changes) filings and ingest them as articles.

**Why:**
- 8-K filings are market-moving events (earnings, acquisitions, CEO changes)
- 13D/13G filings signal activist investor activity
- We already use SEC EDGAR for SPLC company lookups — same data, different use
- Filings are primary sources — highest possible credibility

**How:**

```
SEC EDGAR provides RSS-like feeds for recent filings:
  8-K:   https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom
  13D:   https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC+13D&output=atom
  10-K:  https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&output=atom

These are Atom feeds — feedparser handles them like RSS.

Add to RSS_SOURCES:
  Source("sec_8k",   "SEC 8-K Filings",   SourceType.RSS, 0.97,
         "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom"),
  Source("sec_13d",  "SEC 13D Filings",  SourceType.RSS, 0.95,
         "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC+13D&output=atom"),

Credibility: 0.97 — these are legally mandated regulatory filings.

Title parsing: The feed title is usually "Form 8-K: Company Name"
The worker may need to extract the company name from the title for better
clustering. Can be done in a post-ingestion enrichment step or by parsing
the title in fetch_feed.

Important: SEC EDGAR requires a User-Agent header with contact info:
  "WorldState-OSINT/1.0 (contact@worldstate.io)"
The current rss_worker already sends a User-Agent — just update it to
include an email if scraping SEC feeds.
```

**Effort:** Add feeds to `sources.py` — 15 min. Optional: custom title parsing
for better company extraction — 1-2 hours.
**Risk:** SEC EDGAR is rate-limited (10 req/s). Our 2-minute poll cycle is fine.

---

## Priority Order

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| 1 | Phase 1: RSS expansion (30+ feeds) | 1 hour | High — immediate coverage broadening |
| 2 | Phase 2: GDELT integration | 1 day | High — 50k+ sources for free |
| 3 | Phase 6: SEC EDGAR filings | 15 min | High — market-moving primary sources |
| 4 | Phase 4: NewsAPI.org | half day | Medium — catches gaps, free tier sufficient |
| 5 | Phase 3: Telegram worker | 1 day | Medium — conflict zone early signals |
| 6 | Phase 5: Non-English (Option B) | 10 min | Medium — English editions of foreign press |
| 7 | Phase 5: Non-English (Option A) | 1-2 days | Low — only for sources with no English edition |

**Total effort for Phases 1-3 + 6: ~2 days. That covers 90% of the value.**

---

## Architecture Considerations

### Volume & Throughput

Current: ~50 RSS + 35 Reddit = ~200-400 articles per cycle (every 2 min)
After Phase 1 (+30 RSS): ~250-500 articles per cycle
After Phase 2 (GDELT): +500-1000 per 15 min cycle
After Phase 4 (NewsAPI): +100 per 30 min cycle

The vectorization pipeline is the bottleneck:
- Each OpenAI embedding call takes ~200-500ms
- 4 parallel workers = ~50-120 articles/min throughput
- GDELT alone could add 1000 articles per 15 min = ~67 articles/min
- Combined with RSS, we may hit ~150 articles/min at peak

**Mitigation:**
- Raise `vectorization_workers` from 4 to 8 in `.env`
- Add a credibility filter: skip embedding for sources with credibility < 0.40
  (Reddit low-signal, GDELT noise)
- Or: only embed articles from sources with credibility >= 0.60 and let
  low-credibility articles stay unembedded (still searchable by text, just
  not in semantic clusters)

### Cost

| Item | Cost |
|---|---|
| OpenAI embeddings (text-embedding-3-small) | ~$0.02 per 1M tokens. At 500 articles/day × 500 tokens avg = 250k tokens/day = ~$0.005/day. Negligible. |
| OpenAI LLM (gpt-5.6-luna for summarization) | Depends on cluster volume. ~50 clusters/day × 2k tokens = 100k tokens/day. Model-dependent. |
| Gemini 1.5 Flash (summarization) | Free tier: 15 RPM, 1M tokens/day. Sufficient. |
| NewsAPI free tier | $0 |
| GDELT | $0 |
| Telegram API | $0 |
| Reddit API | $0 (60 req/min free tier) |

**Total additional cost: ~$0 (all free tiers) except OpenAI which is already negligible.**

### Dedup Impact

Adding GDELT + NewsAPI will dramatically increase overlap with RSS sources.
The existing 2-layer dedup (SHA-256 exact + cosine semantic) handles this:

- Layer 1 (SHA-256): catches exact reposts (common with wire service syndication)
- Layer 2 (cosine > 0.92): catches near-duplicates with edited headlines

Expected: 40-60% of GDELT/NewsAPI articles will be duplicates of RSS.
This is fine — dedup is fast and the cost is negligible.

### Database Growth

At ~150 articles/day (current) → ~500-800 articles/day after expansion:
- raw_articles: ~800 rows/day × 365 = ~292k rows/year
- article_embeddings: same, 1536-dim vectors × ~3KB each = ~880MB/year
- HNSW index: grows with embeddings, memory usage scales linearly

pgvector handles this fine. The 24-hour cluster expiry + 6-hour soft expiry
keeps the active cluster set small (~500-2000 clusters at any time).

### What NOT to Do

1. **Don't add Twitter/X** — API is too expensive and hostile. The 35 accounts
   are defined but unimplemented. Either implement the worker (if you have a
   paid X API tier) or remove the dead enum/sources to avoid confusion.

2. **Don't add social platforms (Facebook, Instagram, TikTok)** — not news
   sources, anti-scraping is aggressive, ToS is hostile, signal-to-noise is bad.

3. **Don't try to translate everything** — English editions exist for most major
   foreign outlets. Only translate for sources with no English equivalent.

4. **Don't add low-credibility sources without a filter** — GDELT and Telegram
   will add noise. Either set low credibility (0.50-0.60) so they don't trigger
   AI summarization alone (cluster_intelligence_weighted_threshold = 1.8 means
   it takes 2-3 sources to trigger), or add a credibility floor for embedding.

5. **Don't increase RSS poll frequency** — 2 minutes is already aggressive.
   Most RSS feeds update at most every 15-30 min. Faster polling wastes
   bandwidth and risks rate-limiting.

---

## Summary

The platform's ingestion architecture is well-designed — adding sources is
mostly just data entry in `sources.py`. The highest-impact work is:

1. **Add 30+ RSS feeds** (think tanks, government, regional, commodities) — 1 hour
2. **Add GDELT** — 50k+ sources for free — 1 day
3. **Add SEC EDGAR filings** — market-moving primary sources — 15 min
4. **Add NewsAPI** — gap-filler — half day
5. **Add Telegram** — conflict-zone early signals — 1 day

Phases 1-3 can be done in a single day and cover 90% of the value.
The rest is diminishing returns.