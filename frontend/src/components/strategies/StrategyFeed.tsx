import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, TrendingUp, Loader2, Zap, BarChart3, AlertTriangle, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { MarketStrategy, AssetClass, StrategyPerformance } from '@/types'
import { ASSET_CLASS_COLORS } from '@/types'
import { useWebSocket } from '@/context/WebSocketContext'
import { StrategyCard } from './StrategyCard'
import { cn } from '@/lib/utils'

// ─── Asset class filter tabs ──────────────────────────────────────────────────

type FilterTab = 'ALL' | AssetClass

const FILTER_TABS: FilterTab[] = ['ALL', 'COMMODITY', 'EQUITY', 'FOREX', 'CRYPTO', 'BONDS', 'VOLATILITY']

const FILTER_LABELS: Record<FilterTab, string> = {
  ALL:        'All',
  COMMODITY:  'Commodities',
  EQUITY:     'Equities',
  FOREX:      'Forex',
  CRYPTO:     'Crypto',
  BONDS:      'Bonds',
  VOLATILITY: 'Volatility',
}

// ─── Market sentiment header ──────────────────────────────────────────────────

function SentimentGauge({ label, value, min = -1, max = 1, isVol = false }: {
  label: string; value: number; min?: number; max?: number; isVol?: boolean
}) {
  const pct = ((value - min) / (max - min)) * 100
  const color = isVol
    ? value >= 0.7 ? '#ef4444' : value >= 0.4 ? '#f97316' : '#22c55e'
    : value <= -0.3 ? '#ef4444' : value >= 0.3 ? '#22c55e' : '#eab308'

  return (
    <div className="flex flex-col gap-1 min-w-[90px]">
      <span className="font-mono text-[9px] text-terminal-dim tracking-widest uppercase">{label}</span>
      <div className="h-1 bg-terminal-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(4, pct)}%`, background: color }}
        />
      </div>
      <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color }}>
        {isVol ? value.toFixed(2) : (value >= 0 ? '+' : '') + value.toFixed(2)}
      </span>
    </div>
  )
}

// ─── Win Rate Strip ───────────────────────────────────────────────────────────

function WinRateStrip({ perf }: { perf: StrategyPerformance }) {
  const { overall } = perf
  if (!overall.with_4h && !overall.with_24h) return null
  const r4  = overall.rate_4h
  const r24 = overall.rate_24h
  const color4  = r4  === null ? '#4b5563' : r4  >= 55 ? '#22c55e' : r4  >= 45 ? '#eab308' : '#ef4444'
  const color24 = r24 === null ? '#4b5563' : r24 >= 55 ? '#22c55e' : r24 >= 45 ? '#eab308' : '#ef4444'
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-terminal-border bg-terminal-surface/50 text-[9px] font-mono">
      <span className="text-terminal-dim tracking-widest">BACKTEST</span>
      {r4 !== null && (
        <span>
          <span className="text-terminal-dim">4H </span>
          <span style={{ color: color4 }} className="font-bold">{r4.toFixed(0)}%</span>
          <span className="text-terminal-dim"> ({overall.with_4h} tracked)</span>
        </span>
      )}
      {r24 !== null && (
        <span>
          <span className="text-terminal-dim">24H </span>
          <span style={{ color: color24 }} className="font-bold">{r24.toFixed(0)}%</span>
          <span className="text-terminal-dim"> ({overall.with_24h} tracked)</span>
        </span>
      )}
    </div>
  )
}

// ─── StrategyFeed ─────────────────────────────────────────────────────────────

interface Props {
  onClusterSelect?: (id: string) => void
}

