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
  | 'CRYPTO'
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
  CRYPTO:      'Crypto',
  BUSINESS:    'Business',
  TECHNOLOGY:  'Technology',
  CRIME:       'Crime',
  HEALTH:      'Health',
  CLIMATE:     'Climate',
}

const CATEGORY_KEYWORDS: [ClusterCategory, string[]][] = [
  // ── Checked first: high-specificity hard signals ──
  ['CONFLICT',    ['missile', 'airstrike', 'bombing', 'bombed', 'troops', 'military offensive',
                   'invasion', 'warhead', 'casualties', 'killed in', 'combat', 'drone strike',
                   'nuclear weapon', 'armed conflict', 'battalion', 'frontline',
                   'explosion', 'blast', 'gunfire', 'hostage', 'siege', 'war crime',
                   'shelling', 'rocket attack', 'ground forces', 'ceasefire']],

  ['TECHNOLOGY',  [
                   // Company names
                   'apple', 'google', 'alphabet', 'meta ', 'nvidia', 'microsoft', 'amazon',
                   'tesla', 'samsung', 'intel', 'amd', 'qualcomm', 'tsmc', 'openai',
                   'anthropic', 'deepmind', 'spacex', 'palantir', 'snowflake', 'salesforce',
                   'oracle', 'ibm', 'cisco', 'netflix', 'spotify', 'uber', 'airbnb',
                   // Topics
                   'artificial intelligence', ' ai ', 'machine learning', 'deep learning',
                   'large language model', 'llm', 'chatgpt', 'generative ai',
                   'cybersecurity', 'hacker', 'data breach', 'ransomware', 'malware',
                   'semiconductor', 'chip', 'silicon valley', 'cloud computing',
                   'automation', 'satellite launch', 'space launch', 'spacecraft',
                   'software', 'hardware', 'startup', 'tech company', 'venture capital',
                   'app store', 'smartphone', 'iphone', 'android', 'quantum computing',
                   'blockchain', 'cryptocurrency exchange', 'nft', 'robotics',
                   'autonomous vehicle', 'electric vehicle battery', 'fintech',
                   'data center', 'algorithm', 'open source', 'developer',
                   'tech layoff', 'tech giant', 'big tech', 'silicon']],

  ['BUSINESS',    ['merger', 'acquisition', 'takeover', 'buyout', 'ipo ', 'initial public offering',
                   'ceo ', 'chief executive', 'quarterly earnings', 'quarterly results',
                   'revenue growth', 'profit margin', 'supply chain', 'layoff', 'redundan',
                   'bankrupt', 'chapter 11', 'private equity', 'venture fund',
                   'valuation', 'unicorn', 'spinoff', 'joint venture', 'deal closed',
                   'shareholders', 'board of directors', 'activist investor',
                   'antitrust', 'monopoly', 'ftc', 'sec charges', 'market share']],

  ['CRYPTO',      [
                   // Coins & tokens
                   'bitcoin', 'btc ', ' btc', 'ethereum', ' eth ', 'solana', ' sol ',
                   'binance', 'bnb', 'xrp', 'cardano', 'avalanche', 'polkadot', 'dogecoin',
                   'shiba inu', 'litecoin', 'chainlink', 'uniswap', 'aave', 'compound',
                   'stablecoin', 'usdt', 'usdc', 'tether', 'dai',
                   // Topics
                   'crypto', 'cryptocurrency', 'blockchain', 'defi', 'decentralized finance',
                   'web3', 'nft', 'token', 'altcoin', 'memecoin', 'satoshi',
                   'mining rig', 'proof of stake', 'proof of work', 'smart contract',
                   'wallet hack', 'exchange hack', 'rug pull', 'protocol exploit',
                   'coinbase', 'binance exchange', 'kraken', 'ftx', 'bybit',
                   'crypto regulation', 'sec crypto', 'etf bitcoin', 'spot etf',
                   'crypto market', 'bull run', 'bear market crypto',
                   'layer 2', 'layer2', 'rollup', 'lightning network',
                   'vitalik', 'satoshi nakamoto', 'hal finney']],

  ['FINANCE',     ['stock market', 'stock price', 'shares fell', 'shares rose', 'bond yield',
                   'interest rate', 'inflation rate', 'gdp growth', 'trade deficit',
                   'forex', 'currency devaluation', 'dollar index',
                   'dividend', 'hedge fund', 'market crash', 'recession',
                   'federal reserve', 'central bank', 'imf', 'world bank', 'debt ceiling',
                   'fiscal policy', 'tariff', 'oil price', 'crude oil', 'commodity prices',
                   'nasdaq', 's&p 500', 'wall street', 'dow jones', 'treasury',
                   'rate hike', 'rate cut', 'quantitative easing', 'bank run']],

  ['GEOPOLITICS', ['sanction', 'diplomatic', 'embassy', 'nato', 'united nations', 'treaty',
                   'alliance', 'bilateral summit', 'geopolit', 'g7', 'g20', 'brics',
                   'security council', 'sovereignty', 'foreign minister', 'state department',
                   'ambassador', 'expel', 'envoy', 'peace talks', 'trade war',
                   'nuclear deal', 'arms deal', 'foreign policy']],

  ['POLITICS',    ['election', 'president ', 'parliament', 'prime minister', 'senate',
                   'congress', 'legislation', 'referendum', 'chancellor',
                   'democrat', 'republican', 'political party', 'campaign trail',
                   'inauguration', 'impeach', 'cabinet reshuffle', 'administration',
                   'white house', 'kremlin', 'downing street', 'polling', 'ballot']],

  ['HEALTH',      ['pandemic', 'virus', 'disease outbreak', 'hospital', 'vaccine',
                   'epidemic', 'world health organization', 'treatment', 'pharmaceutical',
                   'cancer', 'pathogen', 'mortality rate', 'public health', 'clinical trial',
                   'drug approval', 'fda', 'who ', 'infection', 'mental health']],

  ['CRIME',       ['arrested', 'murder', 'convict', 'sentenced', 'trafficking',
                   'fraud', 'corruption', 'indicted', 'prison', 'cartel', 'gang',
                   'smuggling', 'terrorism', 'terrorist attack', 'extremist',
                   'assassination', 'kidnap', 'cybercrime', 'money laundering']],

  ['CLIMATE',     ['climate change', 'environment', 'emission', 'carbon neutral',
                   'pollution', 'wildfire', 'flood', 'drought', 'renewable energy',
                   'solar power', 'deforestation', 'glacier', 'sea level',
                   'paris agreement', 'methane', 'net zero', 'fossil fuel', 'green energy']],
]

