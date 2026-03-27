import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { MarketSignal, SIGNAL_META, SignalType } from '@/types'
import { cn } from '@/lib/utils'

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS: Array<{ label: string; value: string }> = [
  { label: 'ALL',       value: 'ALL' },
  { label: 'DEALS',     value: 'DEAL' },
  { label: 'INSIDER',   value: 'INSIDER_BUY' },
  { label: 'ANALYST',   value: 'ANALYST_UPGRADE' },
  { label: 'EARNINGS',  value: 'EARNINGS_BEAT' },
  { label: 'RUMOURS',   value: 'RUMOR' },
]

const FILTER_GROUPS: Record<string, SignalType[]> = {
  INSIDER_BUY:     ['INSIDER_BUY', 'INSIDER_SELL'],
  ANALYST_UPGRADE: ['ANALYST_UPGRADE', 'ANALYST_DOWNGRADE'],
  EARNINGS_BEAT:   ['EARNINGS_BEAT', 'EARNINGS_MISS'],
}

// ── Action parsing ────────────────────────────────────────────────────────────

type Action = 'BUY' | 'SHORT' | 'HOLD' | 'WATCH'

const ACTION_STYLE: Record<Action, { bg: string; text: string; border: string }> = {
  BUY:   { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e', border: 'rgba(34,197,94,0.4)'  },
  SHORT: { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444', border: 'rgba(239,68,68,0.4)'  },
  HOLD:  { bg: 'rgba(234,179,8,0.15)',  text: '#eab308', border: 'rgba(234,179,8,0.4)'  },
  WATCH: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6', border: 'rgba(139,92,246,0.4)' },
}

function parseAction(ai_summary: string | null): { action: Action | null; reason: string } {
  if (!ai_summary) return { action: null, reason: '' }
  const m = ai_summary.match(/^(BUY|SHORT|HOLD|WATCH)\s*[|:–-]\s*(.+)/i)
  if (m) return { action: m[1].toUpperCase() as Action, reason: m[2].trim() }
  return { action: null, reason: ai_summary }
}

// Fallback action when Gemini hasn't enriched yet — use bullish field first
function defaultAction(sig: MarketSignal): Action {
  // bullish is set directly by the backend from signal type / 8-K item number
  if (sig.bullish === true)  return 'BUY'
  if (sig.bullish === false) return 'SHORT'
  // Signal-type fallbacks for neutral/unknown
  if (sig.signal_type === 'ANALYST_UPGRADE')   return 'BUY'
  if (sig.signal_type === 'ANALYST_DOWNGRADE') return 'SHORT'
  if (sig.signal_type === 'EARNINGS_BEAT')     return 'BUY'
  if (sig.signal_type === 'EARNINGS_MISS')     return 'SHORT'
  return 'WATCH'
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

function formatMagnitude(sig: MarketSignal): string | null {
  if (!sig.magnitude) return null
  return sig.signal_type === 'DEAL'
    ? sig.magnitude >= 1 ? `$${sig.magnitude.toFixed(1)}B` : `$${(sig.magnitude * 1000).toFixed(0)}M`
    : `${sig.magnitude > 0 ? '+' : ''}${sig.magnitude.toFixed(1)}%`
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MarketSignal }) {
  const meta      = SIGNAL_META[signal.signal_type] ?? { label: signal.signal_type, color: '#aaa', icon: '◈' }
  const { action, reason } = parseAction(signal.ai_summary)
  const displayAction = action ?? defaultAction(signal)
  const actionStyle   = ACTION_STYLE[displayAction]
  const magnitude     = formatMagnitude(signal)

  return (
    <div className="flex flex-col border border-terminal-border bg-terminal-surface hover:border-terminal-accent/30 transition-colors p-0 overflow-hidden">

      {/* Action banner — the most prominent element */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: actionStyle.bg, borderBottom: `1px solid ${actionStyle.border}` }}
      >
        <span
          className="text-[13px] font-mono font-bold tracking-widest"
          style={{ color: actionStyle.text }}
        >
          ● {displayAction}
        </span>
        <div className="flex items-center gap-2">
          {magnitude && (
            <span className="text-[10px] font-mono font-bold" style={{ color: actionStyle.text }}>
              {magnitude}
            </span>
          )}
          <span className="text-[9px] font-mono text-terminal-dim">
            {relativeTime(signal.published_at)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 px-3 py-2.5">

        {/* Signal type + ticker */}
        <div className="flex items-center gap-2">
          <span
            className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-sm border"
            style={{ color: meta.color, borderColor: meta.color + '50', backgroundColor: meta.color + '12' }}
          >
            {meta.icon} {meta.label}
          </span>
          {signal.ticker && (
            <span className="text-[10px] font-mono font-bold text-terminal-accent bg-terminal-accent/10 px-1.5 py-0.5 rounded-sm">
              {signal.ticker}
            </span>
          )}
          <span className="text-[9px] font-mono text-terminal-dim ml-auto truncate max-w-[120px]">
            {signal.source_name}
          </span>
        </div>

        {/* Company */}
        <p className="text-[9px] font-mono text-terminal-dim uppercase tracking-wide truncate">
          {signal.company}
        </p>

        {/* Headline */}
        <p className="text-[11px] text-terminal-text leading-snug line-clamp-2">
          {signal.headline}
        </p>

        {/* AI reasoning */}
        {reason ? (
          <div className="mt-0.5 rounded-sm px-2 py-1.5"
            style={{ backgroundColor: actionStyle.bg, border: `1px solid ${actionStyle.border}` }}>
            <p className="text-[10px] leading-snug" style={{ color: actionStyle.text }}>
              {reason}
            </p>
          </div>
        ) : (
          <p className="text-[9px] font-mono text-terminal-dim/50 italic">
            AI analysis pending next cycle…
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-0.5">
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors"
          >
            <ExternalLink size={9} />
            SOURCE
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip({ signals }: { signals: MarketSignal[] }) {
  const byAction = signals.reduce((acc, s) => {
    const { action } = parseAction(s.ai_summary)
    const a = action ?? defaultAction(s)
    acc[a] = (acc[a] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-terminal-border bg-terminal-bg text-[9px] font-mono flex-shrink-0">
      <span className="text-terminal-dim">{signals.length} SIGNALS</span>
      <span className="text-terminal-border">|</span>
      {(['BUY','SHORT','HOLD','WATCH'] as Action[]).map(a => (
        byAction[a] ? (
          <span key={a} style={{ color: ACTION_STYLE[a].text }}>
            {a} {byAction[a]}
          </span>
        ) : null
      ))}
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

  const ACTION_ORDER: Record<string, number> = { BUY: 0, SHORT: 1, HOLD: 2, WATCH: 3 }

  const filtered = signals
    .filter(s => {
      if (activeFilter === 'ALL') return true
      const group = FILTER_GROUPS[activeFilter]
      return group ? group.includes(s.signal_type) : s.signal_type === activeFilter
    })
    .sort((a, b) => {
      const aAction = parseAction(a.ai_summary).action ?? defaultAction(a)
      const bAction = parseAction(b.ai_summary).action ?? defaultAction(b)
      return (ACTION_ORDER[aAction] ?? 9) - (ACTION_ORDER[bAction] ?? 9)
    })

  return (
    <div className="flex flex-col h-full bg-terminal-bg">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold text-terminal-accent tracking-widest">
            MARKET SIGNALS
          </span>
          <span className="text-[9px] font-mono text-terminal-dim hidden sm:block">
            AI-RANKED · SEC EDGAR · NEWS FEEDS
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'FETCHING…' : 'REFRESH'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-terminal-border flex-shrink-0 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={cn(
              'text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors whitespace-nowrap',
              activeFilter === f.value
                ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                : 'text-terminal-dim hover:text-terminal-text border border-transparent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      {!loading && filtered.length > 0 && <StatsStrip signals={filtered} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-terminal-dim text-xs font-mono">
            LOADING SIGNALS…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-400 text-xs font-mono">
            ⚠ {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-terminal-dim text-xs font-mono">NO SIGNALS YET</p>
            <p className="text-terminal-dim/50 text-[10px] font-mono text-center px-8">
              Signals are fetched from SEC EDGAR and financial news every 15 min.
              Click REFRESH to fetch now.
            </p>
            <button onClick={handleRefresh} className="text-[10px] font-mono text-terminal-accent hover:underline">
              FETCH NOW →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-terminal-border">
            {filtered.map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-terminal-border">
        <p className="text-[8px] font-mono text-terminal-dim/40">
          NOT FINANCIAL ADVICE · AI recommendations are illustrative only · Always do your own due diligence
        </p>
      </div>
    </div>
  )
}
