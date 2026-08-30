// ─── Domain Types ──────────────────────────────────────────────────────────
//
// This module holds pure TypeScript declarations only. Runtime display maps
// and classification logic live in @/lib/constants and are re-exported here so
// existing `import { ... } from '@/types'` call sites keep working unchanged.

export * from '@/lib/constants'

export interface KeyEntities {
  people:        string[]
  organizations: string[]
  locations:     string[]
}

export interface EventCluster {
  id:              string
  label:           string | null
  bullets:         string[] | null
  entities:        KeyEntities | null
  volatility:      number       // [0, 1]
  sentiment:       number       // [-1, 1]
  member_count:    number
  weighted_score:  number
  first_seen_at:   string | null
  last_updated_at: string | null
  is_active:       boolean
  // UI-only
  isNew?:          boolean
  isUpdated?:      boolean
}

export interface ClusterMember {
  article_id:       string
  source_id:        string
  title:            string
  url:              string | null
  credibility_score: number
  published_at:     string | null
  distance:         number | null
}

export interface RawArticle {
  id:               string
  source_id:        string
  source_type:      string
  title:            string
  url:              string | null
  published_at:     string | null
  ingested_at:      string | null
  credibility_score: number
  is_processed:     boolean
  // Cluster context (populated when article belongs to a cluster)
  cluster_id?:      string | null
  cluster_label?:   string | null
  sentiment?:       number | null
}

export interface DigestStory {
  id:              string
  label:           string
  bullets:         string[]
  entities:        KeyEntities | null
  sentiment:       number
  volatility:      number
  member_count:    number
  weighted_score:  number
  last_updated_at: string | null
}

export interface WatchlistEntity {
  name: string
  type: 'person' | 'org' | 'location' | 'keyword'
}

// ─── WebSocket Message Types ───────────────────────────────────────────────

export type WsMessageType =
  | 'connected'
  | 'heartbeat'
  | 'new_article'
  | 'cluster_update'
  | 'strategy_update'
  | 'breaking'
  | 'alert'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  data?: T
}

export interface WsNewArticleData {
  article_id:       string
  source_id:        string
  title:            string
  url:              string | null
  published_at:     string | null
  credibility_score: number
}

export interface WsClusterUpdateData {
  cluster_id:    string
  label:         string
  bullets:       string[]
  entities:      KeyEntities
  volatility:    number
  sentiment:     number
  member_count:  number
  weighted_score: number
}

export interface WsStrategyUpdateData {
  strategies: MarketStrategy[]
}

// ─── Market Strategies ────────────────────────────────────────────────────

export type AssetClass = 'COMMODITY' | 'EQUITY' | 'FOREX' | 'CRYPTO' | 'BONDS' | 'VOLATILITY'
export type Direction  = 'LONG' | 'SHORT' | 'HEDGE' | 'NEUTRAL'
export type Timeframe  = 'INTRADAY' | 'SHORT' | 'MEDIUM' | 'LONG'
export type RiskLevel  = 'LOW' | 'MODERATE' | 'HIGH' | 'SPECULATIVE'

export interface MarketStrategy {
  id:                  string
  title:               string
  thesis:              string
  rationale:           string[]           // 3 bullet points
  asset_class:         AssetClass
  specific_assets:     string[]           // ["Brent Crude (UKOIL)", ...]
  direction:           Direction
  timeframe:           Timeframe
  risk_level:          RiskLevel
  confidence:          number             // [0, 1]
  volatility_context:  number             // avg vol of source clusters
  sentiment_context:   number             // avg sentiment of source clusters
  source_cluster_ids:  string[]
  related_regions:     string[]
  generated_at:        string | null
  expires_at:          string | null
  is_active:           boolean
  entry_ticker:        string | null
  entry_price:         number | null
  outcome_4h:          number | null
  outcome_24h:         number | null
}

// ─── Market Signals ───────────────────────────────────────────────────────

export type SignalType =
  | 'DEAL'
  | 'INSIDER_BUY'
  | 'INSIDER_SELL'
  | 'ANALYST_UPGRADE'
  | 'ANALYST_DOWNGRADE'
  | 'EARNINGS_BEAT'
  | 'EARNINGS_MISS'
  | 'RUMOR'

export interface MarketSignal {
  id:           string
  signal_type:  SignalType
  ticker:       string | null
  company:      string
  headline:     string
  ai_summary:   string | null
  bullish:      boolean | null
  magnitude:    number | null       // deal size in $B, price target %, etc.
  source_url:   string
  source_name:  string
  published_at: string | null
  expires_at:   string | null
}

// ─── Morning Briefing ─────────────────────────────────────────────────────

export interface MorningBriefing {
  id:           string
  date:         string
  headline:     string
  tldr:         string
  top_events:   Array<{
    title:      string
    summary:    string
    volatility: number
    regions:    string[]
  }>
  trade_setups: Array<{
    direction:  string
    asset:      string
    thesis:     string
    timeframe:  string
  }>
  macro_theme:  string
  generated_at: string | null
}

export interface StrategyPerformance {
  overall: {
    with_4h:  number
    rate_4h:  number | null
    with_24h: number
    rate_24h: number | null
  }
  by_direction: Array<{
    direction: string
    total:     number
    with_4h:   number
    hits_4h:   number
    rate_4h:   number | null
    with_24h:  number
    hits_24h:  number
    rate_24h:  number | null
  }>
}

// ─── UI State ─────────────────────────────────────────────────────────────

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface TickerItem {
  id:         string
  text:       string
  volatility: number
  source:     string
  timestamp:  string
}

// ─── Volatility Tier ──────────────────────────────────────────────────────

export type VolatilityTier =
  | 'calm'
  | 'low'
  | 'moderate'
  | 'elevated'
  | 'high'
  | 'critical'

// ─── Category ─────────────────────────────────────────────────────────────

export type ClusterCategory =
  | 'ALL'
  | 'CONFLICT'
  | 'GEOPOLITICS'
  | 'POLITICS'
  | 'FINANCE'
  | 'CRYPTO'
  | 'BUSINESS'
  | 'TECHNOLOGY'
  | 'CRIME'
  | 'HEALTH'
  | 'CLIMATE'
