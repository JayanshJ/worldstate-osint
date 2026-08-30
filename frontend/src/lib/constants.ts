// Runtime display maps + classification logic.
//
// Physically separated from types/index.ts so that the type module is pure
// declarations (no runtime cost, no circular-import risk with UI helpers).
// types/index.ts re-exports everything here, so existing `from '@/types'`
// imports keep working unchanged.

import type {
  AssetClass,
  ClusterCategory,
  Direction,
  EventCluster,
  RiskLevel,
  SignalType,
  VolatilityTier,
} from '@/types'

// ─── Strategy palette ──────────────────────────────────────────────────────

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

// ─── Signal metadata ───────────────────────────────────────────────────────

export const SIGNAL_META: Record<SignalType, { label: string; color: string; icon: string }> = {
  DEAL:               { label: 'M&A Deal',         color: '#3b82f6', icon: '🤝' },
  INSIDER_BUY:        { label: 'Insider Buy',       color: '#22c55e', icon: '📈' },
  INSIDER_SELL:       { label: 'Insider Sell',      color: '#ef4444', icon: '📉' },
  ANALYST_UPGRADE:    { label: 'Analyst Upgrade',   color: '#10b981', icon: '⬆' },
  ANALYST_DOWNGRADE:  { label: 'Analyst Downgrade', color: '#f97316', icon: '⬇' },
  EARNINGS_BEAT:      { label: 'Earnings Beat',     color: '#22c55e', icon: '✓' },
  EARNINGS_MISS:      { label: 'Earnings Miss',     color: '#ef4444', icon: '✗' },
  RUMOR:              { label: 'Rumor / Report',    color: '#8b5cf6', icon: '◈' },
}

// ─── Volatility tier ───────────────────────────────────────────────────────

export function getVolatilityTier(v: number): VolatilityTier {
  if (v < 0.25)  return 'calm'
  if (v < 0.40)  return 'low'
  if (v < 0.55)  return 'moderate'
  if (v < 0.70)  return 'elevated'
  if (v < 0.85)  return 'high'
  return 'critical'
}

// A warm-spectrum volatility palette
export const VOLATILITY_COLORS: Record<VolatilityTier, string> = {
  calm:     '#7bb875',   // muted green
  low:      '#a8b856',   // yellow-green
  moderate: '#c9a95a',   // warm amber
  elevated: '#d88a4a',   // amber-orange
  high:     '#d6604c',   // warm red-orange
  critical: '#d64747',   // red
}

export const VOLATILITY_BG: Record<VolatilityTier, string> = {
  calm:     'rgba(111,191,106,0.11)',
  low:      'rgba(184,204,90,0.11)',
  moderate: 'rgba(212,179,90,0.13)',
  elevated: 'rgba(224,138,74,0.13)',
  high:     'rgba(214,96,76,0.15)',
  critical: 'rgba(214,71,71,0.17)',
}

export const VOLATILITY_LABELS: Record<VolatilityTier, string> = {
  calm:     'CALM',
  low:      'LOW',
  moderate: 'MOD',
  elevated: 'ELEV',
  high:     'HIGH',
  critical: 'CRIT',
}

// ─── Cluster category labels + classifier ──────────────────────────────────

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

// Keywords are grouped by priority: high-specificity terms (score 3),
// medium (score 2), broad (score 1). This prevents "apple stock price"
// from matching TECHNOLOGY before FINANCE.

interface CategoryRule {
  category: ClusterCategory
  terms: { kw: string; weight: number; boundary?: boolean }[]
}

