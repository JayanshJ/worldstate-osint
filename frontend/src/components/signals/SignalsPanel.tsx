import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { api } from '@/lib/api'
import { MarketSignal, SIGNAL_META, SignalType } from '@/types'
import { cn } from '@/lib/utils'

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS: Array<{ label: string; value: SignalType | 'ALL' }> = [
  { label: 'ALL',       value: 'ALL' },
  { label: 'DEALS',     value: 'DEAL' },
  { label: 'INSIDER',   value: 'INSIDER_BUY' },
  { label: 'ANALYST',   value: 'ANALYST_UPGRADE' },
  { label: 'EARNINGS',  value: 'EARNINGS_BEAT' },
  { label: 'RUMOURS',   value: 'RUMOR' },
]

// Group INSIDER_BUY / INSIDER_SELL, and ANALYST_UPGRADE / ANALYST_DOWNGRADE,
// and EARNINGS_BEAT / EARNINGS_MISS under their parent filter
const FILTER_GROUPS: Partial<Record<string, SignalType[]>> = {
  INSIDER_BUY:       ['INSIDER_BUY', 'INSIDER_SELL'],
  ANALYST_UPGRADE:   ['ANALYST_UPGRADE', 'ANALYST_DOWNGRADE'],
  EARNINGS_BEAT:     ['EARNINGS_BEAT', 'EARNINGS_MISS'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatMagnitude(sig: MarketSignal): string | null {
  if (!sig.magnitude) return null
  if (sig.signal_type === 'DEAL') {
    return sig.magnitude >= 1
      ? `$${sig.magnitude.toFixed(1)}B`
      : `$${(sig.magnitude * 1000).toFixed(0)}M`
  }
  return `${sig.magnitude > 0 ? '+' : ''}${sig.magnitude.toFixed(1)}%`
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: MarketSignal }) {
  const meta      = SIGNAL_META[signal.signal_type]
  const magnitude = formatMagnitude(signal)

  const DirectionIcon =
    signal.bullish === true  ? TrendingUp   :
    signal.bullish === false ? TrendingDown :
    Minus

  const dirColor =
    signal.bullish === true  ? 'text-green-400' :
    signal.bullish === false ? 'text-red-400'   :
    'text-terminal-dim'

  return (
    <div className="group border border-terminal-border bg-terminal-surface hover:border-terminal-accent/40 transition-colors rounded-none p-3 flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Signal type badge */}
          <span
            className="flex-shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm border"
            style={{
              color:            meta.color,
              borderColor:      meta.color + '60',
              backgroundColor:  meta.color + '15',
            }}
          >
            {meta.icon} {meta.label.toUpperCase()}
          </span>

          {/* Ticker if known */}
          {signal.ticker && (
            <span className="flex-shrink-0 text-[10px] font-mono font-bold text-terminal-accent bg-terminal-accent/10 px-1.5 py-0.5 rounded-sm">
              {signal.ticker}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Direction icon */}
          <DirectionIcon size={12} className={dirColor} />
          {/* Magnitude */}
          {magnitude && (
            <span className={cn('text-[10px] font-mono font-bold', dirColor)}>
              {magnitude}
            </span>
          )}
          {/* Time */}
          <span className="text-[9px] font-mono text-terminal-dim">
            {relativeTime(signal.published_at)}
          </span>
        </div>
      </div>

      {/* Company name */}
      <p className="text-[10px] font-mono text-terminal-dim uppercase tracking-wide truncate">
        {signal.company}
      </p>

      {/* Headline */}
      <p className="text-[11px] text-terminal-text leading-snug line-clamp-2">
        {signal.headline}
      </p>

      {/* AI impact summary */}
      {signal.ai_summary && (
        <div className="border-l-2 border-terminal-accent/40 pl-2">
          <p className="text-[10px] text-terminal-accent/80 leading-snug italic">
            {signal.ai_summary}
          </p>
        </div>
      )}

      {/* Footer: source + link */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[9px] font-mono text-terminal-dim uppercase">
          {signal.source_name}
        </span>
        <a
          href={signal.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={9} />
          VIEW FILING
        </a>
      </div>
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function SignalStats({ signals }: { signals: MarketSignal[] }) {
  const counts = signals.reduce((acc, s) => {
    acc[s.signal_type] = (acc[s.signal_type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const bullish = signals.filter(s => s.bullish === true).length
  const bearish = signals.filter(s => s.bullish === false).length

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-terminal-border bg-terminal-bg text-[9px] font-mono">
      <span className="text-terminal-dim">SIGNALS</span>
      <span className="text-terminal-text font-bold">{signals.length}</span>
      <span className="text-terminal-border">|</span>
      <span className="text-green-400">↑ {bullish} BULLISH</span>
      <span className="text-red-400">↓ {bearish} BEARISH</span>
      <span className="text-terminal-border ml-auto">|</span>
      {Object.entries(counts).slice(0, 4).map(([type, count]) => (
        <span key={type} style={{ color: SIGNAL_META[type as SignalType]?.color ?? '#aaa' }}>
          {type.replace(/_/g, ' ')} {count}
        </span>
      ))}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function SignalsPanel() {
  const [signals,     setSignals]     = useState<MarketSignal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('ALL')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.signals.list()
      setSignals(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    setError(null)
    try {
      // Refresh is async on the server — it kicks off a background job
      await api.signals.refresh()
      // Poll every 5s for up to 45s waiting for new signals to appear
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

  // Apply filter
  const filtered = signals.filter(s => {
    if (activeFilter === 'ALL') return true
    const group = FILTER_GROUPS[activeFilter]
    if (group) return group.includes(s.signal_type)
    return s.signal_type === activeFilter
  })

  return (
    <div className="flex flex-col h-full bg-terminal-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-terminal-accent tracking-widest">
            MARKET SIGNALS
          </span>
          <span className="text-[9px] font-mono text-terminal-dim">
            SEC EDGAR · NEWS FEEDS · ANALYST ACTIONS
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'FETCHING...' : 'REFRESH'}
        </button>
      </div>

      {/* Filter tabs */}
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
      {!loading && signals.length > 0 && <SignalStats signals={filtered} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-terminal-dim text-xs font-mono">
            LOADING SIGNALS...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-400 text-xs font-mono">
            ⚠ {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-terminal-dim text-xs font-mono">NO SIGNALS YET</p>
            <p className="text-terminal-dim/60 text-[10px] font-mono">
              SIGNALS POPULATE EVERY 15 MIN FROM SEC EDGAR + NEWS FEEDS
            </p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-[10px] font-mono text-terminal-accent hover:underline"
            >
              FETCH NOW →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-terminal-border">
            {filtered.map(signal => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-terminal-border">
        <p className="text-[8px] font-mono text-terminal-dim/50">
          NOT FINANCIAL ADVICE · Sources: SEC EDGAR (public filings) · Reuters · FT · Yahoo Finance · MarketWatch · AI-enriched summaries may contain inaccuracies
        </p>
      </div>
    </div>
  )
}
