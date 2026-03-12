// ─── Domain Types ──────────────────────────────────────────────────────────

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
}

// ─── WebSocket Message Types ───────────────────────────────────────────────

export type WsMessageType =
  | 'connected'
  | 'heartbeat'
  | 'new_article'
  | 'cluster_update'
  | 'strategy_update'
  | 'breaking'

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
}

export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  COMMODITY:  '#f97316',   // orange
  EQUITY:     '#3b82f6',   // blue
  FOREX:      '#8b5cf6',   // violet
  CRYPTO:     '#ec4899',   // pink
  BONDS:      '#14b8a6',   // teal
  VOLATILITY: '#ef4444',   // red
}

export const ASSET_CLASS_BG: Record<AssetClass, string> = {
  COMMODITY:  'rgba(249,115,22,0.12)',
  EQUITY:     'rgba(59,130,246,0.12)',
  FOREX:      'rgba(139,92,246,0.12)',
  CRYPTO:     'rgba(236,72,153,0.12)',
  BONDS:      'rgba(20,184,166,0.12)',
  VOLATILITY: 'rgba(239,68,68,0.12)',
}

export const DIRECTION_COLORS: Record<Direction, string> = {
  LONG:    '#22c55e',
  SHORT:   '#ef4444',
  HEDGE:   '#f59e0b',
  NEUTRAL: '#6b7280',
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW:         '#22c55e',
  MODERATE:    '#eab308',
  HIGH:        '#f97316',
  SPECULATIVE: '#ef4444',
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

export function getVolatilityTier(v: number): VolatilityTier {
  if (v < 0.25)  return 'calm'
  if (v < 0.40)  return 'low'
  if (v < 0.55)  return 'moderate'
  if (v < 0.70)  return 'elevated'
  if (v < 0.85)  return 'high'
  return 'critical'
}

export const VOLATILITY_COLORS: Record<VolatilityTier, string> = {
  calm:     '#22c55e',
  low:      '#84cc16',
  moderate: '#eab308',
  elevated: '#f97316',
  high:     '#ef4444',
  critical: '#dc2626',
}

export const VOLATILITY_BG: Record<VolatilityTier, string> = {
  calm:     'rgba(34,197,94,0.08)',
  low:      'rgba(132,204,22,0.08)',
  moderate: 'rgba(234,179,8,0.10)',
  elevated: 'rgba(249,115,22,0.12)',
  high:     'rgba(239,68,68,0.14)',
  critical: 'rgba(220,38,38,0.18)',
}

export const VOLATILITY_LABELS: Record<VolatilityTier, string> = {
  calm:     'CALM',
  low:      'LOW',
  moderate: 'MOD',
  elevated: 'ELEV',
  high:     'HIGH',
  critical: 'CRIT',
}

// ─── Category ─────────────────────────────────────────────────────────────

export type ClusterCategory =
  | 'ALL'
  | 'CONFLICT'
  | 'GEOPOLITICS'
  | 'POLITICS'
  | 'FINANCE'
  | 'BUSINESS'
  | 'TECHNOLOGY'
  | 'CRIME'
  | 'HEALTH'
  | 'CLIMATE'

export const CATEGORY_LABELS: Record<ClusterCategory, string> = {
  ALL:         'All',
  CONFLICT:    'Conflict',
  GEOPOLITICS: 'Geopolitics',
  POLITICS:    'Politics',
  FINANCE:     'Finance',
  BUSINESS:    'Business',
  TECHNOLOGY:  'Technology',
  CRIME:       'Crime',
  HEALTH:      'Health',
  CLIMATE:     'Climate',
}

const CATEGORY_KEYWORDS: [ClusterCategory, string[]][] = [
  ['CONFLICT',    ['missile', 'airstrike', 'bombing', 'bombed', 'troops', 'military', 'ceasefire',
                   'invasion', 'war ', 'warhead', 'casualties', 'killed', 'combat', 'drone strike',
                   'nuclear', 'weapon', 'armed conflict', 'offensive', 'battalion',
                   'explosion', 'blast', 'gunfire', 'hostage', 'siege', 'frontline']],
  ['FINANCE',     ['stock', 'shares', 'bond', 'interest rate', 'inflation', 'gdp', 'trade deficit',
                   'currency', 'dollar', 'euro', 'yen', 'forex', 'crypto', 'bitcoin', 'ethereum',
                   'ipo', 'earnings', 'dividend', 'hedge fund', 'market crash', 'recession',
                   'central bank', 'federal reserve', 'imf', 'world bank', 'debt', 'fiscal',
                   'tariff', 'oil price', 'commodity', 'nasdaq', 'wall street']],
  ['GEOPOLITICS', ['sanction', 'diplomatic', 'embassy', 'nato', 'united nations', 'treaty',
                   'alliance', 'summit', 'bilateral', 'geopolit', 'g7', 'g20', 'brics',
                   'security council', 'sovereignty', 'foreign minister', 'state department',
                   'ambassador', 'expel', 'envoy', 'negotiation', 'peace talks']],
  ['POLITICS',    ['election', 'president', 'parliament', 'minister', 'senate', 'congress',
                   'legislation', 'vote', 'referendum', 'prime minister', 'chancellor',
                   'democrat', 'republican', 'political party', 'campaign', 'inauguration',
                   'impeach', 'cabinet', 'administration', 'white house', 'kremlin']],
  ['TECHNOLOGY',  ['artificial intelligence', 'cybersecurity', 'hacker', 'data breach',
                   'semiconductor', 'silicon valley', 'cloud computing', 'automation',
                   'satellite', 'space launch', 'openai', 'microsoft', 'amazon web']],
  ['BUSINESS',    ['company', 'corporation', 'merger', 'acquisition', 'ceo', 'quarterly', 'revenue',
                   'profit', 'supply chain', 'layoff', 'bankrupt', 'investor', 'valuation']],
  ['HEALTH',      ['pandemic', 'virus', 'disease', 'hospital', 'vaccine', 'outbreak', 'epidemic',
                   'world health', 'treatment', 'pharmaceutical', 'cancer',
                   'pathogen', 'mortality', 'public health', 'clinical trial']],
  ['CRIME',       ['arrested', 'murder', 'convict', 'sentenced', 'trafficking', 'fraud',
                   'corruption', 'indicted', 'prison', 'cartel', 'gang', 'smuggling',
                   'terrorism', 'terrorist', 'extremist', 'assassination', 'kidnap']],
  ['CLIMATE',     ['climate', 'environment', 'emission', 'carbon', 'pollution', 'wildfire',
                   'flood', 'drought', 'renewable', 'solar', 'deforestation',
                   'glacier', 'sea level', 'paris agreement', 'methane']],
]

export function categorizeCluster(cluster: EventCluster): ClusterCategory {
  const text = [
    cluster.label ?? '',
    ...(cluster.bullets ?? []),
    ...(cluster.entities?.locations ?? []),
    ...(cluster.entities?.organizations ?? []),
  ].join(' ').toLowerCase()

  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => text.includes(kw))) return cat
  }
  return 'POLITICS'
}