export function categorizeCluster(cluster: EventCluster): ClusterCategory {
  const text = [
    cluster.label ?? '',
    ...(cluster.bullets ?? []),
    ...(cluster.entities?.organizations ?? []),
    ...(cluster.entities?.people ?? []),
  ].join(' ').toLowerCase()

  for (const [cat, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => text.includes(kw))) return cat
  }
  // Default: GEOPOLITICS is a safer fallback than POLITICS for unlabelled world news
  return 'GEOPOLITICS'
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
  // Finance / Business / Markets
  ft_world:         'FT',
  ft_markets:       'FT',
  wsj_world:        'WSJ',
  wsj_markets:      'WSJ',
  wsj_business:     'WSJ',
  bloomberg_intl:   'BBG',
  bloomberg_tech:   'BBG TECH',
  bloomberg_biz:    'BBG BIZ',
  reuters_biz:      'REUTERS',
  reuters_tech:     'REUTERS',
  reuters_mkts:     'REUTERS',
  cnbc_top:         'CNBC',
  cnbc_finance:     'CNBC',
  cnbc_tech:        'CNBC TECH',
  marketwatch:      'MKT WATCH',
  seekingalpha:     'SEEK ALPHA',
  investopedia:     'INVESTOP',
  fortune:          'FORTUNE',
  business_insider: 'BI',
  yahoo_finance:    'YAHOO FIN',
  economist:        'ECONOMIST',
  // Technology
  techcrunch:       'TECHCRUNCH',
  theverge:         'THE VERGE',
  arstechnica:      'ARS TECH',
  wired:            'WIRED',
  hackernews:       'HN',
  mit_tech:         'MIT TECH',
  venturebeat:      'VBEAT',
  zdnet:            'ZDNET',
  infoq:            'INFOQ',
  // Reddit — geo/world
  reddit_worldnews:   'r/worldnews',
  reddit_breaking:    'r/breakingnews',
  reddit_geopolit:    'r/geopolitics',
  reddit_iran:        'r/iran',
  reddit_middleeast:  'r/MiddleEast',
  reddit_ukrnews:     'r/ukraine',
  reddit_europe:      'r/europe',
  reddit_china:       'r/China',
  reddit_india:       'r/india',
  reddit_latam:       'r/LatinAmerica',
  reddit_africa:      'r/Africa',
  // Reddit — finance / investing
  reddit_investing:   'r/investing',
  reddit_stocks:      'r/stocks',
  reddit_finance:     'r/finance',
  reddit_economics:   'r/economics',
  reddit_wsb:         'r/wsb',
  reddit_secanalysis: 'r/SecAnalysis',
  reddit_valueinvest: 'r/ValueInvest',
  reddit_personalfin: 'r/personalfin',
  // Reddit — technology
  reddit_technology:  'r/technology',
  reddit_tech:        'r/tech',
  reddit_programming: 'r/programming',
  reddit_ai:          'r/artificial',
  reddit_machlearn:   'r/ML',
  reddit_cybersec:    'r/cybersecurity',
  reddit_netsec:      'r/netsec',
  // Reddit — business
  reddit_business:    'r/business',
  reddit_entrepreneur:'r/Entrepreneur',
  reddit_startups:    'r/startups',
  // Reddit — crypto
  reddit_bitcoin:     'r/Bitcoin',
  reddit_ethereum:    'r/ethereum',
  reddit_crypto:      'r/CryptoCurrency',
  reddit_defi:        'r/defi',
  reddit_cryptomkts:  'r/CryptoMarkets',
  reddit_solana:      'r/solana',
  reddit_web3:        'r/web3',
  // Crypto RSS
  coindesk:           'COINDESK',
  cointelegraph:      'CT',
  decrypt:            'DECRYPT',
  theblock:           'THE BLOCK',
  blockworks:         'BLOCKWORKS',
  bitcoinmagazine:    'BTC MAG',
  cryptoslate:        'CSLATE',
  cryptonews:         'CNEWS',
  dlnews:             'DL NEWS',
  // Twitter/X — wire & finance
  tw_wsj:             'WSJ',
  tw_ft:              'FT',
  tw_bloomberg:       'BBG',
  tw_cnbc:            'CNBC',
  tw_reuters_biz:     'REUTERS',
  tw_zerohedge:       'ZH',
  tw_raoul_pal:       'RAOUL PAL',
  tw_elerianm:        'EL-ERIAN',
  tw_nfergus:         'N.FERGUSON',
  tw_abnormalret:     'ABNRML RET',
  tw_jesse_livermore: 'J.LIVERMR',
  tw_markets_live:    'BBG LIVE',
  tw_lisaabramowicz:  'L.ABRAM',
  tw_tracyalloway:    'TRACY A.',
  // Twitter/X — crypto alpha
  tw_coindesk:        'COINDESK',
  tw_cointelegraph:   'CT',
  tw_theblock:        'THE BLOCK',
  tw_vitalik:         'VITALIK',
  tw_saylor:          'SAYLOR',
  tw_cz_binance:      'CZ',
  tw_aantonop:        'ANTONOP',
  tw_wuBlockchain:    'WU CHAIN',
  tw_tier10k:         'TIER10K',
  tw_pentosh1:        'PENTOSHI',
  // Twitter/X — tech alpha
  tw_sama:            'SAM ALTMAN',
  tw_ylecun:          'YANN LECUN',
  tw_karpathy:        'KARPATHY',
  tw_elonmusk:        'ELON',
  tw_paulg:           'PAUL GRAHAM',
  tw_benedictevans:   'B.EVANS',
  tw_stratechery:     'STRATECHERY',
  tw_avc:             'FRED WILSON',
  tw_techcrunch:      'TECHCRUNCH',
  tw_verge:           'THE VERGE',
}

export function getSourceLabel(sourceId: string): string {
  return SOURCE_LABELS[sourceId] ?? sourceId.toUpperCase().slice(0, 8)
}