export function StrategyFeed({ onClusterSelect }: Props) {
  const [strategies,     setStrategies]     = useState<MarketStrategy[]>([])
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [activeFilter,   setActiveFilter]   = useState<FilterTab>('ALL')
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)
  const [performance,    setPerformance]    = useState<StrategyPerformance | null>(null)
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(
    () => sessionStorage.getItem('strategy_disclaimer_dismissed') === '1'
  )

  const { lastStrategyUpdate } = useWebSocket()

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    api.strategies.list()
      .then(data => { setStrategies(data); if (data.length) setLastUpdated(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
    api.strategies.performance()
      .then(setPerformance)
      .catch(() => {})
  }, [])

  // ── Real-time WebSocket updates ────────────────────────────────────────────
  useEffect(() => {
    if (!lastStrategyUpdate?.length) return
    setStrategies(lastStrategyUpdate)
    setLastUpdated(new Date())
  }, [lastStrategyUpdate])

  // ── Manual refresh ─────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await api.strategies.refresh()
      // The WS broadcast will deliver the new strategies; also poll as fallback
      const updated = await api.strategies.list()
      setStrategies(updated)
      setLastUpdated(new Date())
    } catch {
      // silent fail
    } finally {
      setRefreshing(false)
    }
  }, [])

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = activeFilter === 'ALL'
    ? strategies
    : strategies.filter(s => s.asset_class === activeFilter)

  const avgVol  = strategies.length ? strategies.reduce((a, s) => a + s.volatility_context, 0) / strategies.length : 0
  const avgSent = strategies.length ? strategies.reduce((a, s) => a + s.sentiment_context,  0) / strategies.length : 0

  const longCount  = strategies.filter(s => s.direction === 'LONG').length
  const shortCount = strategies.filter(s => s.direction === 'SHORT').length

  const dismissDisclaimer = useCallback(() => {
    sessionStorage.setItem('strategy_disclaimer_dismissed', '1')
    setDisclaimerDismissed(true)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-terminal-bg overflow-hidden">

      {/* ── Legal disclaimer banner ─────────────────────────────────────── */}
      {!disclaimerDismissed && (
        <div className="flex-shrink-0 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-start gap-3">
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[11px] font-bold text-amber-400 tracking-wider mb-0.5">
              IMPORTANT — NOT FINANCIAL ADVICE
            </p>
            <p className="font-mono text-[10px] text-amber-400/70 leading-relaxed">
              These signals are AI-generated research summaries based on news clustering. They have NOT been backtested,
              do not represent investment advice, and must not be used as the sole basis for any trading decision.
              Past signal accuracy does not predict future performance. Consult a qualified financial adviser before investing.
            </p>
          </div>
          <button
            onClick={dismissDisclaimer}
            className="flex-shrink-0 text-amber-400/50 hover:text-amber-400 transition-colors"
            title="Dismiss (this session only)"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-terminal-border bg-terminal-surface">
        <div className="flex items-end justify-between px-4 py-3">
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-terminal-dim mb-0.5">
              § 03 · Alpha signals
              {strategies.length > 0 && (
                <span className="ml-2 text-terminal-accent/70">{strategies.length} ACTIVE</span>
              )}
            </p>
            <h2 className="font-serif text-[20px] leading-none tracking-[-0.01em] text-terminal-text">
              Strategies, <em className="italic text-terminal-accent">quantified.</em>
            </h2>
          </div>

          <div className="flex items-center gap-3 pb-0.5">
            {lastUpdated && (
              <span className="font-mono text-[9px] text-terminal-dim/60">
                {lastUpdated.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 font-mono text-[9px] text-terminal-dim hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/40 px-2 py-1 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
              REFRESH
            </button>
          </div>
        </div>

        {/* Market context bar */}
        {strategies.length > 0 && (
          <div className="flex items-center gap-6 px-4 pb-3">
            <SentimentGauge label="Market Fear" value={avgVol}  min={0} max={1} isVol />
            <SentimentGauge label="Sentiment"   value={avgSent} min={-1} max={1} />
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] text-terminal-dim tracking-widest uppercase">Bias</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold" style={{ color: '#22c55e' }}>
                  ▲ {longCount}L
                </span>
                <span className="font-mono text-[11px] font-bold" style={{ color: '#ef4444' }}>
                  ▼ {shortCount}S
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Win rate strip */}
        {performance && <WinRateStrip perf={performance} />}

        {/* Filter tabs */}
        <div className="flex items-center gap-0 px-4 pb-0 overflow-x-auto scrollbar-none">
          {FILTER_TABS.map(tab => {
            const color  = tab === 'ALL' ? '#d89b4a' : ASSET_CLASS_COLORS[tab as AssetClass]
            const count  = tab === 'ALL' ? strategies.length : strategies.filter(s => s.asset_class === tab).length
            const active = activeFilter === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={cn(
                  'flex items-center gap-1.5 font-mono text-[10px] tracking-wider px-3 py-2 border-b-2 transition-colors whitespace-nowrap',
                  active
                    ? 'border-b-current text-terminal-text'
                    : 'border-transparent text-terminal-dim hover:text-terminal-text',
                )}
                style={active ? { color, borderBottomColor: color } : {}}
              >
                {FILTER_LABELS[tab]}
                {count > 0 && (
                  <span
                    className="text-[8px] px-1"
                    style={active
                      ? { color, background: `${color}20` }
                      : { color: 'inherit', opacity: 0.6 }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-terminal-dim font-mono text-xs">
            <Loader2 size={14} className="animate-spin text-terminal-accent" />
            Loading strategies...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-terminal-dim/50 font-mono text-xs px-8 text-center">
            <BarChart3 size={32} className="text-terminal-dim/20" />
            {strategies.length === 0 ? (
              <>
                <p className="text-sm">Generating alpha...</p>
                <p className="text-[10px] leading-relaxed">
                  The strategy engine runs every 15 minutes once enough intelligence clusters accumulate.
                  Click REFRESH to trigger generation now.
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-terminal-accent border border-terminal-accent/30 px-3 py-1.5 rounded-sm hover:bg-terminal-accent/10 transition-colors disabled:opacity-50"
                >
                  <TrendingUp size={11} />
                  Generate Now
                </button>
              </>
            ) : (
              <p>No {activeFilter.toLowerCase()} strategies in current cycle.</p>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <div className="divide-y divide-terminal-border/30">
              {filtered.map((strategy, idx) => (
                <motion.div
                  key={strategy.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.04 }}
                >
                  <StrategyCard
                    strategy={strategy}
                    onClusterSelect={onClusterSelect}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="flex-shrink-0 border-t border-terminal-border px-4 py-2 bg-terminal-surface/30 flex items-center gap-2">
          <AlertTriangle size={9} className="text-amber-500/60 flex-shrink-0" />
          <p className="font-mono text-[9px] text-terminal-dim/60">
            AI research only · Not financial advice · Live backtested · Refreshes every 15 min
          </p>
        </div>
      )}
    </div>
  )
}
