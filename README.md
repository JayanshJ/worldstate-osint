# WorldState — Real-Time OSINT Intelligence Dashboard

A Bloomberg Terminal for global events. Ingests wire services and aggregates news from dozens of outlets worldwide, clusters articles into events using AI, and streams everything live to a dark-mode React dashboard with a world-map intelligence view.

---

## Share With Friends — Run It Yourself in 5 Minutes

### What You Need

| Requirement | Where to get it | Cost |
|-------------|-----------------|------|
| **Docker Desktop** | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | Free |
| **OpenAI API key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$1–3/month (light use) |
| **Google Gemini key** | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) | Free (generous quota) |

> **Minimum:** Docker + OpenAI key. Everything else is optional.

---

### Step 1 — Get the code

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

> Ask the person who shared this with you for the repo link.

---

### Step 2 — Start everything

```bash
./start.sh
```

**That's it.** The script will:
1. Check that Docker is running
2. Ask for your API key(s) the first time — saved to a local `.env` file
3. Build and start all 6 services (database, cache, API, workers, frontend)
4. Show live logs

> **First run takes 3–8 minutes** while Docker downloads and builds images.
> Subsequent starts take ~20 seconds.

---

### Step 3 — Open the dashboard

Once you see `frontend_1 | ready in ...ms`, open:

| Page | URL |
|------|-----|
| **Dashboard** | [http://localhost:3000](http://localhost:3000) |
| API explorer | [http://localhost:8000/docs](http://localhost:8000/docs) |

> It takes another **1–2 minutes** after opening for the first articles and clusters to appear. The dashboard shows `Monitoring sources — no clusters yet` while the ingestion worker runs its first cycle.

---

### Stop / Restart

```bash
# Stop everything cleanly
Ctrl+C   (inside the terminal running ./start.sh)

# Start again later (fast, no rebuild)
./start.sh

# Full reset — delete all data and rebuild from scratch
docker compose down -v
./start.sh
```

---

### Troubleshooting

**"Docker is not running"**
Open Docker Desktop from your Applications folder, wait for the whale icon to stop animating, then try again.

**"Port 3000 / 8000 already in use"**
Something else is using that port. Find and stop it:
```bash
# macOS / Linux
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

**"No articles / clusters appearing after 5 minutes"**
Your OpenAI API key may be invalid or have no credits. Check:
- [platform.openai.com/usage](https://platform.openai.com/usage) — confirm you have credit
- Edit `.env` and replace `OPENAI_API_KEY=sk-...` with your key, then restart

**Dashboard shows API errors on first load**
The backend takes ~30 seconds to finish starting. Wait a moment and refresh.

**Map shows no active regions**
Clusters need to exist first. Wait 5–10 minutes after the first articles appear.

---

### What Each Service Does

| Service | Description |
|---------|-------------|
| `postgres` | Stores articles, clusters, alerts, and vector embeddings |
| `redis` | Message queue between services + real-time WebSocket fan-out |
| `api` | FastAPI backend — serves the dashboard data over REST + WebSocket |
| `ingestion_worker` | Polls 20+ news sources every 2 minutes, deduplicates, embeds with OpenAI |
| `cluster_worker` | Groups related articles into event clusters using HDBSCAN every 60s, generates AI summaries |
| `frontend` | React dashboard served at localhost:3000 |

---

### Optional: Reddit + Gemini

For better coverage and faster/cheaper AI summaries, add these to your `.env`:

```bash
# Better AI summaries (free, higher limits than OpenAI)
GOOGLE_API_KEY=your_gemini_key_here

# Reddit posts (r/worldnews, r/geopolitics) — great for breaking events
REDDIT_CLIENT_ID=your_id
REDDIT_CLIENT_SECRET=your_secret
```

Get Reddit credentials at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → "create another app" → script type.

---

---

## How the Dashboard Works

### FEED view

- **Cluster Feed (left)** — AI-grouped events sorted by volatility. Each card has a headline, 3 intelligence bullets, entity tags, and live update flash.
- **Live Raw Feed (right)** — Every article as it arrives, with source credibility dots and timestamps.
- **⌘K Search** — Full-text + AI semantic search across all articles and clusters.
- **Alerts** — Set keyword + volatility watches; browser notification when triggered.

### MAP view (click MAP in the top bar)

- World map colored by news activity — red = critical, orange = elevated, yellow = moderate.
- **Click any country** → side panel shows relevant clusters and recent articles for that country.
- **Active Regions** legend (top-left) lists the hottest countries. Click any to jump straight to its news.
- Scroll to zoom, drag to pan.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INGESTION LAYER                               │
│                                                                         │
│  RSS Worker          Reddit Worker       Playwright Worker              │
│  (Reuters, AP,       (r/worldnews,       (AFP live,                     │
│   BBC, AJE…)          r/geopolitics)      custom scrapers)              │
│       │                    │                    │                       │
│       └────────────────────┴────────────────────┘                       │
│                            │                                            │
│                    Deduplication Engine                                 │
│               Layer 1: SHA-256 hash (exact)                             │
│               Layer 2: Cosine similarity ANN (semantic)                 │
│                            │                                            │
│                      raw_articles (PostgreSQL)                          │
│                            │                                            │
│                    Redis Queue: queue:vectorize                         │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                        VECTORIZATION LAYER                              │
│                                                                         │
│              OpenAI text-embedding-3-small (1536-dim)                   │
│                            │                                            │
│               article_embeddings + HNSW index (pgvector)               │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                         CLUSTERING LAYER                                │
│                                                                         │
│  Every 60s: HDBSCAN on unclassified embeddings (last 6h)               │
│      │                                                                  │
│      ├─ New cluster    → create event_clusters row                      │
│      └─ Existing match → merge + recompute running centroid             │
│                            │                                            │
│  Drift Management: expire_old_clusters() SQL function                   │
│      Low-signal (<3 src): expire after 6h                              │
│      All clusters:         expire after 24h                             │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                       INTELLIGENCE LAYER                                │
│                                                                         │
│  Trigger: weighted_score ≥ 2.5  (sum of source credibility scores)     │
│                                                                         │
│  Gemini 1.5 Flash ──► GPT-4o-mini (fallback)                           │
│                                                                         │
│  Output per cluster:                                                    │
│    • 8-word declarative headline                                        │
│    • 3 agency-style bullet points (≤25 words each)                     │
│    • Key entities: people / organizations / locations                   │
│    • Volatility score [0,1]  ·  Sentiment score [-1,1]                 │
│                                                                         │
│  Alert Engine: evaluate active watches → fire + push notification       │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────────┐
│                          API LAYER (FastAPI)                            │
│                                                                         │
│  GET  /api/v1/clusters/          List active event clusters             │
│  GET  /api/v1/clusters/:id       Cluster detail + source timeline       │
│  GET  /api/v1/feed/              Raw ingested articles                  │
│  GET  /api/v1/search/?q=&mode=   Keyword or semantic search             │
│  GET  /api/v1/stats/             System metrics                         │
│  GET  /api/v1/alerts/            List alert watch rules                 │
│  POST /api/v1/alerts/            Create alert watch rule                │
│  WS   /ws                        Real-time event stream                 │
└────────────────────────────┼────────────────────────────────────────────┘
```

---

## Source Credibility Weights

| Tier | Sources | Weight |
|------|---------|--------|
| T1 — Wire Services | Reuters, AP | 0.95 – 0.97 |
| T2 — Major Outlets | BBC, DW, Al Jazeera, France 24, The Guardian | 0.80 – 0.88 |
| T3 — Regional / Live | AFP live, Middle East Eye, Dawn, The Hindu, SCMP | 0.70 – 0.79 |
| T4 — Reddit / Community | r/worldnews, r/geopolitics, r/breakingnews | 0.35 – 0.45 |

---

## Volatility Scale

| Label | Range | Meaning |
|-------|-------|---------|
| CALM | 0.00 – 0.24 | Routine diplomatic / economic |
| LOW | 0.25 – 0.39 | Noteworthy political developments |
| MOD | 0.40 – 0.54 | Protests, sanctions, significant statements |
| ELEV | 0.55 – 0.69 | Armed confrontation, crisis escalation |
| HIGH | 0.70 – 0.84 | Active conflict, major attack |
| CRIT | 0.85 – 1.00 | WMD threat, war declaration, mass casualty |

---

## Configuration Reference

All settings live in `.env` (copied from `.env.example` on first run):

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | **Required.** Embeddings + GPT-4o-mini fallback |
| `GOOGLE_API_KEY` | — | Optional. Gemini 1.5 Flash as primary summarizer |
| `REDDIT_CLIENT_ID` | — | Optional. Reddit API credentials |
| `REDDIT_CLIENT_SECRET` | — | Optional. Reddit API credentials |
| `INGESTION_INTERVAL_SECONDS` | `120` | How often RSS + Reddit are polled |
| `CLUSTER_RUN_INTERVAL_SECONDS` | `60` | How often HDBSCAN clustering runs |
| `CLUSTER_COSINE_THRESHOLD` | `0.18` | Max cosine distance to merge into existing cluster |
| `DEDUP_SIMILARITY_THRESHOLD` | `0.92` | Cosine similarity above which = semantic duplicate |
| `CLUSTER_SOFT_EXPIRE_HOURS` | `6` | Expiry for low-signal clusters (< 3 members) |
| `CLUSTER_HARD_EXPIRE_HOURS` | `24` | Hard expiry for all clusters |

---

## Adding New Sources

1. Add an entry to `backend/app/ingestion/sources.py`:

```python
Source("my_source", "My Source Name", SourceType.RSS, 0.85,
       "https://example.com/rss.xml")
```

2. Add it to `RSS_SOURCES`.

3. Restart — the worker picks it up automatically.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI + uvicorn |
| Database | PostgreSQL 16 + pgvector (HNSW index) |
| Queue / Pub-Sub | Redis 7 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Clustering | HDBSCAN (scikit-learn compatible) |
| Summarization | Google Gemini 1.5 Flash → GPT-4o-mini (fallback) |
| Ingestion | feedparser · asyncpraw · Playwright (Chromium) |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS (dark terminal theme) |
| Animation | Framer Motion |
| Maps | react-simple-maps + world-atlas TopoJSON |
| Real-time | WebSockets (native) + Redis pub/sub fan-out |
| ORM | SQLAlchemy 2 (async) |
| Containerization | Docker + Docker Compose |