// boundary: true means the keyword must appear as a standalone word
// (surrounded by spaces, punctuation, or string start/end), not as a
// substring of a larger word. This prevents " eth" matching "wealth",
// " sol" matching "solution", " btc" matching random text, etc.

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'CONFLICT',
    terms: [
      { kw: 'missile', weight: 3 }, { kw: 'airstrike', weight: 3 },
      { kw: 'bombing', weight: 3 }, { kw: 'bombed', weight: 3 },
      { kw: 'drone strike', weight: 3 }, { kw: 'warhead', weight: 3 },
      { kw: 'nuclear weapon', weight: 3 }, { kw: 'armed conflict', weight: 3 },
      { kw: 'war crime', weight: 3 }, { kw: 'ground forces', weight: 3 },
      { kw: 'rocket attack', weight: 3 }, { kw: 'ceasefire', weight: 3 },
      { kw: 'frontline', weight: 3 }, { kw: 'battalion', weight: 3 },
      { kw: 'troops', weight: 2 }, { kw: 'military offensive', weight: 2 },
      { kw: 'invasion', weight: 2 }, { kw: 'casualties', weight: 2 },
      { kw: 'killed in', weight: 2 }, { kw: 'combat', weight: 2 },
      { kw: 'shelling', weight: 2 }, { kw: 'explosion', weight: 2 },
      { kw: 'blast', weight: 2 }, { kw: 'gunfire', weight: 2 },
      { kw: 'hostage', weight: 2 }, { kw: 'siege', weight: 2 },
    ],
  },
  {
    category: 'CRYPTO',
    terms: [
      // High-specificity (score 3) — crypto-exclusive, no ambiguity
      { kw: 'bitcoin', weight: 3 }, { kw: 'ethereum', weight: 3 },
      { kw: 'cryptocurrency', weight: 3 }, { kw: 'blockchain', weight: 3 },
      { kw: 'defi', weight: 3, boundary: true }, { kw: 'decentralized finance', weight: 3 },
      { kw: 'web3', weight: 3, boundary: true }, { kw: 'altcoin', weight: 3 },
      { kw: 'memecoin', weight: 3 }, { kw: 'rug pull', weight: 3 },
      { kw: 'protocol exploit', weight: 3 }, { kw: 'proof of stake', weight: 3 },
      { kw: 'proof of work', weight: 3 }, { kw: 'smart contract', weight: 3 },
      { kw: 'spot etf', weight: 3 }, { kw: 'layer 2', weight: 3 },
      { kw: 'layer2', weight: 3, boundary: true }, { kw: 'rollup', weight: 3, boundary: true },
      { kw: 'solana', weight: 3 }, { kw: 'dogecoin', weight: 3 },
      { kw: 'stablecoin', weight: 3 }, { kw: 'binance', weight: 3 },
      { kw: 'coinbase', weight: 3 }, { kw: 'sec crypto', weight: 3 },
      { kw: 'crypto regulation', weight: 3 },
      // Medium (score 2) — coins/tokens, all require word boundaries
      { kw: 'btc', weight: 2, boundary: true }, { kw: 'eth', weight: 2, boundary: true },
      { kw: 'sol', weight: 2, boundary: true }, { kw: 'xrp', weight: 2, boundary: true },
      { kw: 'cardano', weight: 2 }, { kw: 'avalanche', weight: 2, boundary: true },
      { kw: 'polkadot', weight: 2 }, { kw: 'shiba inu', weight: 2 },
      { kw: 'litecoin', weight: 2 }, { kw: 'chainlink', weight: 2, boundary: true },
      { kw: 'uniswap', weight: 2 }, { kw: 'aave', weight: 2, boundary: true },
      { kw: 'compound', weight: 2, boundary: true }, { kw: 'usdt', weight: 2, boundary: true },
      { kw: 'usdc', weight: 2, boundary: true }, { kw: 'tether', weight: 2, boundary: true },
      { kw: 'nft', weight: 2, boundary: true },
      { kw: 'crypto market', weight: 2 }, { kw: 'crypto', weight: 2 },
      { kw: 'satoshi', weight: 2 }, { kw: 'vitalik', weight: 2 },
      { kw: 'mining rig', weight: 2 }, { kw: 'wallet hack', weight: 2 },
      { kw: 'exchange hack', weight: 2 },
    ],
  },
  {
    category: 'TECHNOLOGY',
    terms: [
      { kw: 'artificial intelligence', weight: 3 }, { kw: 'machine learning', weight: 3 },
      { kw: 'deep learning', weight: 3 }, { kw: 'large language model', weight: 3 },
      { kw: 'llm', weight: 3, boundary: true }, { kw: 'chatgpt', weight: 3 },
      { kw: 'generative ai', weight: 3 }, { kw: 'openai', weight: 3 },
      { kw: 'anthropic', weight: 3 }, { kw: 'deepmind', weight: 3 },
      { kw: 'quantum computing', weight: 3 }, { kw: 'semiconductor', weight: 3 },
      { kw: 'cybersecurity', weight: 3 }, { kw: 'ransomware', weight: 3 },
      { kw: 'data breach', weight: 3 }, { kw: 'autonomous vehicle', weight: 3 },
      { kw: 'robotics', weight: 3 }, { kw: 'spacex', weight: 3 },
      { kw: 'satellite launch', weight: 3 }, { kw: 'space launch', weight: 3 },
      { kw: 'spacecraft', weight: 3 }, { kw: 'tsmc', weight: 3, boundary: true },
      { kw: 'palantir', weight: 3 },
      { kw: 'apple', weight: 2 }, { kw: 'google', weight: 2 },
      { kw: 'alphabet', weight: 2, boundary: true }, { kw: 'nvidia', weight: 2 },
      { kw: 'microsoft', weight: 2 }, { kw: 'amazon', weight: 2 },
      { kw: 'tesla', weight: 2, boundary: true }, { kw: 'meta', weight: 2, boundary: true },
      { kw: 'samsung', weight: 2 }, { kw: 'intel', weight: 2, boundary: true },
      { kw: 'amd', weight: 2, boundary: true }, { kw: 'qualcomm', weight: 2 },
      { kw: 'snowflake', weight: 2 }, { kw: 'salesforce', weight: 2 },
      { kw: 'oracle', weight: 2 }, { kw: 'netflix', weight: 2 },
      { kw: 'spotify', weight: 2 }, { kw: 'uber', weight: 2, boundary: true },
      { kw: 'airbnb', weight: 2 },
      { kw: ' ai ', weight: 1 }, { kw: 'hacker', weight: 1 },
      { kw: 'malware', weight: 1 }, { kw: 'chip', weight: 1, boundary: true },
      { kw: 'silicon valley', weight: 1 }, { kw: 'cloud computing', weight: 1 },
      { kw: 'software', weight: 1 }, { kw: 'hardware', weight: 1 },
      { kw: 'startup', weight: 1 }, { kw: 'venture capital', weight: 1 },
      { kw: 'app store', weight: 1 }, { kw: 'smartphone', weight: 1 },
      { kw: 'iphone', weight: 1 }, { kw: 'android', weight: 1 },
      { kw: 'data center', weight: 1 }, { kw: 'algorithm', weight: 1 },
      { kw: 'open source', weight: 1 }, { kw: 'developer', weight: 1 },
      { kw: 'fintech', weight: 1 }, { kw: 'big tech', weight: 1 },
      { kw: 'tech giant', weight: 1 }, { kw: 'tech layoff', weight: 1 },
      { kw: 'tech company', weight: 1 }, { kw: 'electric vehicle battery', weight: 1 },
    ],
  },
  {
    category: 'FINANCE',
    terms: [
      { kw: 'stock market', weight: 3 }, { kw: 'bond yield', weight: 3 },
      { kw: 'interest rate', weight: 3 }, { kw: 'federal reserve', weight: 3 },
      { kw: 'central bank', weight: 3 }, { kw: 'rate hike', weight: 3 },
      { kw: 'rate cut', weight: 3 }, { kw: 'quantitative easing', weight: 3 },
      { kw: 'bank run', weight: 3 }, { kw: 'market crash', weight: 3 },
      { kw: 'nasdaq', weight: 3 }, { kw: 's&p 500', weight: 3 },
      { kw: 'wall street', weight: 3 }, { kw: 'dow jones', weight: 3 },
      { kw: 'treasury', weight: 3 }, { kw: 'hedge fund', weight: 3 },
      { kw: 'trade deficit', weight: 3 }, { kw: 'debt ceiling', weight: 3 },
      { kw: 'inflation rate', weight: 3 }, { kw: 'gdp growth', weight: 3 },
      { kw: 'oil price', weight: 3 }, { kw: 'crude oil', weight: 3 },
      { kw: 'commodity prices', weight: 3 },
      { kw: 'stock price', weight: 2 }, { kw: 'shares fell', weight: 2 },
      { kw: 'shares rose', weight: 2 }, { kw: 'forex', weight: 2, boundary: true },
      { kw: 'currency devaluation', weight: 2 }, { kw: 'dollar index', weight: 2 },
      { kw: 'dividend', weight: 2 }, { kw: 'recession', weight: 2 },
      { kw: 'imf', weight: 2, boundary: true }, { kw: 'world bank', weight: 2 },
      { kw: 'fiscal policy', weight: 2 }, { kw: 'tariff', weight: 2 },
    ],
  },
  {
    category: 'BUSINESS',
    terms: [
      { kw: 'merger', weight: 3 }, { kw: 'acquisition', weight: 3 },
      { kw: 'takeover', weight: 3 }, { kw: 'buyout', weight: 3 },
      { kw: 'chapter 11', weight: 3 }, { kw: 'bankrupt', weight: 3 },
      { kw: 'private equity', weight: 3 }, { kw: 'spinoff', weight: 3 },
      { kw: 'joint venture', weight: 3 }, { kw: 'antitrust', weight: 3 },
      { kw: 'activist investor', weight: 3 }, { kw: 'sec charges', weight: 3 },
      { kw: 'ipo', weight: 3, boundary: true },
      { kw: 'initial public offering', weight: 3 },
      { kw: 'ceo', weight: 2, boundary: true }, { kw: 'chief executive', weight: 2 },
      { kw: 'quarterly earnings', weight: 2 }, { kw: 'quarterly results', weight: 2 },
      { kw: 'revenue growth', weight: 2 }, { kw: 'profit margin', weight: 2 },
      { kw: 'supply chain', weight: 2 }, { kw: 'layoff', weight: 2 },
      { kw: 'redundan', weight: 2 }, { kw: 'valuation', weight: 2 },
      { kw: 'unicorn', weight: 2, boundary: true }, { kw: 'shareholders', weight: 2 },
      { kw: 'board of directors', weight: 2 }, { kw: 'market share', weight: 2 },
      { kw: 'deal closed', weight: 2 },
    ],
  },
  {
    category: 'GEOPOLITICS',
    terms: [
      { kw: 'sanction', weight: 3 }, { kw: 'nato', weight: 3, boundary: true },
      { kw: 'united nations', weight: 3 }, { kw: 'geopolit', weight: 3 },
      { kw: 'security council', weight: 3 }, { kw: 'arms deal', weight: 3 },
      { kw: 'nuclear deal', weight: 3 }, { kw: 'trade war', weight: 3 },
      { kw: 'bilateral summit', weight: 3 }, { kw: 'peace talks', weight: 3 },
      { kw: 'diplomatic', weight: 2 }, { kw: 'embassy', weight: 2 },
      { kw: 'treaty', weight: 2 }, { kw: 'alliance', weight: 2 },
      { kw: 'g7', weight: 2, boundary: true }, { kw: 'g20', weight: 2, boundary: true },
      { kw: 'brics', weight: 2, boundary: true }, { kw: 'sovereignty', weight: 2 },
      { kw: 'foreign minister', weight: 2 }, { kw: 'state department', weight: 2 },
      { kw: 'ambassador', weight: 2 }, { kw: 'expel', weight: 2 },
      { kw: 'envoy', weight: 2 }, { kw: 'foreign policy', weight: 2 },
    ],
  },
  {
    category: 'POLITICS',
    terms: [
      { kw: 'election', weight: 3 }, { kw: 'referendum', weight: 3 },
      { kw: 'impeach', weight: 3 }, { kw: 'inauguration', weight: 3 },
      { kw: 'cabinet reshuffle', weight: 3 }, { kw: 'polling', weight: 3 },
      { kw: 'ballot', weight: 3 }, { kw: 'campaign trail', weight: 3 },
      { kw: 'parliament', weight: 2 }, { kw: 'prime minister', weight: 2 },
      { kw: 'senate', weight: 2 }, { kw: 'congress', weight: 2 },
      { kw: 'legislation', weight: 2 }, { kw: 'chancellor', weight: 2 },
      { kw: 'democrat', weight: 2 }, { kw: 'republican', weight: 2 },
      { kw: 'political party', weight: 2 }, { kw: 'white house', weight: 2 },
      { kw: 'kremlin', weight: 2 }, { kw: 'downing street', weight: 2 },
      { kw: 'administration', weight: 2 }, { kw: 'president', weight: 1 },
    ],
  },
  {
    category: 'HEALTH',
    terms: [
      { kw: 'pandemic', weight: 3 }, { kw: 'epidemic', weight: 3 },
      { kw: 'vaccine', weight: 3 }, { kw: 'world health organization', weight: 3 },
      { kw: 'clinical trial', weight: 3 }, { kw: 'drug approval', weight: 3 },
      { kw: 'public health', weight: 3 }, { kw: 'disease outbreak', weight: 3 },
      { kw: 'pharmaceutical', weight: 2 }, { kw: 'cancer', weight: 2 },
      { kw: 'pathogen', weight: 2 }, { kw: 'mortality rate', weight: 2 },
      { kw: 'infection', weight: 2 }, { kw: 'mental health', weight: 2 },
      { kw: 'virus', weight: 2 }, { kw: 'hospital', weight: 1 },
      { kw: 'treatment', weight: 1 }, { kw: 'fda', weight: 2, boundary: true },
      { kw: 'who', weight: 1, boundary: true },
    ],
  },
  {
    category: 'CRIME',
    terms: [
      { kw: 'murder', weight: 3 }, { kw: 'convict', weight: 3 },
      { kw: 'sentenced', weight: 3 }, { kw: 'trafficking', weight: 3 },
      { kw: 'cartel', weight: 3 }, { kw: 'terrorism', weight: 3 },
      { kw: 'terrorist attack', weight: 3 }, { kw: 'extremist', weight: 3 },
      { kw: 'assassination', weight: 3 }, { kw: 'kidnap', weight: 3 },
      { kw: 'cybercrime', weight: 3 }, { kw: 'money laundering', weight: 3 },
      { kw: 'arrested', weight: 2 }, { kw: 'fraud', weight: 2 },
      { kw: 'corruption', weight: 2 }, { kw: 'indicted', weight: 2 },
      { kw: 'prison', weight: 2 }, { kw: 'gang', weight: 2 },
      { kw: 'smuggling', weight: 2 },
    ],
  },
  {
    category: 'CLIMATE',
    terms: [
      { kw: 'climate change', weight: 3 }, { kw: 'carbon neutral', weight: 3 },
      { kw: 'paris agreement', weight: 3 }, { kw: 'net zero', weight: 3 },
      { kw: 'fossil fuel', weight: 3 }, { kw: 'deforestation', weight: 3 },
      { kw: 'renewable energy', weight: 3 }, { kw: 'solar power', weight: 3 },
      { kw: 'green energy', weight: 3 }, { kw: 'methane', weight: 3 },
      { kw: 'glacier', weight: 3 }, { kw: 'sea level', weight: 3 },
      { kw: 'emission', weight: 2 }, { kw: 'pollution', weight: 2 },
      { kw: 'wildfire', weight: 2 }, { kw: 'flood', weight: 2 },
      { kw: 'drought', weight: 2 }, { kw: 'environment', weight: 1 },
    ],
  },
]

