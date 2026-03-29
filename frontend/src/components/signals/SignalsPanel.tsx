import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Search, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { MarketSignal, SIGNAL_META, SignalType } from '@/types'
import { cn } from '@/lib/utils'

// ── Action definitions (consumer-friendly) ────────────────────────────────────

type Action = 'BUY' | 'SELL' | 'HOLD' | 'WATCH'

const ACTION_ORDER: Record<Action, number> = { BUY: 0, SELL: 1, HOLD: 2, WATCH: 3 }

const ACTION_CONFIG: Record<Action, {
  label: string
  pill: string
  description: string
  icon: React.ReactNode
  bg: string
  text: string
  border: string
}> = {
  BUY: {
    label: 'Buy Opportunity',
    pill: '📈 Buy',
    description: 'Signals suggest this stock may be worth buying',
    icon: <TrendingUp size={13} />,
    bg: 'rgba(34,197,94,0.12)',
    text: '#22c55e',
    border: 'rgba(34,197,94,0.35)',
  },
  SELL: {
    label: 'Sell Alert',
    pill: '📉 Sell',
    description: 'Signals suggest reducing or avoiding this position',
    icon: <TrendingDown size={13} />,
    bg: 'rgba(239,68,68,0.12)',
    text: '#ef4444',
    border: 'rgba(239,68,68,0.35)',
  },
  HOLD: {
    label: 'Hold',
    pill: '⏸ Hold',
    description: 'No strong reason to buy or sell right now',
    icon: <Minus size={13} />,
    bg: 'rgba(234,179,8,0.12)',
    text: '#eab308',
    border: 'rgba(234,179,8,0.35)',
  },
  WATCH: {
    label: 'Worth Watching',
    pill: '👁 Watch',
    description: 'Keep this on your radar — story is still developing',
    icon: <Eye size={13} />,
    bg: 'rgba(139,92,246,0.12)',
    text: '#8b5cf6',
    border: 'rgba(139,92,246,0.35)',
  },
}

// ── Category filters (plain English) ──────────────────────────────────────────

const FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All',            value: 'ALL' },
  { label: 'M&A Deals',      value: 'DEAL' },
  { label: 'Insider Moves',  value: 'INSIDER_BUY' },
  { label: 'Expert Picks',   value: 'ANALYST_UPGRADE' },
  { label: 'Earnings',       value: 'EARNINGS_BEAT' },
  { label: 'Rumours',        value: 'RUMOR' },
]

const FILTER_GROUPS: Record<string, SignalType[]> = {
  INSIDER_BUY:     ['INSIDER_BUY', 'INSIDER_SELL'],
  ANALYST_UPGRADE: ['ANALYST_UPGRADE', 'ANALYST_DOWNGRADE'],
  EARNINGS_BEAT:   ['EARNINGS_BEAT', 'EARNINGS_MISS'],
}

// Consumer-friendly labels for signal types
const SIGNAL_PLAIN: Record<SignalType, string> = {
  DEAL:               'Merger & Acquisition',
  INSIDER_BUY:        'Company insider buying stock',
  INSIDER_SELL:       'Company insider selling stock',
  ANALYST_UPGRADE:    'Expert raised their rating',
  ANALYST_DOWNGRADE:  'Expert lowered their rating',
  EARNINGS_BEAT:      'Company beat expectations',
  EARNINGS_MISS:      'Company missed expectations',
  RUMOR:              'Market rumour / report',
}

// ── Action parsing ────────────────────────────────────────────────────────────

function parseAction(ai_summary: string | null): { action: Action | null; reason: string } {
  if (!ai_summary) return { action: null, reason: '' }
  // Legacy SHORT → SELL mapping
  const normalised = ai_summary.replace(/^SHORT\s*[|:–-]/i, 'SELL |')
  const m = normalised.match(/^(BUY|SELL|SHORT|HOLD|WATCH)\s*[|:–-]\s*(.+)/i)
  if (m) {
    const raw = m[1].toUpperCase()
    const action: Action = raw === 'SHORT' ? 'SELL' : raw as Action
    return { action, reason: m[2].trim() }
  }
  return { action: null, reason: ai_summary }
}

