/**
 * TechValleyView — Silicon Valley Intelligence Dashboard
 *
 * Panels:
 *   1. Stock strip     — live price + % change for Mag-7 + key SV names
 *   2. SV Event Feed   — active clusters mentioning SV companies, filtered live
 *   3. Funding Radar   — clusters tagged with funding/IPO/M&A keywords
 *   4. Live Articles   — tech-source article feed (TechCrunch, Wired, Ars, etc.)
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, DollarSign, Newspaper, RefreshCw, ExternalLink, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { EventCluster, RawArticle } from '@/types'
import { getVolatilityTier, VOLATILITY_COLORS } from '@/types'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { ClusterDetailModal } from '@/components/clusters/ClusterDetailModal'
import { cn, formatAbsTime } from '@/lib/utils'
import { useTimezone } from '@/context/TimezoneContext'
import { useWebSocket } from '@/context/WebSocketContext'

// ─── SV intelligence filter engine ──────────────────────────────────────────

// Minimum volatility to appear in SV events feed (filters out pure noise)
const MIN_SV_VOLATILITY = 0.10

// Strong AI/LLM signals — highest weight
const AI_KEYWORDS = [
  'artificial intelligence', ' ai ', ' ai,', ' ai.', 'ai-', '-ai ',
  'large language model', 'llm', 'gpt-', 'chatgpt', 'gemini', 'claude',
  'openai', 'anthropic', 'machine learning', 'deep learning',
  'neural network', 'foundation model', 'generative ai', 'agi ',
  'inference ', 'fine-tun', 'training run', 'model weight',
]

// Strong tech fundamentals — clearly tech stories
const STRONG_TECH_KEYWORDS = [
  'semiconductor', ' chip ', ' chips ', 'chipmaker', 'microchip', 'silicon wafer',
  'data center', 'hyperscaler', 'cloud computing', 'edge computing',
  'cybersecurity', 'cyber attack', 'data breach', 'zero-day', 'ransomware',
  'vulnerability', 'exploit ', 'gpu ', 'cpu ', 'tpu ', 'npu ',
  'series a', 'series b', 'series c', 'seed round', 'vc funding', 'raises $',
  'ipo filing', ' ipo ', 'spac ', 'unicorn ', 'acquires ', 'acquisition of',
  'autonomous vehicle', 'self-driving', 'full self-driving',
  'quantum computing', 'quantum chip',
  'crypto exchange', 'defi protocol', 'blockchain network',
  'antitrust suit', 'ftc v ', 'doj v ', 'tech regulation',
  'layoffs ', 'laid off', 'workforce reduction', 'headcount',
  // Extended tech signals
  'saas ', 'platform as a service', 'infrastructure as a service',
  'open source', 'open-source', 'github ', 'copilot',
  'devops', 'kubernetes', 'docker ', 'terraform',
  'react ', 'typescript', 'rust lang', 'golang',
  'api ', 'sdk ', 'developer tool', 'programming language',
  'supercomputer', 'compute cluster', 'gpu cluster',
  'training run', 'model training', 'fine-tuning', 'rlhf',
  'robotaxi', 'robotics', 'humanoid robot', 'bipedal',
  'space launch', 'rocket', 'starship', 'falcon ',
  'ev market', 'electric vehicle', 'battery tech', 'solid-state battery',
  'biotech', 'gene editing', 'crispr',
  'augmented reality', 'virtual reality', 'vision pro', 'quest ',
  'saas valuation', 'ai startup', 'ai chip', 'ai model',
]

// Company-as-keyword — only valid if the company also appears in organizations list
const SV_COMPANIES_MAJOR = [
  'apple', 'google', 'alphabet', 'microsoft', 'nvidia', 'meta ', 'amazon',
  'openai', 'anthropic', 'tesla', 'spacex',
]
const SV_COMPANIES_SEC = [
  'netflix', 'salesforce', 'oracle', 'intel ', 'amd ', 'qualcomm', 'broadcom',
  'cisco', 'xai ', 'mistral', 'perplexity', 'databricks', 'stripe',
  'palantir', 'rivian', 'lyft', 'uber ', 'airbnb', 'doordash', 'coinbase',
  'snowflake', 'cloudflare', 'crowdstrike', 'okta', 'twilio', 'zoom ',
  'samsung', 'tsmc', 'arm ', 'asml', 'amd',
  // Extended: more SV / tech companies
  'sap ', 'servicenow', 'workday', 'adobe', 'figma', 'notion', 'canva',
  'discord', 'reddit ', 'spotify ', 'shopify', 'square ', 'block ',
  'robinhood', 'kraken', 'gemini ', 'circle ', 'consensys', 'parity',
  'snyk', 'wiz ', 'sentinelone', 'zscaler', 'mimecast', 'fastly',
  'unity ', 'roblox', 'epic games', 'valve', 'take-two',
  'waymo', 'cruise ', 'zoox', 'aurora ', 'mobileye',
  'figure ', '1x ', 'sanctuary ai', 'agility robotics',
  'tenstorrent', 'cerebras', 'sambaanova', 'groq ', 'reka',
  'scale ai', 'weights & biases', 'hugging face', 'together ai',
  'eleuther', 'cohere ', 'ai21', 'character.ai', 'inflection',
  'deepseek', 'zhipu', 'minimax', 'moonshot', 'baichuan',
]
const SV_PEOPLE = [
  'sam altman', 'elon musk', 'mark zuckerberg', 'sundar pichai',
  'satya nadella', 'jensen huang', 'tim cook', 'jeff bezos',
  'andy jassy', 'dario amodei', 'demis hassabis',
  // Extended: more SV leaders
  'lisa su', 'pat gelsinger', 'craig federighi', 'greg joswiak',
  'brian chesky', 'reed hastings', 'brian armstrong',
  'patrick collison', 'john collison', 'michelle zatlyn',
  'david sacks', 'balaji srinivasan', 'vinod khosla',
  'peter thiel', 'reid hoffman', 'marc andreessen', 'ben horowitz',
  'mira murati', 'greg brockman', 'ilya sutskever',
  'emad mostaque', 'arthur Mensch', 'guillaume lample',
  'jensen', 'zuckerberg', 'nadella', 'pichai',
]
const SV_LOCATIONS = [
  'san francisco', 'silicon valley', 'bay area', 'san jose', 'cupertino',
  'menlo park', 'palo alto', 'mountain view', 'sunnyvale', 'seattle tech',
]

// Hard-exclude these — no amount of tech keywords saves them
const NOISE_LABEL_TERMS = [
  'hollywood', 'box office', 'film studio', 'screenwriter',
  'delta air', 'united airlines', 'american airlines', 'southwest air',
  'drone strike', 'drone warfare', 'drone attack',
  'missile attack', 'artillery', 'military invasion',
  'election result', 'votes cast', 'ballot count', 'polling station',
  ' nba ', ' nfl ', ' mlb ', ' fifa ', 'olympic games',
  'hurricane ', 'earthquake ', 'wildfire disaster',
  'drug cartel', 'fentanyl', 'opioid crisis',
  'space solar power', // Chinese military orbital solar
  'profit sharing, hollywood',
]

// All SV signals flattened (for article matching)
const SV_ALL = [...SV_COMPANIES_MAJOR, ...SV_COMPANIES_SEC, ...SV_PEOPLE]
const TECH_ALL_KEYWORDS = [...AI_KEYWORDS, ...STRONG_TECH_KEYWORDS]

// ── Scoring engine ────────────────────────────────────────────────────────────
function svScore(cluster: EventCluster): number {
  const orgs      = cluster.entities?.organizations ?? []
  const locs      = cluster.entities?.locations ?? []
  const label     = (cluster.label ?? '').toLowerCase()
  const bullets   = (cluster.bullets ?? []).join(' ').toLowerCase()
  const orgsLower = orgs.map(o => o.toLowerCase())
  const orgsText  = orgsLower.join(' ')
  const allText   = label + ' ' + bullets + ' ' + orgsText

  let score = 0

  // AI/LLM keywords anywhere (label weighted highest) → highest value
  if (AI_KEYWORDS.some(kw => label.includes(kw))) score += 4
  else if (AI_KEYWORDS.some(kw => bullets.includes(kw) || orgsText.includes(kw))) score += 2

  // Strong tech keyword anywhere
  if (STRONG_TECH_KEYWORDS.some(kw => label.includes(kw))) score += 2
  else if (STRONG_TECH_KEYWORDS.some(kw => bullets.includes(kw) || orgsText.includes(kw))) score += 1

  // Major SV company in organizations (confirmed entity extraction)
  let majCount = 0
  for (const co of SV_COMPANIES_MAJOR) {
    if (orgsLower.some(o => o.includes(co.trim()))) {
      score += 4; if (++majCount >= 2) break
    }
  }

  // Secondary SV company in organizations
  let secCount = 0
  for (const co of SV_COMPANIES_SEC) {
    if (orgsLower.some(o => o.includes(co.trim()))) {
      score += 2; if (++secCount >= 3) break
    }
  }

  // SV person in organizations
  if (SV_PEOPLE.some(p => orgsLower.some(o => o.includes(p)))) score += 3

  // SV location confirmed
  if (locs.some(l => SV_LOCATIONS.some(sv => l.toLowerCase().includes(sv)))) score += 2

  // Bonus: company name appears in BOTH label AND organizations (high confidence)
  for (const co of SV_COMPANIES_MAJOR) {
    if (label.includes(co.trim()) && orgsLower.some(o => o.includes(co.trim()))) {
      score += 2; break
    }
  }

  return score
}

const FUNDING_KEYWORDS = [
  'raises', 'funding', 'Series A', 'Series B', 'Series C', 'IPO', 'valuation',
  'unicorn', 'acquisition', 'acquires', 'merger', 'SPAC', 'venture', 'round',
]

// Expanded tech/SV-focused sources — must match source IDs in backend sources.py
const TECH_SOURCE_IDS = new Set([
  // Core tech publications
  'techcrunch', 'theverge', 'arstechnica', 'wired', 'hackernews',
  'mit_tech', 'venturebeat', 'zdnet', 'infoq',
  // Extended SV / tech publications
  'engadget', 'gizmodo', 'fast_company', 'inc_magazine', 'the_information',
  'platformer', 'stratechery_blog', 'stratechery', 'dkb_report', 'six_colors',
  'macrumors', '9to5mac', '9to5google', 'android_authority', 'xda_developers',
  // AI / ML focused
  'the_decoder', 'import_ai', 'synced_review', 'ai_news', 'unite_ai',
  // Semiconductor / hardware
  'tomshardware', 'anandtech', 'semiconductor_eng', 'ee_times',
  // Dev / engineering / open source
  'dev_class', 'theregister', 'sdtimes', 'jaxenter',
  // Startup / VC / deals
  'crunchbase_news', 'tech_eu', 'sifted', 'pitchbook', 'axios_pro',
  'axios', 'semafor',
  // China tech / Asia tech
  'techinasia', 'pandaily', 'shenwan',
  // Finance/tech crossover (already ingested, but tech-relevant)
  'bloomberg_tech', 'reuters_tech', 'cnbc_tech',
  'fortune', 'business_insider',
  // SEC filings (tech company disclosures)
  'sec_8k', 'sec_13d',
])

// ─── Stock price strip ───────────────────────────────────────────────────────

const STRIP_TICKERS = [
  { ticker: 'AAPL',  name: 'Apple'     },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'NVDA',  name: 'Nvidia'    },
  { ticker: 'GOOGL', name: 'Alphabet'  },
  { ticker: 'META',  name: 'Meta'      },
  { ticker: 'AMZN',  name: 'Amazon'    },
  { ticker: 'TSLA',  name: 'Tesla'     },
  { ticker: 'NFLX',  name: 'Netflix'   },
  { ticker: 'AMD',   name: 'AMD'       },
  { ticker: 'INTC',  name: 'Intel'     },
  { ticker: 'ORCL',  name: 'Oracle'    },
  { ticker: 'CRM',   name: 'Salesforce'},
]

interface StockQuote {
  ticker:     string
  name:       string
  price:      number | null
  market_cap: number | null
  rec:        string   // analyst recommendation
}

function fmtPrice(v: number | null) {
  if (v == null) return '—'
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}


function StockStrip({ onTickerClick }: { onTickerClick: (ticker: string) => void }) {
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      const results = await Promise.allSettled(
        STRIP_TICKERS.map(t =>
          api.company.get(t.ticker).then(p => ({
            ticker:     t.ticker,
            name:       t.name,
            price:      p.current_price,
            market_cap: p.market_cap,
            rec:        p.analysts.recommendation ?? '',
          }))
        )
      )
      if (cancelled) return
      const q = results
        .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled')
        .map(r => r.value)
      setQuotes(q)
      setLoading(false)
    }
    fetch()
    const interval = setInterval(fetch, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto scrollbar-none py-2 px-4 border-b border-terminal-border">
        {STRIP_TICKERS.map(t => (
          <div key={t.ticker} className="flex-shrink-0 w-24 h-10 bg-terminal-surface/40 rounded-sm animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none py-2 px-4 border-b border-terminal-border bg-terminal-surface/20">
      {STRIP_TICKERS.map(t => {
        const q = quotes.find(q => q.ticker === t.ticker)
        const rec = (q?.rec ?? '').toLowerCase()
        const color = rec.includes('buy') ? '#22c55e' : rec.includes('sell') ? '#ef4444' : '#00d4ff'
        return (
          <button
            key={t.ticker}
            onClick={() => onTickerClick(t.ticker)}
            className="flex-shrink-0 px-3 py-1.5 rounded-sm border transition-all hover:brightness-125"
            style={{ background: color + '10', borderColor: color + '25' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] font-bold" style={{ color }}>{t.ticker}</span>
            </div>
            <div className="font-mono text-[9px] text-terminal-dim mt-0.5">
              {fmtPrice(q?.price ?? null)}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSVCluster(cluster: EventCluster): boolean {
  if (cluster.volatility < MIN_SV_VOLATILITY) return false

  const label = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()
  const orgsLower = (cluster.entities?.organizations ?? []).map(o => o.toLowerCase())
  const orgsText = orgsLower.join(' ')
  const allText = label + ' ' + bullets + ' ' + orgsText

  // Hard-exclude obvious noise regardless of any other signals
  if (NOISE_LABEL_TERMS.some(n => allText.includes(n))) return false

  // Check tech signals across label, bullets, AND organizations (not just label)
  const hasAI         = AI_KEYWORDS.some(kw => allText.includes(kw))
  const hasStrongTech = STRONG_TECH_KEYWORDS.some(kw => allText.includes(kw))
  const hasMajorConfirmed = SV_COMPANIES_MAJOR.some(co =>
    orgsLower.some(o => o.includes(co.trim()))
  )
  const hasSecConfirmed = SV_COMPANIES_SEC.some(co =>
    orgsLower.some(o => o.includes(co.trim()))
  )
  const hasMajorInLabel = SV_COMPANIES_MAJOR.some(co =>
    label.includes(co.trim())
  )
  const hasSecInLabel = SV_COMPANIES_SEC.some(co =>
    label.includes(co.trim())
  )

  if (!hasAI && !hasStrongTech && !hasMajorConfirmed && !hasSecConfirmed && !hasMajorInLabel && !hasSecInLabel) return false

  // Require minimum composite SV relevance score
  return svScore(cluster) >= 3
}

function isFundingCluster(cluster: EventCluster): boolean {
  if (!isSVCluster(cluster)) return false
  const label   = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()
  return FUNDING_KEYWORDS.some(kw => label.includes(kw.toLowerCase()) || bullets.includes(kw.toLowerCase()))
}

// Article noise — exclude even from tech sources if these dominate the headline
const ARTICLE_NOISE_TERMS = [
  'drone strike', 'missile attack', 'military offensive',
  'hurricane ', 'earthquake ', 'wildfire', 'tsunami',
  ' nba ', ' nfl ', ' mlb ', 'world cup ', 'olympic',
  'drug cartel', 'fentanyl', 'opioid',
  'box office ', 'film awards', 'oscars',
]

function isTechArticle(article: RawArticle): boolean {
  if (!article.title) return false
  const src   = article.source_id ?? ''
  const title = article.title.toLowerCase()

  // Block hard noise even from tech sources
  if (ARTICLE_NOISE_TERMS.some(n => title.includes(n))) return false

  const hasTechKw  = TECH_ALL_KEYWORDS.some(kw => title.includes(kw))
  const hasSVEntity = SV_ALL.some(sv => title.includes(sv.trim()))

  // Dedicated tech source: include if title has any tech signal
  if (TECH_SOURCE_IDS.has(src)) return hasTechKw || hasSVEntity

  // General news source: need both a tech keyword AND an SV entity
  return hasTechKw && hasSVEntity
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)  return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ─── Cluster card (compact) ───────────────────────────────────────────────────

function SVClusterCard({ cluster, onSelect }: { cluster: EventCluster; onSelect: (id: string) => void }) {
  const tier  = getVolatilityTier(cluster.volatility)
  const color = VOLATILITY_COLORS[tier]
  const { timezone } = useTimezone()

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={() => onSelect(cluster.id)}
      className="w-full text-left px-3 py-2.5 rounded-sm border transition-all hover:brightness-115 cursor-pointer"
      style={{ background: color + '08', borderColor: color + '30', borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="flex items-start gap-2">
        <VolatilityBadge volatility={cluster.volatility} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-terminal-text leading-snug line-clamp-2">
            {cluster.label ?? 'Unnamed cluster'}
          </p>
          {cluster.bullets?.[0] && (
            <p className="font-mono text-[9px] text-terminal-dim/70 mt-0.5 leading-snug line-clamp-1">
              {cluster.bullets[0]}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {(cluster.entities?.organizations ?? []).slice(0, 3).map(o => (
              <span key={o} className="text-[7px] font-mono px-1 rounded-sm" style={{ background: color + '15', color }}>{o}</span>
            ))}
          </div>
        </div>
        <span className="text-[8px] font-mono text-terminal-dim/40 flex-shrink-0 mt-0.5">
          {formatAbsTime(cluster.last_updated_at, timezone)}
        </span>
      </div>
    </motion.button>
  )
}

// ─── Article row ──────────────────────────────────────────────────────────────

function ArticleRow({ article }: { article: RawArticle }) {
  const { timezone } = useTimezone()
  const sentColor = (article.sentiment ?? 0) > 0.15 ? '#22c55e' : (article.sentiment ?? 0) < -0.15 ? '#ef4444' : undefined

  return (
    <a
      href={article.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-3 py-2 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[10px] text-terminal-text group-hover:text-terminal-accent transition-colors leading-snug">
          {article.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[7px] font-mono text-terminal-dim/50 uppercase tracking-widest">
            {(article.source_id ?? '').replace(/_/g, ' ')}
          </span>
          {sentColor && (
            <span className="text-[7px] font-mono font-bold" style={{ color: sentColor }}>
              {(article.sentiment ?? 0) > 0 ? '▲ BULL' : '▼ BEAR'}
            </span>
          )}
          <span className="text-[7px] font-mono text-terminal-dim/30 ml-auto">
            {formatAbsTime(article.published_at, timezone)}
          </span>
        </div>
      </div>
      <ExternalLink size={9} className="flex-shrink-0 mt-0.5 text-terminal-dim/30 group-hover:text-terminal-accent transition-colors" />
    </a>
  )
}

// ─── AI Summary panel ─────────────────────────────────────────────────────────

function SVAISummary({ clusters }: { clusters: EventCluster[] }) {
  const [analysis, setAnalysis]   = useState<string | null>(null)
  const [loading,  setLoading]    = useState(false)
  const [expanded, setExpanded]   = useState(true)
  const [topId,    setTopId]      = useState<string | null>(null)
  const [error,    setError]      = useState(false)

  // Pick the highest-volatility SV cluster and deepdive it
  useEffect(() => {
    if (clusters.length === 0) return
    const top = clusters[0]
    if (top.id === topId) return   // already loaded for this cluster
    setTopId(top.id)
    setAnalysis(null)
    setLoading(true)
    setError(false)
    api.clusters.deepdive(top.id)
      .then(res => { setAnalysis(res.analysis); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [clusters, topId])

  const topCluster = clusters[0]

  return (
    <div className="border-b border-terminal-border flex-shrink-0 bg-terminal-surface/20">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-terminal-muted/20 transition-colors"
      >
        <Sparkles size={10} className="text-terminal-accent flex-shrink-0" />
        <span className="text-[9px] font-mono tracking-widest text-terminal-accent">AI BRIEFING</span>
        {topCluster && (
          <span className="text-[8px] font-mono text-terminal-dim/50 truncate flex-1 text-left ml-1">
            — {topCluster.label}
          </span>
        )}
        {loading && <span className="text-[7px] font-mono text-terminal-dim/40 animate-pulse ml-auto">generating…</span>}
        {expanded ? <ChevronUp size={9} className="text-terminal-dim/40 flex-shrink-0 ml-auto" /> : <ChevronDown size={9} className="text-terminal-dim/40 flex-shrink-0 ml-auto" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              {loading && (
                <div className="space-y-1.5 py-1">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-2 bg-terminal-surface rounded animate-pulse"
                      style={{ width: `${[100, 92, 96, 78][i - 1]}%` }} />
                  ))}
                </div>
              )}
              {error && (
                <p className="text-[9px] font-mono text-terminal-dim/40 italic py-1">
                  Analysis unavailable — click a cluster for details.
                </p>
              )}
              {analysis && (
                <p className="text-[10px] font-mono text-terminal-dim/80 leading-relaxed whitespace-pre-wrap">
                  {analysis}
                </p>
              )}
              {!loading && !error && !analysis && clusters.length === 0 && (
                <p className="text-[9px] font-mono text-terminal-dim/40 italic py-1">
                  No active SV clusters to summarize.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClusterSelect: (id: string) => void
}

export function TechValleyView({ onClusterSelect }: Props) {
  const [, navigate] = useLocation()
  const [allClusters, setAllClusters] = useState<EventCluster[]>([])
  const [articles,    setArticles]    = useState<RawArticle[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [activeTab,   setActiveTab]   = useState<'events' | 'funding' | 'articles'>('events')
  const { lastClusterUpdate, lastArticle } = useWebSocket()

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const [clusters, feed] = await Promise.all([
        api.clusters.list({ limit: 200, activeOnly: true, minVolatility: 0 }),
        api.feed.list({ limit: 200 }),
      ])
      setAllClusters(clusters)
      setArticles(feed)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Live updates from WebSocket
  useEffect(() => {
    if (lastClusterUpdate) {
      setAllClusters(prev => {
        const idx = prev.findIndex(c => c.id === lastClusterUpdate.cluster_id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], ...lastClusterUpdate, id: lastClusterUpdate.cluster_id }
          return updated
        }
        return [{ ...lastClusterUpdate, id: lastClusterUpdate.cluster_id, is_active: true, first_seen_at: null, last_updated_at: null } as EventCluster, ...prev]
      })
    }
  }, [lastClusterUpdate])

  useEffect(() => {
    if (lastArticle) {
      setArticles(prev => [lastArticle as unknown as RawArticle, ...prev].slice(0, 200))
    }
  }, [lastArticle])

  const svClusters = useMemo(() =>
    allClusters
      .filter(isSVCluster)
      .sort((a, b) => (svScore(b) * b.volatility) - (svScore(a) * a.volatility)),
    [allClusters]
  )

  const fundingClusters = useMemo(() =>
    allClusters
      .filter(c => isSVCluster(c) && isFundingCluster(c))
      .sort((a, b) => b.volatility - a.volatility),
    [allClusters]
  )

  const techArticles = useMemo(() =>
    articles.filter(isTechArticle).slice(0, 80),
    [articles]
  )

  const TABS = [
    { id: 'events'   as const, label: 'EVENTS',   icon: Cpu,         count: svClusters.length      },
    { id: 'funding'  as const, label: 'DEALS',     icon: DollarSign,  count: fundingClusters.length },
    { id: 'articles' as const, label: 'ARTICLES',  icon: Newspaper,   count: techArticles.length    },
  ]

  const displayItems = activeTab === 'events' ? svClusters : activeTab === 'funding' ? fundingClusters : []

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Stock strip */}
      <StockStrip onTickerClick={ticker => navigate(`/splc/${ticker}`)} />

      {/* AI Summary */}
      {svClusters.length > 0 && <SVAISummary clusters={svClusters} />}

      {/* Panel header + tab bar */}
      <div className="border-b border-terminal-border flex-shrink-0">
        <div className="px-4 py-3 flex items-end justify-between">
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-terminal-dim mb-0.5">
              § 06 · Silicon valley
              {svClusters.length > 0 && (
                <span className="ml-2 text-terminal-accent/70">{svClusters.length} CLUSTERS</span>
              )}
            </p>
            <h2 className="font-serif text-[20px] leading-none tracking-[-0.01em] text-terminal-text">
              Tech, <em className="italic text-terminal-accent">live.</em>
            </h2>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <span className="font-mono text-[9px] text-terminal-dim/40">
              {techArticles.length} articles
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse-dot flex-shrink-0" />
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-1 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/40 px-2 py-1 transition-colors"
            >
              <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5 px-3 pb-0 overflow-x-auto scrollbar-none">
          {TABS.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1.5 transition-colors border-b-2 whitespace-nowrap',
                activeTab === id
                  ? 'text-terminal-accent border-b-terminal-accent'
                  : 'text-terminal-dim hover:text-terminal-text border-b-transparent',
              )}
              style={activeTab === id ? { borderBottomColor: '#d89b4a' } : {}}
            >
              <Icon size={9} />
              {label}
              {count > 0 && (
                <span className={cn(
                  'text-[8px] font-mono',
                  activeTab === id ? 'text-terminal-accent/70' : 'text-terminal-dim/40'
                )}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: cluster events / deals */}
        <div className="flex-[60] min-w-0 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-terminal-surface/40 rounded-sm animate-pulse" />
              ))}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-terminal-dim/40">
              <Cpu size={24} />
              <p className="text-[10px] font-mono">
                {activeTab === 'funding' ? 'No active funding/deal clusters' : 'No active SV clusters'}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {activeTab === 'articles' ? (
                techArticles.map(a => <ArticleRow key={a.id} article={a} />)
              ) : (
                <AnimatePresence>
                  {displayItems.map(c => (
                    <SVClusterCard key={c.id} cluster={c} onSelect={onClusterSelect} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          )}
        </div>

        {/* Right: tech articles (always visible alongside events/deals) */}
        {activeTab !== 'articles' && (
          <div className="flex-[40] min-w-0 border-l border-terminal-border overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 border-b border-terminal-border/50 flex items-center gap-2">
              <Newspaper size={10} className="text-terminal-dim" />
              <span className="text-[8px] font-mono text-terminal-dim tracking-widest">TECH NEWS</span>
              <span className="text-[7px] font-mono text-terminal-dim/30 ml-auto">{techArticles.length} stories</span>
            </div>
            {techArticles.map(a => <ArticleRow key={a.id} article={a} />)}
          </div>
        )}

        {/* Articles tab: full width */}
        {activeTab === 'articles' && (
          <div className="flex-[40] min-w-0 border-l border-terminal-border overflow-y-auto scrollbar-thin">
            <div className="px-3 py-2 border-b border-terminal-border/50">
              <span className="text-[8px] font-mono text-terminal-dim tracking-widest">TECH SOURCES BREAKDOWN</span>
            </div>
            <div className="p-3 space-y-1">
              {Array.from(
                techArticles.reduce((acc, a) => {
                  const src = a.source_id ?? 'unknown'
                  acc.set(src, (acc.get(src) ?? 0) + 1)
                  return acc
                }, new Map<string, number>())
              )
                .sort((a, b) => b[1] - a[1])
                .map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-terminal-dim uppercase">{src.replace(/_/g, ' ')}</span>
                    <span className="text-[9px] font-mono text-terminal-accent">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
