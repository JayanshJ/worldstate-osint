# WorldState — Real-Time OSINT Intelligence Dashboard

> A Bloomberg Terminal for geopolitical risk and supply-chain intelligence — at 1/50th the price.

WorldState ingests 20+ global news sources every 2 minutes, clusters articles into events using AI, maps supply-chain exposure for any public company, generates market strategy signals, and streams everything live to a dark-mode React dashboard.

---

## Quick Start

```bash
git clone https://github.com/JayanshG/worldstate-osint.git
cd worldstate-osint
./start.sh
```

The script handles everything: prompts for API keys, auto-generates secrets, builds images, runs database migrations, and starts all services.

**First run:** ~3–5 minutes (image builds)  
**Subsequent starts:** ~20 seconds

Once running:

| | URL |
|---|---|
| **Dashboard** | http://localhost |
| **API Explorer** | http://localhost/docs |
| **Health Check** | http://localhost/health |

---

## What You Need

| Requirement | Where | Cost |
|---|---|---|
| **Docker Desktop** | [docker.com](https://docker.com/products/docker-desktop) | Free |
| **OpenAI API key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$1–3/mo |
| Google Gemini key *(optional)* | [aistudio.google.com](https://aistudio.google.com/app/apikey) | Free |
| Finnhub API key *(optional)* | [finnhub.io/dashboard](https://finnhub.io/dashboard) | Free tier |
| Reddit credentials *(optional)* | [reddit.com/prefs/apps](https://reddit.com/prefs/apps) | Free |

**Minimum to run:** Docker + OpenAI key only.

---

## Features

### Intelligence Feed
- Ingests Reuters, AP, BBC, Al Jazeera, DW, France 24, The Guardian, SCMP, and 15+ more
- Deduplicates by SHA-256 hash (exact) and cosine similarity (semantic near-duplicates)
- HDBSCAN clustering groups related articles into event clusters every 60 seconds
- Gemini 1.5 Flash (GPT-4o-mini fallback) generates headlines, bullets, entities, and sentiment
- Real-time WebSocket stream pushes new clusters and articles to all connected clients

### Supply Chain Intelligence (SPLC)
- Search any public company by ticker or name (backed by SEC EDGAR)
- Maps upstream suppliers, downstream customers, competitors, shareholders, board members, and analysts
- Live enrichment via Finnhub API (industry classification, analyst upgrades/downgrades)
- Interactive force-directed graph with risk-coloured nodes and collision-resolved cluster layout
- Relationship confidence scores, disclosure types (disclosed / estimated / inferred), and country of origin

### Market Strategy Signals
- AI-generated trade signals derived from active intelligence clusters
- Each signal includes: thesis, rationale, asset class, direction, timeframe, risk level, confidence
- Prominent legal disclaimer on every signal — clearly marked NOT FINANCIAL ADVICE
- `GET /api/v1/strategies/methodology` — public endpoint documenting the full signal pipeline for due diligence

### Company Profiles
- Full company profile: description, market cap, P/E, dividend yield, 52-week range, beta
- Institutional shareholders (SEC 13G/13F filings), mutual funds, insider ownership %
- Board of directors with compensation data
- Analyst ratings (buy/hold/sell counts, price targets, recent upgrades/downgrades)

### Commodities & Metals
- Live spot prices: Gold (XAU), Silver (XAG), Platinum (XPT), WTI Crude Oil
- Intraday % change tracking with 60-second background refresh

### World Map
- Countries coloured by news activity (grey → yellow → orange → red)
- Click any country to see active clusters and recent articles filtered to that region

### Alerts
- Create keyword, entity, and volatility threshold watches
- Browser notifications when an alert fires
- Per-organisation alert scoping (multi-tenant)

---

## Authentication & Multi-Tenancy

Every API endpoint requires a JWT bearer token. Each user belongs to an **Organisation** — all data is scoped to the org automatically.

```bash
# Register (auto-creates a personal org)
curl -X POST http://localhost/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'

# Login — returns access_token
curl -X POST http://localhost/auth/login \
  -d "username=you@example.com&password=yourpassword"

# Use the token
curl http://localhost/api/v1/clusters/ \
  -H "Authorization: Bearer <access_token>"
```

The frontend handles login/register automatically — visit http://localhost.

### GDPR
- `DELETE /auth/me` — permanently erases your account, alerts, and organisation (if you were the last member)
- Account Settings modal in the UI includes a two-step deletion confirmation

---

## Admin Panel

Users with `is_admin=true` have access to `/admin/*`:

| Endpoint | Description |
|---|---|
| `GET /admin/orgs` | All organisations with 24h API call counts, user counts, alert counts |
| `GET /admin/usage?days=30` | Daily API call volume per org with average latency |
| `GET /admin/audit` | Paginated audit log — every request logged with user, path, status, latency, IP |
| `POST /admin/users/{id}/toggle-admin` | Promote or demote a user |
| `DELETE /admin/orgs/{id}` | Delete an organisation (cascades) |

The frontend Admin Panel (admin users only) has three tabs: Organisations, Usage (30 days), Audit Log.

---

## Rate Limiting

300 requests per minute per authenticated user (keyed on JWT sub, falls back to IP). Exceeding the limit returns `HTTP 429` with a `Retry-After` header.

---

## Audit Logging

Every API request is recorded in `audit_logs`:
- Organisation, user email, method, path, status code, latency (ms), IP address
- Auto-purged after 90 days
- Queryable via the admin panel or `GET /admin/audit`

---

## Database Backups

A `backup` Docker service runs `pg_dump` every 24 hours automatically.

```bash
# Trigger a manual backup
docker compose exec backup /backup.sh
```

Optional S3 upload — add to `.env`:
```
BACKUP_S3_BUCKET=your-s3-bucket-name
RETENTION_DAYS=7
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      INGESTION LAYER                        │
│                                                             │
│  RSS Worker      Reddit Worker     Playwright Worker        │
│  (20+ sources)   (4 subreddits)    (AFP, custom)            │
│       └──────────────┴──────────────┘                       │
│                        │                                    │
│              Deduplication Engine                           │
│         SHA-256 hash + cosine similarity ANN                │
│                        │                                    │
│               raw_articles (PostgreSQL)                     │
│                        │                                    │
│              Redis Queue: queue:vectorize                   │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   VECTORIZATION LAYER                       │
│         OpenAI text-embedding-3-small (1536-dim)            │
│          article_embeddings + HNSW index (pgvector)         │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    CLUSTERING LAYER                         │
│         HDBSCAN on unclassified embeddings (last 6h)        │
│    New cluster  → create row                                │
│    Existing hit → merge + recompute centroid                │
│    Low-signal clusters expire after 6h                      │
│    All clusters hard-expire after 24h                       │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  INTELLIGENCE LAYER                         │
│    Trigger: weighted_score >= 2.5 (sum of credibility)      │
│    Gemini 1.5 Flash → GPT-4o-mini (fallback)                │
│    Output: headline · 3 bullets · entities · volatility     │
│    Strategy engine: derives trade signals from clusters     │
│    Alert engine: evaluates watches → fires notifications    │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                     API LAYER (FastAPI)                     │
│                                                             │
│  Auth:     POST /auth/register  /auth/login                 │
│  Feed:     GET  /api/v1/clusters/  /feed/  /search/         │
│  SPLC:     GET/POST /api/v1/splc/{ticker}                   │
│  Company:  GET  /api/v1/company/{ticker}                    │
│  Strategy: GET  /api/v1/strategies/                         │
│  Metals:   GET  /api/v1/metals/                             │
│  Alerts:   CRUD /api/v1/alerts/                             │
│  Admin:    GET  /admin/orgs  /audit  /usage                 │
│  WS:       /ws?token=<jwt>                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Description |
|---|---|
| `postgres` | PostgreSQL 16 + pgvector — articles, clusters, embeddings, users, orgs, audit logs |
| `redis` | Message queue + WebSocket fan-out pub/sub |
| `api` | FastAPI — REST + WebSocket, JWT auth, rate limiting, audit middleware |
| `ingestion_worker` | Polls 20+ sources every 2 min, deduplicates, embeds with OpenAI |
| `cluster_worker` | HDBSCAN clustering every 60s, AI summarisation, strategy generation |
| `frontend` | React 18 + Vite dashboard at localhost |
| `backup` | Daily pg_dump with optional S3 upload and 7-day local retention |

---

## Source Credibility Weights

| Tier | Sources | Weight |
|---|---|---|
| T1 Wire | Reuters, AP | 0.95 – 0.97 |
| T2 Major | BBC, DW, Al Jazeera, France 24, The Guardian | 0.80 – 0.88 |
| T3 Regional | AFP, Middle East Eye, Dawn, The Hindu, SCMP | 0.70 – 0.79 |
| T4 Community | r/worldnews, r/geopolitics, r/breakingnews | 0.35 – 0.45 |

---

## Volatility Scale

| Label | Range | Meaning |
|---|---|---|
| CALM | 0.00 – 0.24 | Routine diplomatic / economic |
| LOW | 0.25 – 0.39 | Noteworthy political developments |
| MOD | 0.40 – 0.54 | Protests, sanctions, significant statements |
| ELEV | 0.55 – 0.69 | Armed confrontation, crisis escalation |
| HIGH | 0.70 – 0.84 | Active conflict, major attack |
| CRIT | 0.85 – 1.00 | WMD threat, war declaration, mass casualty |

---

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | — | Embeddings + GPT-4o-mini fallback |
| `JWT_SECRET_KEY` | Yes | auto-generated | JWT signing secret (32-byte hex) |
| `GOOGLE_API_KEY` | No | — | Gemini 1.5 Flash summarisation |
| `FINNHUB_API_KEY` | No | — | SPLC live enrichment (free: 60 req/min) |
| `REDDIT_CLIENT_ID` | No | — | Reddit ingestion |
| `REDDIT_CLIENT_SECRET` | No | — | Reddit ingestion |
| `INGESTION_INTERVAL_SECONDS` | No | `120` | RSS + Reddit poll frequency |
| `CLUSTER_RUN_INTERVAL_SECONDS` | No | `60` | HDBSCAN clustering frequency |
| `CLUSTER_COSINE_THRESHOLD` | No | `0.18` | Max distance to merge into existing cluster |
| `DEDUP_SIMILARITY_THRESHOLD` | No | `0.92` | Cosine threshold for semantic deduplication |
| `BACKUP_S3_BUCKET` | No | — | S3 bucket for offsite backup uploads |

---

## Database Migrations

Schema is managed with Alembic. Migrations run automatically on `./start.sh`.

```bash
# Run manually
docker compose exec api alembic upgrade head

# Create a new migration after model changes
docker compose exec api alembic revision --autogenerate -m "description"
```

| Migration | Description |
|---|---|
| `0001_initial` | Core tables: articles, clusters, embeddings, strategies, alerts, SPLC |
| `0002_organizations` | Multi-tenancy: orgs table, org_id on users and alerts |
| `0003_audit_logs` | Request audit trail with 90-day auto-purge |

---

## Adding News Sources

Edit `backend/app/ingestion/sources.py`:

```python
Source("my_outlet", "My Outlet", SourceType.RSS, 0.82,
       "https://example.com/feed.rss")
```

Add to `RSS_SOURCES` and restart — the worker picks it up automatically.

---

## Running Tests

```bash
docker compose exec api pytest tests/ -v
```

Test coverage: auth flows, cluster CRUD, supply-chain queries, strategy listing, article deduplication.

---

## Troubleshooting

**`Docker is not running`**  
Open Docker Desktop and wait for the whale icon to stop animating.

**`Port 3000 or 8000 already in use`**
```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

**No articles or clusters after 5 minutes**  
Your OpenAI key may have no credits: [platform.openai.com/usage](https://platform.openai.com/usage)

**`ModuleNotFoundError` on API startup after a git pull**  
A new dependency was added — rebuild the image:
```bash
docker compose build api && docker compose up -d api
```

**Dashboard shows connection errors on first load**  
The API takes ~30 seconds to fully start. Wait and refresh.

**Full reset — wipe all data and rebuild**
```bash
docker compose down -v
./start.sh
```

---

## Legal

Strategy signals and market commentary are produced by automated AI systems. They have not been reviewed by licensed financial professionals and have not been backtested against historical market data.

**WorldState is not a registered investment adviser. Nothing on this platform constitutes investment advice.**

- Terms of Service: http://localhost/terms
- Privacy Policy: http://localhost/privacy
- Signal methodology: `GET /api/v1/strategies/methodology`

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI + uvicorn |
| Database | PostgreSQL 16 + pgvector (HNSW index) |
| Cache / Queue | Redis 7 |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) |
| Clustering | HDBSCAN |
| Summarisation | Google Gemini 1.5 Flash → GPT-4o-mini (fallback) |
| Financial data | Finnhub API + SEC EDGAR |
| Commodities | gold-api.com |
| Auth | JWT (python-jose) + bcrypt |
| Rate limiting | slowapi (300 req/min per user) |
| Migrations | Alembic (async) |
| Ingestion | feedparser · asyncpraw · Playwright |
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| Animation | Framer Motion |
| Maps | react-simple-maps |
| Graphs | D3 force simulation |
| Real-time | WebSocket + Redis pub/sub fan-out |
| ORM | SQLAlchemy 2 (async) |
| Containers | Docker + Docker Compose |