// ─── Source metadata ──────────────────────────────────────────────────────

export const SOURCE_LABELS: Record<string, string> = {
  // Wire services / aggregators
  yahoo_world:      'YAHOO',
  abc_news_intl:    'ABC NEWS',
  afp_live:         'AFP',
  // Western outlets
  bbc_world:        'BBC',
  guardian_world:   'GUARDIAN',
  france24:         'F24',
  dw_news:          'DW',
  sky_news:         'SKY',
  npr_world:        'NPR',
  // Middle East
  aljazeera:        'AJE',
  times_of_israel:  'TOI',
  iran_intl:        'IRAN INTL',
  middle_east_eye:  'MEE',
  // Russia / Eastern Europe
  moscow_times:     'MOSCOW TIMES',
  // Asia / Pacific
  scmp_world:       'SCMP',
  nhk_world:        'NHK',
  cna_world:        'CNA',
  abc_au:           'ABC AU',
  // South Asia
  dawn_pk:          'DAWN',
  the_hindu:        'THE HINDU',
  // Africa
  allafrica:        'ALLAFRICA',
  mail_guardian:    'M&G',
  // Latin America
  mercopress:       'MERCOPRESS',
  rio_times:        'RIO TIMES',
  // Finance
  ft_world:         'FT',
  wsj_world:        'WSJ',
  bloomberg_intl:   'BBG',
  // Reddit
  reddit_worldnews:  'REDDIT',
  reddit_breaking:   'REDDIT',
  reddit_geopolit:   'REDDIT',
  reddit_iran:       'REDDIT',
  reddit_middleeast: 'REDDIT',
  reddit_ukrnews:    'REDDIT',
  reddit_europe:     'REDDIT',
  reddit_china:      'REDDIT',
  reddit_india:      'REDDIT',
  reddit_latam:      'REDDIT',
  reddit_africa:     'REDDIT',
}

export function getSourceLabel(sourceId: string): string {
  return SOURCE_LABELS[sourceId] ?? sourceId.toUpperCase().slice(0, 8)
}