function matchesKeyword(text: string, kw: string, boundary?: boolean): boolean {
  if (!boundary) {
    return text.includes(kw)
  }
  // Word-boundary match: keyword must be preceded/followed by
  // whitespace, punctuation, or string start/end
  const re = new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i')
  return re.test(text)
}

export function categorizeCluster(cluster: EventCluster): ClusterCategory {
  // The label is the AI-generated summary of what the cluster is about.
  // Weight it 2x — a keyword in the label is a stronger signal than one
  // buried in a bullet point or entity list.
  const labelText = (cluster.label ?? '').toLowerCase()
  const contextText = [
    ...(cluster.bullets ?? []),
    ...(cluster.entities?.organizations ?? []),
    ...(cluster.entities?.people ?? []),
  ].join(' ').toLowerCase()

  const scores: Record<ClusterCategory, number> = {
    ALL: 0, CONFLICT: 0, GEOPOLITICS: 0, POLITICS: 0, FINANCE: 0,
    CRYPTO: 0, BUSINESS: 0, TECHNOLOGY: 0, CRIME: 0, HEALTH: 0, CLIMATE: 0,
  }
  const highSpecHits: Record<ClusterCategory, number> = {
    ALL: 0, CONFLICT: 0, GEOPOLITICS: 0, POLITICS: 0, FINANCE: 0,
    CRYPTO: 0, BUSINESS: 0, TECHNOLOGY: 0, CRIME: 0, HEALTH: 0, CLIMATE: 0,
  }

  for (const rule of CATEGORY_RULES) {
    for (const { kw, weight, boundary } of rule.terms) {
      const inLabel = matchesKeyword(labelText, kw, boundary)
      const inContext = matchesKeyword(contextText, kw, boundary)
      if (inLabel || inContext) {
        // Label matches count 2x — the label is the primary topic signal
        scores[rule.category] += inLabel ? weight * 2 : weight
        if (weight >= 3) highSpecHits[rule.category] += inLabel ? 2 : 1
      }
    }
  }

  let best: ClusterCategory = 'GEOPOLITICS'
  let bestScore = 0
  let bestHighSpec = 0
  for (const rule of CATEGORY_RULES) {
    const sc = scores[rule.category]
    const hs = highSpecHits[rule.category]
    if (sc > bestScore || (sc === bestScore && sc > 0 && hs > bestHighSpec)) {
      bestScore = sc
      bestHighSpec = hs
      best = rule.category
    }
  }

  return bestScore > 0 ? best : 'GEOPOLITICS'
}

