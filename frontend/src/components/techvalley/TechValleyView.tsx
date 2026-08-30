/**
 * TechValleyView — Silicon Valley Intelligence Dashboard (v2)
 *
 * Layout:
 *   1. Company card strip   — clickable trading cards with live price + change
 *   2. AI Briefing button     — click-to-generate modal (no auto-gen)
 *   3. Left column (60%)      — Events / Deals tabs (cluster feed)
 *   4. Right column (40%)     — Live tech article feed (always visible)
 *
 * Clicking a company card opens a detail modal with full profile,
 * analyst ratings, key metrics, and related news.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useLocation } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Cpu, DollarSign, Newspaper, RefreshCw, ExternalLink,
  Sparkles, X, TrendingUp, TrendingDown, Building2,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { CompanyProfile } from '@/lib/api'
import type { EventCluster, RawArticle } from '@/types'
import { getVolatilityTier, VOLATILITY_COLORS } from '@/types'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { ClusterDetailModal } from '@/components/clusters/ClusterDetailModal'
import { cn, formatAbsTime } from '@/lib/utils'
import { useTimezone } from '@/context/TimezoneContext'
import { useWebSocket } from '@/context/WebSocketContext'

// ─── SV intelligence filter engine ──────────────────────────────────────────

const MIN_SV_VOLATILITY = 0.10

const AI_KEYWORDS = [
  'artificial intelligence', ' ai ', ' ai,', ' ai.', 'ai-', '-ai ',
  'large language model', 'llm', 'gpt-', 'chatgpt', 'gemini', 'claude',
  'openai', 'anthropic', 'machine learning', 'deep learning',
  'neural network', 'foundation model', 'generative ai', 'agi ',
  'inference ', 'fine-tun', 'training run', 'model weight',
]

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

const NOISE_LABEL_TERMS = [
  'hollywood', 'box office', 'film studio', 'screenwriter',
  'delta air', 'united airlines', 'american airlines', 'southwest air',
  'drone strike', 'drone warfare', 'drone attack',
  'missile attack', 'artillery', 'military invasion',
  'election result', 'votes cast', 'ballot count', 'polling station',
  ' nba ', ' nfl ', ' mlb ', ' fifa ', 'olympic games',
  'hurricane ', 'earthquake ', 'wildfire disaster',
  'drug cartel', 'fentanyl', 'opioid crisis',
  'space solar power',
  'profit sharing, hollywood',
]

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

  if (AI_KEYWORDS.some(kw => label.includes(kw))) score += 4
  else if (AI_KEYWORDS.some(kw => bullets.includes(kw) || orgsText.includes(kw))) score += 2

  if (STRONG_TECH_KEYWORDS.some(kw => label.includes(kw))) score += 2
  else if (STRONG_TECH_KEYWORDS.some(kw => bullets.includes(kw) || orgsText.includes(kw))) score += 1

  let majCount = 0
  for (const co of SV_COMPANIES_MAJOR) {
    if (orgsLower.some(o => o.includes(co.trim()))) {
      score += 4; if (++majCount >= 2) break
    }
  }

  let secCount = 0
  for (const co of SV_COMPANIES_SEC) {
    if (orgsLower.some(o => o.includes(co.trim()))) {
      score += 2; if (++secCount >= 3) break
    }
  }

  if (SV_PEOPLE.some(p => orgsLower.some(o => o.includes(p)))) score += 3

  if (locs.some(l => SV_LOCATIONS.some(sv => l.toLowerCase().includes(sv)))) score += 2

  for (const co of SV_COMPANIES_MAJOR) {
    if (label.includes(co.trim()) && orgsLower.some(o => o.includes(co.trim()))) {
      score += 2; break
    }
  }

  return score
}

const FUNDING_KEYWORDS = [
  'raises', 'funding', 'series a', 'series b', 'series c', 'ipo', 'valuation',
  'unicorn', 'acquisition', 'acquires', 'merger', 'spac', 'venture', 'round',
  'seed round', 'raises $', 'ipo filing', 'buyout', 'takeover', 'private equity',
  'funding round', 'capital raise', 'term sheet',
]

// Expanded tech/SV-focused sources — must match source IDs in backend sources.py
const TECH_SOURCE_IDS = new Set([
  'techcrunch', 'theverge', 'arstechnica', 'wired', 'hackernews',
  'mit_tech', 'venturebeat', 'zdnet', 'infoq',
  'engadget', 'gizmodo', 'fast_company', 'inc_magazine', 'the_information',
  'platformer', 'stratechery_blog', 'stratechery', 'dkb_report', 'six_colors',
  'macrumors', '9to5mac', '9to5google', 'android_authority', 'xda_developers',
  'the_decoder', 'import_ai', 'synced_review', 'ai_news', 'unite_ai',
  'tomshardware', 'anandtech', 'semiconductor_eng', 'ee_times',
  'dev_class', 'theregister', 'sdtimes', 'jaxenter',
  'crunchbase_news', 'tech_eu', 'sifted', 'pitchbook', 'axios_pro',
  'axios', 'semafor',
  'techinasia', 'pandaily', 'shenwan',
  'bloomberg_tech', 'reuters_tech', 'cnbc_tech',
  'fortune', 'business_insider',
  'sec_8k', 'sec_13d',
])

// ─── Filter functions ─────────────────────────────────────────────────────────

function isSVCluster(cluster: EventCluster): boolean {
  if (cluster.volatility < MIN_SV_VOLATILITY) return false

  const label = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()
  const orgsLower = (cluster.entities?.organizations ?? []).map(o => o.toLowerCase())
  const orgsText = orgsLower.join(' ')
  const allText = label + ' ' + bullets + ' ' + orgsText

  if (NOISE_LABEL_TERMS.some(n => allText.includes(n))) return false

  const hasAI         = AI_KEYWORDS.some(kw => allText.includes(kw))
  const hasStrongTech = STRONG_TECH_KEYWORDS.some(kw => allText.includes(kw))
  const hasMajorConfirmed = SV_COMPANIES_MAJOR.some(co => orgsLower.some(o => o.includes(co.trim())))
  const hasSecConfirmed = SV_COMPANIES_SEC.some(co => orgsLower.some(o => o.includes(co.trim())))
  const hasMajorInLabel = SV_COMPANIES_MAJOR.some(co => label.includes(co.trim()))
  const hasSecInLabel = SV_COMPANIES_SEC.some(co => label.includes(co.trim()))

  if (!hasAI && !hasStrongTech && !hasMajorConfirmed && !hasSecConfirmed && !hasMajorInLabel && !hasSecInLabel) return false

  return svScore(cluster) >= 3
}

function isFundingCluster(cluster: EventCluster): boolean {
  // Don't require isSVCluster first — funding clusters are inherently business/tech
  if (cluster.volatility < MIN_SV_VOLATILITY) return false

  const label = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()
  const orgsLower = (cluster.entities?.organizations ?? []).map(o => o.toLowerCase())
  const allText = label + ' ' + bullets + ' ' + orgsLower.join(' ')

  if (NOISE_LABEL_TERMS.some(n => allText.includes(n))) return false

  // Must have funding keyword
  const hasFunding = FUNDING_KEYWORDS.some(kw => allText.includes(kw))
  if (!hasFunding) return false

  // Must also have some tech/SV relevance
  const hasTechSignal =
    AI_KEYWORDS.some(kw => allText.includes(kw)) ||
    STRONG_TECH_KEYWORDS.some(kw => allText.includes(kw)) ||
    SV_COMPANIES_MAJOR.some(co => allText.includes(co.trim())) ||
    SV_COMPANIES_SEC.some(co => allText.includes(co.trim()))

  return hasTechSignal
}

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

  if (ARTICLE_NOISE_TERMS.some(n => title.includes(n))) return false

  const hasTechKw  = TECH_ALL_KEYWORDS.some(kw => title.includes(kw))
  const hasSVEntity = SV_ALL.some(sv => title.includes(sv.trim()))

  if (TECH_SOURCE_IDS.has(src)) return hasTechKw || hasSVEntity
  return hasTechKw && hasSVEntity
}

// ─── Company card strip ───────────────────────────────────────────────────────

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
  ticker:      string
  name:        string
  price:       number | null
  change_pct:  number | null
  market_cap:  number | null
  rec:         string
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—'
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMarketCap(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

function StockStrip({ onCardClick }: { onCardClick: (ticker: string) => void }) {
  const [quotes, setQuotes] = useState<StockQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchQuotes = async () => {
      const results = await Promise.allSettled(
        STRIP_TICKERS.map(t =>
          api.company.get(t.ticker).then(p => ({
            ticker:      t.ticker,
            name:        t.name,
            price:       p.current_price,
            change_pct:  p.change_pct,
            market_cap:  p.market_cap,
            rec:         p.analysts?.recommendation ?? '',
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
    fetchQuotes()
    const interval = setInterval(fetchQuotes, 120_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto scrollbar-none py-2 px-4 border-b border-terminal-border">
        {STRIP_TICKERS.map(t => (
          <div key={t.ticker} className="flex-shrink-0 w-28 h-16 bg-terminal-surface/40 rounded-sm animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none py-2 px-4 border-b border-terminal-border bg-terminal-surface/20">
      {STRIP_TICKERS.map(t => {
        const q = quotes.find(q => q.ticker === t.ticker)
        const change = q?.change_pct
        const isUp = change != null && change > 0
        const isDown = change != null && change < 0
        const color = isUp ? '#22c55e' : isDown ? '#ef4444' : '#6b7280'
        const rec = (q?.rec ?? '').toLowerCase()
        const recColor = rec.includes('buy') ? '#22c55e' : rec.includes('sell') ? '#ef4444' : '#00d4ff'

        return (
          <button
            key={t.ticker}
            onClick={() => onCardClick(t.ticker)}
            className="flex-shrink-0 w-28 px-3 py-2 rounded-sm border transition-all hover:brightness-125 text-left"
            style={{ background: color + '08', borderColor: color + '25' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold" style={{ color: recColor }}>{t.ticker}</span>
              {change != null && (
                <span className="flex items-center gap-0.5 text-[8px] font-mono font-bold" style={{ color }}>
                  {isUp ? <TrendingUp size={8} /> : isDown ? <TrendingDown size={8} /> : null}
                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-terminal-text mt-0.5">
              {fmtPrice(q?.price ?? null)}
            </div>
            <div className="font-mono text-[8px] text-terminal-dim/50 mt-0.5">
              {fmtMarketCap(q?.market_cap ?? null)}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Company detail modal ─────────────────────────────────────────────────────

function CompanyDetailModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    api.company.get(ticker)
      .then(p => { if (!cancelled) { setProfile(p); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [ticker])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-3xl max-h-[85vh] mx-4 bg-terminal-bg border border-terminal-border rounded-sm shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-terminal-border flex-shrink-0">
          <Building2 size={16} className="text-terminal-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[12px] font-bold text-terminal-text">
              {profile?.name ?? ticker}
            </span>
            {profile && (
              <span className="font-mono text-[9px] text-terminal-dim/50 ml-2">
                {ticker} · {profile.exchange || '—'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto scrollbar-thin px-5 py-4 flex-1">
          {loading && (
            <div className="space-y-3">
              <div className="h-8 bg-terminal-surface rounded animate-pulse w-1/2" />
              <div className="grid grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-16 bg-terminal-surface rounded animate-pulse" />)}
              </div>
              <div className="h-32 bg-terminal-surface rounded animate-pulse" />
            </div>
          )}

          {error && (
            <p className="text-[11px] font-mono text-terminal-dim/40 italic">
              Failed to load company profile. The API may be rate-limited.
            </p>
          )}

          {profile && !loading && (
            <CompanyDetailContent profile={profile} />
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function CompanyDetailContent({ profile }: { profile: CompanyProfile }) {
  const change = profile.change
  const changePct = profile.change_pct
  const isUp = changePct != null && changePct > 0
  const isDown = changePct != null && changePct < 0
  const priceColor = isUp ? '#22c55e' : isDown ? '#ef4444' : '#6b7280'

  const a = profile.analysts
  const recColor = (a?.recommendation ?? '').includes('BUY') ? '#22c55e'
    : (a?.recommendation ?? '').includes('SELL') ? '#ef4444' : '#eab308'

  const pt = a?.price_target
  const ptUpside = pt?.mean && profile.current_price
    ? ((pt.mean - profile.current_price) / profile.current_price * 100) : null

  // 52-week range bar
  const range52Low = profile.fifty_two_week_low
  const range52High = profile.fifty_two_week_high
  const pricePctInRange = range52Low && range52High && profile.current_price
    ? ((profile.current_price - range52Low) / (range52High - range52Low) * 100) : null

  return (
    <div className="space-y-5">
      {/* Price section */}
      <div className="flex items-end gap-4">
        <div>
          <div className="font-mono text-[28px] font-bold text-terminal-text leading-none">
            {fmtPrice(profile.current_price)}
          </div>
          {change != null && (
            <div className="flex items-center gap-1 mt-1 font-mono text-[12px] font-bold" style={{ color: priceColor }}>
              {isUp ? <TrendingUp size={12} /> : isDown ? <TrendingDown size={12} /> : null}
              {change > 0 ? '+' : ''}{change.toFixed(2)}
              {changePct != null && <span className="text-[10px]">({changePct > 0 ? '+' : ''}{changePct.toFixed(2)}%)</span>}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {a?.recommendation && (
          <div
            className="px-3 py-1.5 rounded-sm border font-mono text-[11px] font-bold tracking-wider"
            style={{ color: recColor, borderColor: recColor + '44', background: recColor + '15' }}
          >
            {a.recommendation}
          </div>
        )}
      </div>

      {/* 52-week range bar */}
      {range52Low && range52High && pricePctInRange != null && (
        <div>
          <div className="flex justify-between text-[9px] font-mono text-terminal-dim/50 mb-1">
            <span>52W Low: ${range52Low.toFixed(2)}</span>
            <span>52W High: ${range52High.toFixed(2)}</span>
          </div>
          <div className="relative h-1.5 bg-terminal-border rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 w-1 bg-terminal-accent rounded-full"
              style={{ left: `${Math.max(0, Math.min(100, pricePctInRange))}%` }}
            />
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, pricePctInRange))}%`, background: priceColor + '40' }}
            />
          </div>
        </div>
      )}

      {/* Key metrics grid */}
      <div className="grid grid-cols-4 gap-3">
        <Metric label="MKT CAP" value={fmtMarketCap(profile.market_cap)} />
        <Metric label="P/E" value={profile.pe_ratio != null ? profile.pe_ratio.toFixed(1) : '—'} />
        <Metric label="BETA" value={profile.beta != null ? profile.beta.toFixed(2) : '—'} />
        <Metric label="DIV YIELD" value={profile.dividend_yield != null ? `${(profile.dividend_yield * 100).toFixed(2)}%` : '—'} />
        <Metric label="REV/SH" value={profile.revenue_ttm != null ? `$${profile.revenue_ttm.toFixed(2)}` : '—'} />
        <Metric label="MARGIN" value={profile.profit_margin != null ? `${(profile.profit_margin * 100).toFixed(1)}%` : '—'} />
        <Metric label="ROE" value={profile.roe != null ? `${(profile.roe * 100).toFixed(1)}%` : '—'} />
        <Metric label="D/E" value={profile.debt_to_equity != null ? profile.debt_to_equity.toFixed(2) : '—'} />
      </div>

      {/* Analyst ratings */}
      {a && a.total_analysts > 0 && (
        <div className="border-t border-terminal-border/40 pt-4">
          <p className="text-[10px] font-mono text-terminal-dim tracking-widest uppercase mb-3">
            Analyst Consensus · {a.total_analysts} analysts
          </p>
          <div className="flex items-center gap-2 mb-3">
            <RatingBar label="BUY" count={a.rating_counts.buy} total={a.total_analysts} color="#22c55e" />
            <RatingBar label="HOLD" count={a.rating_counts.hold} total={a.total_analysts} color="#eab308" />
            <RatingBar label="SELL" count={a.rating_counts.sell} total={a.total_analysts} color="#ef4444" />
          </div>
          {pt?.mean != null && (
            <div className="flex items-center gap-4 text-[10px] font-mono">
              <span className="text-terminal-dim">Price Target:</span>
              <span className="text-terminal-text font-bold">${pt.mean.toFixed(2)}</span>
              {ptUpside != null && (
                <span style={{ color: ptUpside > 0 ? '#22c55e' : '#ef4444' }} className="font-bold">
                  {ptUpside > 0 ? '+' : ''}{ptUpside.toFixed(1)}% upside
                </span>
              )}
              {pt.high != null && <span className="text-terminal-dim/50">H: ${pt.high.toFixed(2)}</span>}
              {pt.low != null && <span className="text-terminal-dim/50">L: ${pt.low.toFixed(2)}</span>}
            </div>
          )}
        </div>
      )}

      {/* Recent analyst ratings */}
      {a?.recent && a.recent.length > 0 && (
        <div className="border-t border-terminal-border/40 pt-3">
          <p className="text-[10px] font-mono text-terminal-dim tracking-widest uppercase mb-2">
            Recent Coverage
          </p>
          <div className="space-y-1">
            {a.recent.slice(0, 6).map((r, i) => {
              const c = r.rating === 'BUY' ? '#22c55e' : r.rating === 'SELL' ? '#ef4444' : '#eab308'
              return (
                <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                  <span style={{ color: c }} className="font-bold w-10">{r.rating}</span>
                  <span className="text-terminal-text/70">{r.firm}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Industries */}
      {profile.industries.length > 0 && (
        <div className="border-t border-terminal-border/40 pt-3">
          <p className="text-[10px] font-mono text-terminal-dim tracking-widest uppercase mb-2">
            Classification
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.industries.map((ind, i) => (
              <span key={i} className="text-[9px] font-mono px-2 py-0.5 rounded-sm border border-terminal-border text-terminal-dim/70">
                {ind.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top shareholders */}
      {profile.shareholders.institutions.length > 0 && (
        <div className="border-t border-terminal-border/40 pt-3">
          <p className="text-[10px] font-mono text-terminal-dim tracking-widest uppercase mb-2">
            Top Shareholders
          </p>
          <div className="space-y-1">
            {profile.shareholders.institutions.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-terminal-text/70">{s.name}</span>
                {s.pct_held != null && <span className="text-terminal-dim">{s.pct_held.toFixed(1)}%</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-terminal-surface/30 border border-terminal-border/50 rounded-sm px-2.5 py-2">
      <div className="text-[8px] font-mono text-terminal-dim/50 tracking-widest uppercase">{label}</div>
      <div className="text-[12px] font-mono font-bold text-terminal-text mt-0.5">{value}</div>
    </div>
  )
}

function RatingBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total * 100) : 0
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[8px] font-mono font-bold" style={{ color }}>{label}</span>
        <span className="text-[8px] font-mono text-terminal-dim">{count}</span>
      </div>
      <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── AI Briefing button + modal ─────────────────────────────────────────────

function SVAISummary({ clusters }: { clusters: EventCluster[] }) {
  const [analysis, setAnalysis]   = useState<string | null>(null)
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const topCluster = clusters[0]

  const generate = useCallback(() => {
    if (!topCluster) return
    setModalOpen(true)
    if (analysis || loading) return
    setLoading(true)
    setError(false)
    api.clusters.deepdive(topCluster.id)
      .then(res => { setAnalysis(res.analysis); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [topCluster, analysis, loading])

  const closeModal = useCallback(() => setModalOpen(false), [])

  return (
    <>
      <button
        onClick={generate}
        disabled={!topCluster}
        className="w-full flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-surface/20 hover:bg-terminal-muted/20 transition-colors disabled:opacity-40"
      >
        <Sparkles size={10} className="text-terminal-accent flex-shrink-0" />
        <span className="text-[9px] font-mono tracking-widest text-terminal-accent">AI BRIEFING</span>
        {topCluster && (
          <span className="text-[8px] font-mono text-terminal-dim/50 truncate flex-1 text-left ml-1">
            — {topCluster.label}
          </span>
        )}
        <span className="text-[7px] font-mono text-terminal-dim/40 ml-auto flex-shrink-0">
          CLICK TO GENERATE
        </span>
      </button>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-terminal-bg border border-terminal-border rounded-sm shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b border-terminal-border flex-shrink-0">
                <Sparkles size={12} className="text-terminal-accent flex-shrink-0" />
                <span className="text-[10px] font-mono tracking-widest text-terminal-accent">AI BRIEFING</span>
                {topCluster && (
                  <span className="text-[9px] font-mono text-terminal-dim/50 truncate flex-1 ml-1">
                    — {topCluster.label}
                  </span>
                )}
                <button onClick={closeModal} className="text-terminal-dim hover:text-terminal-text transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>

              <div className="overflow-y-auto scrollbar-thin px-4 py-4 flex-1">
                {loading && (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="h-3 bg-terminal-surface rounded animate-pulse"
                        style={{ width: `${[100, 95, 88, 92, 78, 85][i - 1]}%` }} />
                    ))}
                  </div>
                )}
                {error && (
                  <p className="text-[10px] font-mono text-terminal-dim/40 italic">
                    Analysis unavailable. The AI service may be busy — try again in a moment.
                  </p>
                )}
                {analysis && (
                  <p className="text-[11px] font-mono text-terminal-text/80 leading-relaxed whitespace-pre-wrap">
                    {analysis}
                  </p>
                )}
                {!loading && !error && !analysis && (
                  <p className="text-[10px] font-mono text-terminal-dim/40 italic">
                    No briefing available.
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Cluster card ─────────────────────────────────────────────────────────────

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
  const [activeTab,   setActiveTab]   = useState<'events' | 'deals'>('events')
  const [companyModal, setCompanyModal] = useState<string | null>(null)
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
      .filter(isFundingCluster)
      .sort((a, b) => b.volatility - a.volatility),
    [allClusters]
  )

  const techArticles = useMemo(() =>
    articles.filter(isTechArticle).slice(0, 80),
    [articles]
  )

  const TABS = [
    { id: 'events'  as const, label: 'EVENTS', icon: Cpu,        count: svClusters.length      },
    { id: 'deals'   as const, label: 'DEALS',  icon: DollarSign,  count: fundingClusters.length },
  ]

  const displayItems = activeTab === 'events' ? svClusters : fundingClusters

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Company card strip */}
      <StockStrip onCardClick={ticker => setCompanyModal(ticker)} />

      {/* AI Briefing button */}
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

      {/* Content: left = cluster feed, right = articles (always visible) */}
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
                {activeTab === 'deals' ? 'No active deal clusters' : 'No active SV clusters'}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              <AnimatePresence>
                {displayItems.map(c => (
                  <SVClusterCard key={c.id} cluster={c} onSelect={onClusterSelect} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right: live tech articles (always visible) */}
        <div className="flex-[40] min-w-0 border-l border-terminal-border overflow-y-auto scrollbar-thin">
          <div className="px-3 py-2 border-b border-terminal-border/50 flex items-center gap-2 sticky top-0 bg-terminal-bg z-10">
            <Newspaper size={10} className="text-terminal-dim" />
            <span className="text-[8px] font-mono text-terminal-dim tracking-widest">TECH NEWS</span>
            <span className="text-[7px] font-mono text-terminal-dim/30 ml-auto">{techArticles.length} stories</span>
          </div>
          {techArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-20 gap-1 text-terminal-dim/30">
              <Newspaper size={18} />
              <p className="text-[9px] font-mono">No tech articles yet</p>
            </div>
          ) : (
            techArticles.map(a => <ArticleRow key={a.id} article={a} />)
          )}
        </div>
      </div>

      {/* Company detail modal */}
      <AnimatePresence>
        {companyModal && (
          <CompanyDetailModal ticker={companyModal} onClose={() => setCompanyModal(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}