function defaultAction(sig: MarketSignal): Action {
  if (sig.bullish === true)  return 'BUY'
  if (sig.bullish === false) return 'SELL'
  if (sig.signal_type === 'ANALYST_UPGRADE')   return 'BUY'
  if (sig.signal_type === 'ANALYST_DOWNGRADE') return 'SELL'
  if (sig.signal_type === 'EARNINGS_BEAT')     return 'BUY'
  if (sig.signal_type === 'EARNINGS_MISS')     return 'SELL'
  return 'WATCH'
}

function getAction(sig: MarketSignal): Action {
  return parseAction(sig.ai_summary).action ?? defaultAction(sig)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

function dealSize(sig: MarketSignal): string | null {
  if (!sig.magnitude || sig.signal_type !== 'DEAL') return null
  return sig.magnitude >= 1
    ? `$${sig.magnitude.toFixed(1)}B deal`
    : `$${(sig.magnitude * 1000).toFixed(0)}M deal`
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MarketSignal }) {
  const meta    = SIGNAL_META[signal.signal_type]
  const plain   = SIGNAL_PLAIN[signal.signal_type] ?? meta.label
  const { action, reason } = parseAction(signal.ai_summary)
  const act     = action ?? defaultAction(signal)
  const cfg     = ACTION_CONFIG[act]
  const deal    = dealSize(signal)

  return (
    <div className="flex flex-col bg-terminal-surface border border-terminal-border hover:border-terminal-accent/20 transition-colors overflow-hidden">

      {/* Action banner */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: cfg.bg, borderBottom: `1px solid ${cfg.border}` }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[13px]" style={{ color: cfg.text }}>{cfg.icon}</span>
          <span className="text-[11px] font-semibold" style={{ color: cfg.text }}>
            {cfg.label}
          </span>
          {deal && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: cfg.border, color: cfg.text }}>
              {deal}
            </span>
          )}
          {(act === 'BUY' || act === 'SELL') && (
            <span
              className="text-[11px] font-bold font-mono px-2 py-0.5 rounded"
              style={{ backgroundColor: cfg.text, color: '#0a0e14' }}
            >
              {act === 'BUY' ? '↑ Buy' : '↓ Sell'} {signal.ticker ?? signal.company.split(' ')[0]}
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono text-terminal-dim">{relativeTime(signal.published_at)}</span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 px-3 py-3">

        {/* Company + signal type */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              {signal.ticker && (
                <span className="text-[11px] font-bold font-mono text-terminal-accent bg-terminal-accent/10 px-1.5 py-0.5 rounded-sm flex-shrink-0">
                  {signal.ticker}
                </span>
              )}
              <span className="text-[11px] font-medium text-terminal-text truncate">
                {signal.company}
              </span>
            </div>
            <span className="text-[9px] text-terminal-dim">{plain}</span>
          </div>
        </div>

        {/* What happened */}
        <p className="text-[12px] text-terminal-text leading-snug">
          {signal.headline}
        </p>

        {/* What it means */}
        {reason ? (
          <div className="rounded px-2.5 py-2" style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <p className="text-[9px] font-mono text-terminal-dim/70 mb-0.5 uppercase tracking-widest">What this means</p>
            <p className="text-[11px] leading-snug" style={{ color: cfg.text }}>
              {reason}
            </p>
          </div>
        ) : (
          <div className="rounded px-2.5 py-1.5 bg-terminal-bg border border-terminal-border">
            <p className="text-[10px] text-terminal-dim/50 italic">Analysing signal…</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[9px] text-terminal-dim/50">{signal.source_name}</span>
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors"
          >
            Read more <ExternalLink size={9} />
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Company group header ──────────────────────────────────────────────────────

type SignalCluster = {
  key: string
  ticker: string | null
  company: string
  signals: MarketSignal[]
  dominantAction: Action
  actionCounts: Partial<Record<Action, number>>
}

function clusterSignals(signals: MarketSignal[]): SignalCluster[] {
  const groups = new Map<string, MarketSignal[]>()
  for (const s of signals) {
    const key = s.ticker ?? s.company
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  return Array.from(groups.values())
    .map(sigs => {
      const actionCounts: Partial<Record<Action, number>> = {}
      for (const s of sigs) {
        const a = getAction(s)
        actionCounts[a] = (actionCounts[a] ?? 0) + 1
      }
      const dominantAction = (['BUY', 'SELL', 'HOLD', 'WATCH'] as Action[])
        .find(a => actionCounts[a]) ?? 'WATCH'
      return {
        key: sigs[0].ticker ?? sigs[0].company,
        ticker: sigs[0].ticker,
        company: sigs[0].company,
        signals: [...sigs].sort((a, b) => ACTION_ORDER[getAction(a)] - ACTION_ORDER[getAction(b)]),
        dominantAction,
        actionCounts,
      }
    })
    .sort((a, b) => ACTION_ORDER[a.dominantAction] - ACTION_ORDER[b.dominantAction])
}

function GroupHeader({ cluster }: { cluster: SignalCluster }) {
  if (cluster.signals.length <= 1) return null
  const cfg = ACTION_CONFIG[cluster.dominantAction]
  return (
    <div
      className="col-span-full flex items-center gap-3 px-3 py-2 border border-terminal-border"
      style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      <span className="text-[12px] font-bold text-terminal-text">
        {cluster.ticker ?? cluster.company}
      </span>
      <span className="text-[9px] text-terminal-dim">{cluster.company}</span>
      <span className="ml-auto text-[9px] font-mono" style={{ color: cfg.text }}>
        {cluster.signals.length} signals
      </span>
      {(['BUY', 'SELL', 'HOLD', 'WATCH'] as Action[]).map(a =>
        cluster.actionCounts[a] ? (
          <span key={a} className="text-[9px] font-mono" style={{ color: ACTION_CONFIG[a].text }}>
            {cluster.actionCounts[a]} {ACTION_CONFIG[a].label}
          </span>
        ) : null
      )}
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ signals }: { signals: MarketSignal[] }) {
  const counts = signals.reduce((acc, s) => {
    const a = getAction(s); acc[a] = (acc[a] ?? 0) + 1; return acc
  }, {} as Partial<Record<Action, number>>)

  const parts: string[] = []
  if (counts.BUY)   parts.push(`${counts.BUY} buy ${counts.BUY === 1 ? 'opportunity' : 'opportunities'}`)
  if (counts.SELL)  parts.push(`${counts.SELL} sell ${counts.SELL === 1 ? 'alert' : 'alerts'}`)
  if (counts.HOLD)  parts.push(`${counts.HOLD} hold`)
  if (counts.WATCH) parts.push(`${counts.WATCH} to watch`)

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-bg text-[10px] flex-shrink-0 flex-wrap">
      <span className="text-terminal-dim font-mono">{signals.length} signals today</span>
      {parts.length > 0 && <span className="text-terminal-border font-mono">·</span>}
      {counts.BUY  ? <span style={{ color: ACTION_CONFIG.BUY.text  }}>{counts.BUY} buy {counts.BUY === 1 ? 'opportunity' : 'opportunities'}</span>  : null}
      {counts.SELL ? <span style={{ color: ACTION_CONFIG.SELL.text }}>{counts.SELL} sell {counts.SELL === 1 ? 'alert' : 'alerts'}</span> : null}
      {counts.HOLD ? <span style={{ color: ACTION_CONFIG.HOLD.text }}>{counts.HOLD} hold</span> : null}
      {counts.WATCH? <span style={{ color: ACTION_CONFIG.WATCH.text}}>{counts.WATCH} to watch</span> : null}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SignalsPanel() {
  const [signals,      setSignals]      = useState<MarketSignal[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [activeAction, setActiveAction] = useState<Action | 'ALL'>('ALL')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [grouped,      setGrouped]      = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      setSignals(await api.signals.list())
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 5 * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await api.signals.refresh()
      for (let i = 0; i < 9; i++) {
        await new Promise(r => setTimeout(r, 5000))
        await load()
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = signals
    .filter(s => {
      if (activeFilter !== 'ALL') {
        const group = FILTER_GROUPS[activeFilter]
        if (group ? !group.includes(s.signal_type) : s.signal_type !== activeFilter) return false
      }
      if (activeAction !== 'ALL' && getAction(s) !== activeAction) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return s.ticker?.toLowerCase().includes(q) ||
               s.company?.toLowerCase().includes(q) ||
               s.headline?.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => ACTION_ORDER[getAction(a)] - ACTION_ORDER[getAction(b)])

  const clusters = clusterSignals(filtered)

  return (
    <div className="flex flex-col h-full bg-terminal-bg">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold text-terminal-accent tracking-widest">
            INVESTMENT SIGNALS
          </span>
          <span className="text-[9px] font-mono text-terminal-dim hidden sm:block">
            Insider filings · Analyst ratings · Earnings · Deals
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Fetching…' : 'Refresh'}
        </button>
      </div>

      {/* Category filters + search */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-terminal-border flex-shrink-0 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={cn(
              'text-[9px] font-mono tracking-wide px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap',
              activeFilter === f.value
                ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                : 'text-terminal-dim hover:text-terminal-text border border-transparent',
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 border border-terminal-border rounded-sm px-2 py-1 bg-terminal-surface min-w-[130px]">
          <Search size={9} className="text-terminal-dim flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search stocks…"
            className="bg-transparent text-[9px] font-mono text-terminal-text placeholder:text-terminal-dim/50 outline-none w-full"
          />
        </div>
      </div>

      {/* Action filters + group toggle */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-terminal-border flex-shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveAction('ALL')}
          className={cn(
            'text-[9px] font-mono tracking-wide px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap border',
            activeAction === 'ALL'
              ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
              : 'text-terminal-dim hover:text-terminal-text border-transparent',
          )}
        >
          All Actions
        </button>
        {(['BUY', 'SELL', 'HOLD', 'WATCH'] as Action[]).map(a => {
          const cfg = ACTION_CONFIG[a]
          const active = activeAction === a
          return (
            <button
              key={a}
              onClick={() => setActiveAction(a)}
              className="text-[9px] font-mono tracking-wide px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap border"
              style={active ? {
                backgroundColor: cfg.bg,
                color: cfg.text,
                borderColor: cfg.border,
              } : { color: '#6b7280', borderColor: 'transparent' }}
            >
              {cfg.pill}
            </button>
          )
        })}
        <button
          onClick={() => setGrouped(g => !g)}
          className={cn(
            'ml-auto text-[9px] font-mono tracking-wide px-2.5 py-1 rounded-sm transition-colors border whitespace-nowrap',
            grouped
              ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
              : 'text-terminal-dim hover:text-terminal-text border-transparent',
          )}
        >
          Group by company
        </button>
      </div>

      {/* Summary bar */}
      {!loading && filtered.length > 0 && <SummaryBar signals={filtered} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-terminal-dim text-xs font-mono">
            Loading signals…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-400 text-xs font-mono">
            ⚠ {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center">
            <p className="text-terminal-dim text-sm">No signals found</p>
            <p className="text-terminal-dim/50 text-xs">
              Signals are sourced from SEC filings, analyst reports, and financial news every 15 minutes.
            </p>
            <button onClick={handleRefresh} className="text-[11px] font-mono text-terminal-accent hover:underline">
              Fetch now →
            </button>
          </div>
        ) : grouped ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-terminal-border p-px">
            {clusters.flatMap(cluster => {
              const items: React.ReactNode[] = []
              if (cluster.signals.length > 1) {
                items.push(<GroupHeader key={`hdr-${cluster.key}`} cluster={cluster} />)
              }
              cluster.signals.forEach(s => items.push(<SignalCard key={s.id} signal={s} />))
              return items
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-terminal-border p-px">
            {filtered.map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-terminal-border">
        <p className="text-[8px] font-mono text-terminal-dim/40">
          Not financial advice · AI analysis is for informational purposes only · Always do your own research before investing
        </p>
      </div>
    </div>
  )
}