// ─── Source metadata ───────────────────────────────────────────────────────

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
  // Technology — core
  techcrunch:       'TECHCRUNCH',
  theverge:         'THE VERGE',
  arstechnica:      'ARS TECH',
  wired:            'WIRED',
  hackernews:       'HN',
  mit_tech:         'MIT TECH',
  venturebeat:      'VBEAT',
  zdnet:            'ZDNET',
  infoq:            'INFOQ',
  // Technology — extended SV
  engadget:         'ENGADGET',
  gizmodo:          'GIZMODO',
  fast_company:     'FAST CO',
  inc_magazine:     'INC',
  the_information:  'THE INFO',
  platformer:       'PLATFORMER',
  stratechery_blog: 'STRATECHERY',
  stratechery:      'STRATECHERY',
  dkb_report:       'DKB',
  six_colors:       '6 COLORS',
  macrumors:        'MACRUMORS',
  '9to5mac':        '9TO5MAC',
  '9to5google':     '9TO5GOOGLE',
  android_authority:'ANDROID',
  xda_developers:   'XDA',
  // Technology — AI / ML
  the_decoder:      'AI DECODER',
  import_ai:        'IMPORT AI',
  synced_review:   'SYNCED',
  ai_news:          'AI NEWS',
  unite_ai:         'UNITE.AI',
  // Technology — semiconductor / hardware
  tomshardware:     'TOM HW',
  anandtech:        'ANANDTECH',
  semiconductor_eng:'SEMI ENG',
  ee_times:         'EE TIMES',
  // Technology — dev / engineering
  dev_class:        'DEVCLASS',
  theregister:      'REGISTER',
  sdtimes:          'SD TIMES',
  jaxenter:         'JAXENTER',
  // Technology — startup / VC / deals
  crunchbase_news:  'CRUNCHBASE',
  tech_eu:          'TECHEU',
  sifted:           'SIFTED',
  pitchbook:        'PITCHBOOK',
  axios_pro:        'AXIOS PRO',
  axios:            'AXIOS',
  semafor:          'SEMAFOR',
  // Technology — China / Asia tech
  techinasia:       'TECH ASIA',
  pandaily:         'PANDAILY',
  shenwan:          'SHENWAN',
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
