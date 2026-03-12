import type { EventCluster, MarketStrategy, RawArticle } from '@/types'

const BASE = '/api/v1'

async function req<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

async function patchReq<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'PATCH' })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
}

export const api = {
  clusters: {
    list: (opts?: { limit?: number; activeOnly?: boolean; minVolatility?: number }) =>
      req<EventCluster[]>(`${BASE}/clusters/`, {
        limit:          opts?.limit          ?? 50,
        active_only:    opts?.activeOnly      ?? true,
        min_volatility: opts?.minVolatility   ?? 0,
      }),
    get: (id: string) =>
      req<EventCluster & { members: ClusterMemberDetail[] }>(`${BASE}/clusters/${id}`),
  },

  feed: {
    list: (opts?: { limit?: number; sourceType?: string; minCredibility?: number }) =>
      req<RawArticle[]>(`${BASE}/feed/`, {
        limit:           opts?.limit           ?? 100,
        ...(opts?.sourceType     ? { source_type:     opts.sourceType }    : {}),
        ...(opts?.minCredibility ? { min_credibility: opts.minCredibility } : {}),
      }),
  },

  search: {
    query: (q: string, mode: 'keyword' | 'semantic' = 'keyword', limit = 20) =>
      req<SearchResponse>(`${BASE}/search/`, { q, mode, limit }),
  },

  alerts: {
    list:   ()                        => req<AlertWatch[]>(`${BASE}/alerts/`),
    create: (w: AlertWatchCreate)     => post<AlertWatch>(`${BASE}/alerts/`, w),
    toggle: (id: string)              => patchReq<AlertWatch>(`${BASE}/alerts/${id}/toggle`),
    delete: (id: string)              => del(`${BASE}/alerts/${id}`),
    firings: (id: string, limit = 10) => req<AlertFiring[]>(`${BASE}/alerts/${id}/firings`, { limit }),
  },

  stats: {
    get: () => req<SystemStats>(`${BASE}/stats/`),
  },

  strategies: {
    list:    ()  => req<MarketStrategy[]>(`${BASE}/strategies/`),
    refresh: ()  => post<{ generated: number; ok: boolean }>(`${BASE}/strategies/refresh`, {}),
  },

  splc: {
    list:    ()             => req<SCCompany[]>(`${BASE}/splc/`),
    search:  (q: string)   => req<SCSearchResult[]>(`${BASE}/splc/search`, { q }),
    get:     (ticker: string) =>
      req<{ company: SCCompany; edges: SCEdge[] }>(`${BASE}/splc/${ticker}`),
    analyse: (ticker: string) =>
      post<{ status: string; company: SCCompany; edges_created: number }>(`${BASE}/splc/${ticker}`, {}),
    remove:  (ticker: string) => del(`${BASE}/splc/${ticker}`),
    graph:   (ticker: string) =>
      req<{ nodes: SCNode[]; links: SCLink[]; company: SCCompany }>(`${BASE}/splc/${ticker}/graph`),
  },
}

// ─── Extra types ───────────────────────────────────────────────────────────

export interface ClusterMemberDetail {
  article_id:        string
  source_id:         string
  title:             string
  url:               string | null
  credibility_score: number
  published_at:      string | null
  distance:          number | null
}

export interface ArticleHit {
  article_id:         string
  source_id:          string
  title:              string
  url:                string | null
  published_at:       string | null
  credibility_score:  number
  score:              number
  cluster_id:         string | null
  cluster_label:      string | null
  cluster_volatility: number | null
}

export interface ClusterHit {
  cluster_id:   string
  label:        string | null
  bullets:      string[] | null
  volatility:   number
  sentiment:    number
  member_count: number
  score:        number
}

export interface SearchResponse {
  query:        string
  mode:         string
  article_hits: ArticleHit[]
  cluster_hits: ClusterHit[]
  total:        number
}

export interface AlertWatch {
  id:             string
  name:           string
  keywords:       string[] | null
  entities:       string[] | null
  source_ids:     string[] | null
  min_volatility: number
  min_sources:    number
  is_active:      boolean
  created_at:     string | null
  last_fired_at:  string | null
  fire_count:     number
  channel:        string
}

export interface AlertWatchCreate {
  name:            string
  keywords?:       string[]
  entities?:       string[]
  source_ids?:     string[]
  min_volatility?: number
  min_sources?:    number
  channel?:        string
}

export interface AlertFiring {
  id:         string
  cluster_id: string
  fired_at:   string
  payload:    Record<string, unknown>
}

export interface SCSearchResult {
  ticker: string
  name:   string
  cik:    string
}

export interface SCCompany {
  id:               string
  ticker:           string
  legal_name:       string | null
  sector:           string | null
  sic_code:         string | null
  hq_country:       string | null
  last_filing_date: string | null
}

export interface SCEdge {
  id:                string
  entity_name:       string
  entity_ticker:     string | null
  direction:         'UPSTREAM' | 'DOWNSTREAM' | 'COMPETITOR'
  relationship_type: string | null
  tier:              number | null
  pct_revenue:       number | null
  pct_cogs:          number | null
  sole_source:       boolean
  disclosure_type:   'DISCLOSED' | 'ESTIMATED' | 'INFERRED' | null
  confidence:        number | null
  evidence:          string | null
  hq_country:        string | null
  as_of_date:        string | null
}

export interface SCNode {
  id:              string
  label:           string
  type:            string
  tier:            number | null
  hq_country:      string | null
  exposure:        number
  sole_source:     boolean
  disclosure_type: string | null
  confidence:      number
  risk:            'HIGH' | 'MEDIUM' | 'LOW'
  sector:          string | null
}

export interface SCLink {
  source:            string
  target:            string
  direction:         string
  relationship_type: string | null
  pct_revenue:       number | null
  pct_cogs:          number | null
  evidence:          string | null
}

export interface SystemStats {
  articles: {
    last_1h:     number
    last_24h:    number
    per_minute:  number
    total:       number
    queue_depth: number
  }
  clusters: {
    critical: number
    high:     number
    elevated: number
    moderate: number
    calm:     number
    total:    number
  }
  source_health: Array<{ source_id: string; count_1h: number }>
}
