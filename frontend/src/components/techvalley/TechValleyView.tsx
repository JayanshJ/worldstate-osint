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
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, DollarSign, Newspaper, RefreshCw, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import type { EventCluster, RawArticle } from '@/types'
import { getVolatilityTier, VOLATILITY_COLORS } from '@/types'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { ClusterDetailModal } from '@/components/clusters/ClusterDetailModal'
import { cn, formatAbsTime } from '@/lib/utils'
import { useTimezone } from '@/context/TimezoneContext'
import { useWebSocket } from '@/context/WebSocketContext'

// ─── SV company universe ─────────────────────────────────────────────────────

// Primary SV companies — a cluster must primarily be about these to qualify
const SV_PRIMARY = [
  'apple', 'microsoft', 'nvidia', 'alphabet', 'google', 'meta', 'amazon', 'tesla',
  'netflix', 'salesforce', 'oracle', 'intel', 'amd', 'qualcomm', 'broadcom', 'cisco',
  'openai', 'anthropic', 'xai', 'mistral', 'perplexity', 'databricks', 'stripe',
  'spacex', 'palantir', 'rivian', 'lyft', 'uber', 'airbnb', 'doordash', 'coinbase',
  'snowflake', 'cloudflare', 'crowdstrike', 'okta', 'twilio', 'slack', 'zoom',
  'sequoia', 'andreessen horowitz', 'a16z', 'y combinator', 'softbank', 'sam altman',
  'elon musk', 'mark zuckerberg', 'sundar pichai', 'satya nadella', 'jensen huang',
  'semiconductor', 'silicon valley', 'san francisco tech',
]

// Tech label keywords — cluster label must contain one of these OR 2+ primary orgs
const TECH_LABEL_KEYWORDS = [
  'ai ', 'artificial intelligence', 'machine learning', 'llm', 'chatgpt', 'gpt',
  'semiconductor', 'chip', 'microchip', 'silicon', 'tech ', 'technology',
  'startup', 'venture', 'funding', 'ipo', 'unicorn', 'software', 'hardware',
  'cloud', 'saas', 'cybersecurity', 'data center', 'gpu', 'cpu', 'smartphone',
  'autonomous', 'self-driving', 'electric vehicle', 'ev ', 'robotics', 'drone',
  'crypto', 'blockchain', 'defi', 'nft', 'web3',
  'apple', 'google', 'microsoft', 'nvidia', 'openai', 'anthropic', 'tesla',
  'meta ', 'amazon', 'netflix', 'uber', 'airbnb', 'stripe',
]

const FUNDING_KEYWORDS = [
  'raises', 'funding', 'Series A', 'Series B', 'Series C', 'IPO', 'valuation',
  'unicorn', 'acquisition', 'acquires', 'merger', 'SPAC', 'venture', 'round',
]

const TECH_SOURCE_IDS = new Set([
  'techcrunch', 'wired', 'ars_technica', 'the_verge', 'engadget',
  'mit_technology_review', 'venturebeat', 'bloomberg_tech',
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
  const orgs   = cluster.entities?.organizations ?? []
  const locs   = cluster.entities?.locations ?? []
  const label  = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()

  // 1. Label must contain a tech keyword — this is the primary gate
  const labelIsTech = TECH_LABEL_KEYWORDS.some(kw => label.includes(kw))
  if (!labelIsTech) return false

  // 2. Additionally require at least one SV primary entity in orgs, locs, or label
  const svOrgCount = orgs.filter(o => {
    const ol = o.toLowerCase()
    return SV_PRIMARY.some(sv => ol === sv || ol.startsWith(sv + ' ') || ol.includes(' ' + sv))
  }).length

  const svLocMatch = locs.some(l =>
    ['san francisco', 'silicon valley', 'bay area', 'san jose', 'cupertino',
     'menlo park', 'palo alto', 'mountain view', 'sunnyvale', 'seattle'].some(sv =>
       l.toLowerCase().includes(sv)
    )
  )

  const svLabelMatch = SV_PRIMARY.some(sv => label.includes(sv))
  const svBulletMatch = SV_PRIMARY.some(sv => bullets.includes(sv))

  return svOrgCount >= 1 || svLocMatch || svLabelMatch || svBulletMatch
}

function isFundingCluster(cluster: EventCluster): boolean {
  const label = (cluster.label ?? '').toLowerCase()
  const bullets = (cluster.bullets ?? []).join(' ').toLowerCase()
  return FUNDING_KEYWORDS.some(kw => label.includes(kw.toLowerCase()) || bullets.includes(kw.toLowerCase()))
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onClusterSelect: (id: string) => void
}

export function TechValleyView({ onClusterSelect }: Props) {
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
      .sort((a, b) => b.volatility - a.volatility),
    [allClusters]
  )

  const fundingClusters = useMemo(() =>
    allClusters
      .filter(c => isSVCluster(c) && isFundingCluster(c))
      .sort((a, b) => b.volatility - a.volatility),
    [allClusters]
  )

  const techArticles = useMemo(() =>
    articles
      .filter(a => {
        if (!a.title) return false
        const src   = a.source_id ?? ''
        const title = a.title.toLowerCase()
        // Dedicated tech sources always included
        if (TECH_SOURCE_IDS.has(src)) return true
        // For general sources, require a tech keyword AND SV primary entity in title
        const hasTechKw   = TECH_LABEL_KEYWORDS.some(kw => title.includes(kw))
        const hasSVEntity = SV_PRIMARY.some(sv => title.includes(sv))
        return hasTechKw && hasSVEntity
      })
      .slice(0, 60),
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
      <StockStrip onTickerClick={ticker => (window.location.href = `/splc/${ticker}`)} />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-terminal-border bg-terminal-surface/30 flex-shrink-0">
        <div className="flex-1 flex items-center gap-1">
          {TABS.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors',
                activeTab === id
                  ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                  : 'text-terminal-dim hover:text-terminal-text border border-transparent',
              )}
            >
              <Icon size={9} />
              {label}
              <span className={cn(
                'text-[8px] font-mono',
                activeTab === id ? 'text-terminal-accent' : 'text-terminal-dim/40'
              )}>({count})</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1 text-[8px] font-mono text-terminal-dim/50 hover:text-terminal-dim transition-colors px-2"
        >
          <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
          REFRESH
        </button>

        <div className="text-[8px] font-mono text-terminal-dim/30">
          {svClusters.length} SV clusters · {techArticles.length} tech articles
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
