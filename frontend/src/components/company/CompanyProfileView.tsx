/**
 * CompanyProfileView — Bloomberg-style company deep-dive.
 *
 * Tabs: OVERVIEW · HOLDERS · ANALYSTS · BOARD
 *
 * Data source: GET /api/v1/company/{ticker}  (yfinance + LLM, Redis cached)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart2, Building2, RefreshCw, Search, Users, TrendingUp, BookOpen,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { CompanyProfile, CompanyShareholder, AnalystRating, BoardMember } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(digits)}T`
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(digits)}B`
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(digits)}M`
  if (Math.abs(n) >= 1e3)  return `$${(n / 1e3).toFixed(digits)}K`
  return `$${n.toFixed(digits)}`
}

function fmtShares(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

const INDUSTRY_COLOR: Record<string, string> = {
  SECTOR:        'text-sky-400 border-sky-400/30 bg-sky-400/8',
  INDUSTRY:      'text-emerald-400 border-emerald-400/30 bg-emerald-400/8',
  SIC:           'text-amber-400 border-amber-400/30 bg-amber-400/8',
  GICS_INDUSTRY: 'text-purple-400 border-purple-400/30 bg-purple-400/8',
  GICS_SECTOR:   'text-rose-400 border-rose-400/30 bg-rose-400/8',
}

const RATING_COLOR = { BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 bg-terminal-surface border border-terminal-border/60 rounded-sm">
      <span className="text-[8px] font-mono text-terminal-dim/60 tracking-widest">{label}</span>
      <span className="text-[13px] font-mono text-terminal-text font-semibold leading-tight">{value}</span>
      {sub && <span className="text-[8px] font-mono text-terminal-dim/50">{sub}</span>}
    </div>
  )
}

// OVERVIEW tab ─────────────────────────────────────────────────────────────────
function OverviewTab({ p }: { p: CompanyProfile }) {
  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">

      {/* Industries */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-2">CLASSIFICATIONS</h3>
        <div className="flex flex-wrap gap-1.5">
          {p.industries.map((ind, i) => (
            <span key={i}
              className={cn('text-[9px] font-mono px-2 py-0.5 rounded border tracking-wide',
                INDUSTRY_COLOR[ind.type] ?? 'text-terminal-dim border-terminal-border/40 bg-transparent')}>
              {ind.label}
              <span className="ml-1 opacity-40 text-[7.5px]">{ind.type.replace('_', ' ')}</span>
            </span>
          ))}
          {p.industries.length === 0 && (
            <span className="text-[9px] font-mono text-terminal-dim/40">No classifications available</span>
          )}
        </div>
      </section>

      {/* Key Stats */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-2">KEY METRICS</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <StatBox label="MARKET CAP"    value={fmt(p.market_cap)}          sub={p.currency} />
          <StatBox label="PRICE"         value={p.current_price ? `$${p.current_price.toFixed(2)}` : '—'} />
          <StatBox label="P/E RATIO"     value={p.pe_ratio     ? p.pe_ratio.toFixed(1)     : '—'} sub="trailing" />
          <StatBox label="FWD P/E"       value={p.forward_pe   ? p.forward_pe.toFixed(1)   : '—'} sub="forward" />
          <StatBox label="DIV YIELD"     value={p.dividend_yield > 0 ? pct(p.dividend_yield) : '—'} />
          <StatBox label="BETA"          value={p.beta         ? p.beta.toFixed(2)          : '—'} />
          <StatBox label="52W HIGH"      value={p.fifty_two_week_high ? `$${p.fifty_two_week_high.toFixed(2)}` : '—'} />
          <StatBox label="52W LOW"       value={p.fifty_two_week_low  ? `$${p.fifty_two_week_low.toFixed(2)}`  : '—'} />
          <StatBox label="AVG VOLUME"    value={p.avg_volume   ? fmtShares(p.avg_volume)    : '—'} />
          <StatBox label="EMPLOYEES"     value={p.employees    ? p.employees.toLocaleString() : '—'} />
          <StatBox label="EXCHANGE"      value={p.exchange     || '—'} />
          <StatBox label="COUNTRY"       value={p.country      || '—'} />
        </div>
      </section>

      {/* Description */}
      {p.description && (
        <section>
          <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-2">BUSINESS DESCRIPTION</h3>
          <p className="text-[11px] font-mono text-terminal-dim leading-relaxed max-w-3xl">
            {p.description}
          </p>
          {p.website && (
            <a href={p.website} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-[9px] font-mono text-terminal-accent/70 hover:text-terminal-accent underline">
              {p.website}
            </a>
          )}
        </section>
      )}
    </div>
  )
}

// HOLDERS tab ──────────────────────────────────────────────────────────────────
function HoldersTab({ p }: { p: CompanyProfile }) {
  const { shareholders: sh } = p
  const allHolders = [...sh.institutions, ...sh.mutual_funds]
    .sort((a, b) => b.pct_held - a.pct_held)
  const maxPct = Math.max(...allHolders.map(h => h.pct_held), 1)

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">

      {/* Ownership breakdown */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-3">OWNERSHIP STRUCTURE</h3>
        <div className="flex gap-6 flex-wrap">
          {[
            { label: 'INSIDER',       value: sh.insider_pct,     color: '#f59e0b' },
            { label: 'INSTITUTIONS',  value: sh.institution_pct, color: '#22c55e' },
            { label: 'FLOAT / OTHER', value: Math.max(0, 100 - sh.insider_pct - sh.institution_pct), color: '#5a6380' },
          ].map(item => (
            <div key={item.label} className="flex flex-col gap-1 min-w-[80px]">
              <span className="text-[8px] font-mono text-terminal-dim/50 tracking-widest">{item.label}</span>
              <span className="text-[18px] font-mono font-bold" style={{ color: item.color }}>
                {item.value.toFixed(1)}%
              </span>
              <div className="w-full h-1 bg-terminal-border/30 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(item.value, 100)}%`, backgroundColor: item.color, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top shareholders table */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-2">
          TOP SHAREHOLDERS ({allHolders.length})
        </h3>
        {allHolders.length === 0 ? (
          <p className="text-[10px] font-mono text-terminal-dim/40 py-4">No shareholder data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-terminal-border/40">
                  {['HOLDER', 'TYPE', 'SHARES', '% HELD', 'VALUE', 'BAR', 'REPORTED'].map(h => (
                    <th key={h} className="text-left text-[7.5px] font-mono text-terminal-dim/40 tracking-widest pb-1.5 pr-4 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allHolders.map((holder, i) => (
                  <tr key={i} className="border-b border-terminal-border/20 hover:bg-terminal-surface/40 transition-colors">
                    <td className="py-1.5 pr-4 text-[10px] font-mono text-terminal-text">{holder.name}</td>
                    <td className="py-1.5 pr-4">
                      <span className={cn('text-[7.5px] font-mono px-1.5 py-0.5 rounded border',
                        holder.type === 'INSTITUTION' ? 'text-sky-400 border-sky-400/30 bg-sky-400/8' : 'text-purple-400 border-purple-400/30 bg-purple-400/8')}>
                        {holder.type === 'INSTITUTION' ? 'INST' : 'MF'}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-[10px] font-mono text-terminal-dim">{fmtShares(holder.shares)}</td>
                    <td className="py-1.5 pr-4 text-[10px] font-mono text-emerald-400 font-semibold">{pct(holder.pct_held)}</td>
                    <td className="py-1.5 pr-4 text-[10px] font-mono text-terminal-dim">{fmt(holder.value)}</td>
                    <td className="py-1.5 pr-4 w-24">
                      <div className="w-full h-1.5 bg-terminal-border/25 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/60"
                          style={{ width: `${(holder.pct_held / maxPct) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 text-[9px] font-mono text-terminal-dim/50">
                      {holder.date_reported?.slice(0, 10) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ANALYSTS tab ─────────────────────────────────────────────────────────────────
function AnalystsTab({ p }: { p: CompanyProfile }) {
  const { analysts: a } = p
  const total = a.rating_counts.buy + a.rating_counts.hold + a.rating_counts.sell || 1
  const buyPct  = (a.rating_counts.buy  / total) * 100
  const holdPct = (a.rating_counts.hold / total) * 100
  const sellPct = (a.rating_counts.sell / total) * 100

  const pt = a.price_target
  const priceRange = pt.high - pt.low || 1
  const currentPct = pt.current > 0 ? ((pt.current - pt.low) / priceRange) * 100 : -1
  const meanPct    = pt.mean    > 0 ? ((pt.mean    - pt.low) / priceRange) * 100 : -1

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto h-full">

      {/* Rating distribution */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-3">
          ANALYST CONSENSUS  <span className="text-terminal-accent/60">({a.total_analysts} analysts)</span>
        </h3>
        <div className="flex flex-col gap-2 max-w-sm">
          {([
            { label: 'BUY',  count: a.rating_counts.buy,  pct: buyPct,  color: '#22c55e' },
            { label: 'HOLD', count: a.rating_counts.hold, pct: holdPct, color: '#f59e0b' },
            { label: 'SELL', count: a.rating_counts.sell, pct: sellPct, color: '#ef4444' },
          ] as const).map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-8 text-[9px] font-mono font-bold" style={{ color: row.color }}>{row.label}</span>
              <div className="flex-1 h-3 bg-terminal-border/25 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm transition-all"
                  style={{ width: `${row.pct}%`, backgroundColor: row.color, opacity: 0.75 }} />
              </div>
              <span className="w-12 text-right text-[10px] font-mono text-terminal-dim">
                {row.count} <span className="opacity-50">({row.pct.toFixed(0)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Price target gauge */}
      {(pt.high > 0 || pt.mean > 0) && (
        <section>
          <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-3">PRICE TARGET RANGE</h3>
          <div className="max-w-md">
            <div className="relative h-5 bg-terminal-border/20 rounded-sm">
              {/* Range bar */}
              <div className="absolute inset-y-0 left-0 right-0 bg-sky-500/10 rounded-sm" />
              {/* Mean target */}
              {meanPct >= 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-sky-400"
                  style={{ left: `${Math.min(Math.max(meanPct, 0), 100)}%` }}>
                  <span className="absolute -top-4 -translate-x-1/2 text-[8px] font-mono text-sky-400 whitespace-nowrap">
                    MEAN ${pt.mean.toFixed(0)}
                  </span>
                </div>
              )}
              {/* Current price */}
              {currentPct >= 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                  style={{ left: `${Math.min(Math.max(currentPct, 0), 100)}%` }}>
                  <span className="absolute bottom-[-18px] -translate-x-1/2 text-[8px] font-mono text-amber-400 whitespace-nowrap">
                    NOW ${pt.current.toFixed(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between mt-5 text-[9px] font-mono text-terminal-dim/50">
              <span>LOW ${pt.low.toFixed(0)}</span>
              <span>HIGH ${pt.high.toFixed(0)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Recent ratings */}
      <section>
        <h3 className="text-[8px] font-mono text-terminal-dim/50 tracking-widest mb-2">
          RECENT ANALYST ACTIONS ({a.recent.length})
        </h3>
        {a.recent.length === 0 ? (
          <p className="text-[10px] font-mono text-terminal-dim/40 py-4">No recent analyst actions available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-terminal-border/40">
                  {['DATE', 'FIRM', 'ACTION', 'FROM', 'TO', 'RATING'].map(h => (
                    <th key={h} className="text-left text-[7.5px] font-mono text-terminal-dim/40 tracking-widest pb-1.5 pr-4 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.recent.map((r, i) => (
                  <tr key={i} className="border-b border-terminal-border/20 hover:bg-terminal-surface/40 transition-colors">
                    <td className="py-1.5 pr-4 text-[9px] font-mono text-terminal-dim/60">{r.date}</td>
                    <td className="py-1.5 pr-4 text-[10px] font-mono text-terminal-text">{r.firm}</td>
                    <td className="py-1.5 pr-4 text-[9px] font-mono text-terminal-dim/60">{r.action || '—'}</td>
                    <td className="py-1.5 pr-4 text-[9px] font-mono text-terminal-dim/50">{r.from_grade || '—'}</td>
                    <td className="py-1.5 pr-4 text-[9.5px] font-mono text-terminal-dim">{r.to_grade || '—'}</td>
                    <td className="py-1.5">
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
                        style={{
                          color:       RATING_COLOR[r.rating],
                          borderColor: RATING_COLOR[r.rating] + '40',
                          backgroundColor: RATING_COLOR[r.rating] + '12',
                        }}>
                        {r.rating}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// BOARD tab ────────────────────────────────────────────────────────────────────
function BoardTab({ board }: { board: BoardMember[] }) {
  if (board.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] font-mono text-terminal-dim/40">No board data available</p>
      </div>
    )
  }
  return (
    <div className="p-5 overflow-y-auto h-full">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {board.map((m, i) => (
          <div key={i}
            className="flex flex-col gap-1.5 p-3 bg-terminal-surface border border-terminal-border/50 rounded-sm hover:border-terminal-accent/25 transition-colors">
            {/* Name + title */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-mono text-terminal-text font-semibold leading-tight">{m.name}</p>
                <p className="text-[9px] font-mono text-terminal-accent/70 mt-0.5 leading-tight">{m.title}</p>
              </div>
              {m.age && (
                <span className="text-[8px] font-mono text-terminal-dim/40 whitespace-nowrap">AGE {m.age}</span>
              )}
            </div>
            {/* Since / pay */}
            <div className="flex gap-3 flex-wrap">
              {m.since && (
                <span className="text-[8px] font-mono text-terminal-dim/50">
                  SINCE {m.since}
                </span>
              )}
              {m.total_pay && m.total_pay > 0 && (
                <span className="text-[8px] font-mono text-amber-400/60">
                  {fmt(m.total_pay)} pay
                </span>
              )}
            </div>
            {/* Bio */}
            {m.bio && (
              <p className="text-[9px] font-mono text-terminal-dim/60 leading-relaxed border-t border-terminal-border/30 pt-1.5">
                {m.bio}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

type CorpTab = 'overview' | 'holders' | 'analysts' | 'board'

export function CompanyProfileView() {
  const [query,     setQuery]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [profile,   setProfile]   = useState<CompanyProfile | null>(null)
  const [history,   setHistory]   = useState<CompanyProfile[]>([])
  const [tab,       setTab]       = useState<CorpTab>('overview')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (ticker: string, forceRefresh = false) => {
    if (!ticker.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = forceRefresh
        ? await api.company.refresh(ticker.toUpperCase())
        : await api.company.get(ticker.toUpperCase())
      setProfile(data)
      setHistory(prev => {
        const filtered = prev.filter(h => h.ticker !== data.ticker)
        return [data, ...filtered].slice(0, 12)
      })
      setTab('overview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) load(query.trim())
  }

  const TABS: { id: CorpTab; icon: typeof BookOpen; label: string }[] = [
    { id: 'overview', icon: BookOpen,   label: 'OVERVIEW' },
    { id: 'holders',  icon: Users,      label: 'HOLDERS'  },
    { id: 'analysts', icon: TrendingUp, label: 'ANALYSTS' },
    { id: 'board',    icon: BarChart2,  label: 'BOARD'    },
  ]

  return (
    <div className="flex h-full w-full overflow-hidden bg-terminal-bg">

      {/* ── Left sidebar: search + history ── */}
      <div className="w-[200px] flex-shrink-0 flex flex-col border-r border-terminal-border bg-terminal-surface/30">
        <form onSubmit={onSubmit} className="flex p-2 gap-1 border-b border-terminal-border/50">
          <div className="relative flex-1">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-terminal-dim/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              placeholder="AAPL, TSLA…"
              className="w-full pl-6 pr-2 py-1 bg-terminal-bg border border-terminal-border/60 text-[10px] font-mono text-terminal-text placeholder-terminal-dim/30 rounded-sm focus:outline-none focus:border-terminal-accent/40"
            />
          </div>
          <button type="submit"
            className="px-2 py-1 bg-terminal-accent/15 border border-terminal-accent/30 text-[8px] font-mono text-terminal-accent hover:bg-terminal-accent/25 rounded-sm transition-colors">
            GO
          </button>
        </form>

        <div className="flex-1 overflow-y-auto">
          {history.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[7.5px] font-mono text-terminal-dim/40 tracking-widest">HISTORY</p>
              {history.map(h => (
                <button key={h.ticker} onClick={() => { setProfile(h); setTab('overview') }}
                  className={cn(
                    'w-full text-left px-3 py-2 border-b border-terminal-border/20 transition-colors',
                    profile?.ticker === h.ticker
                      ? 'bg-terminal-accent/10 border-l-2 border-l-terminal-accent'
                      : 'hover:bg-terminal-surface/60 border-l-2 border-l-transparent',
                  )}>
                  <p className="text-[10px] font-mono text-terminal-accent font-semibold">{h.ticker}</p>
                  <p className="text-[8px] font-mono text-terminal-dim/60 truncate">{h.name}</p>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Right: content area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border/50 bg-terminal-surface/20 flex-shrink-0">
          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button key={id}
                onClick={() => setTab(id)}
                disabled={!profile}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors disabled:opacity-30',
                  tab === id && profile
                    ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                    : 'text-terminal-dim hover:text-terminal-text border border-transparent',
                )}>
                <Icon size={9} />
                {label}
              </button>
            ))}
          </div>

          {/* Company header + refresh */}
          <div className="flex items-center gap-3">
            {profile && (
              <div className="text-right">
                <p className="text-[13px] font-mono text-terminal-accent font-bold leading-tight">{profile.ticker}</p>
                <p className="text-[8px] font-mono text-terminal-dim/60 leading-tight">{profile.name}</p>
              </div>
            )}
            {profile && (
              <button
                onClick={() => load(profile.ticker, true)}
                disabled={loading}
                title="Refresh data"
                className="p-1.5 text-terminal-dim/50 hover:text-terminal-accent border border-terminal-border/40 hover:border-terminal-accent/30 rounded-sm transition-colors disabled:opacity-30">
                <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Building2 size={28} className="text-terminal-accent/30 animate-pulse" />
              <p className="text-[10px] font-mono text-terminal-dim/40 tracking-widest">LOADING PROFILE…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center h-full">
              <p className="text-[10px] font-mono text-red-400/70">{error}</p>
            </div>
          )}

          {!profile && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <Building2 size={36} className="text-terminal-dim/20" />
              <div>
                <p className="text-[13px] font-mono text-terminal-dim/40">Company Intelligence</p>
                <p className="text-[10px] font-mono text-terminal-dim/25 mt-1">
                  Enter a ticker to see industries, shareholders, analyst coverage, and board members
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'].map(t => (
                  <button key={t} onClick={() => { setQuery(t); load(t) }}
                    className="text-[8px] font-mono px-2 py-1 bg-terminal-surface border border-terminal-border/50 text-terminal-dim/60 hover:text-terminal-accent hover:border-terminal-accent/30 rounded-sm transition-colors">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {profile && !loading && (
            <>
              {tab === 'overview' && <OverviewTab p={profile} />}
              {tab === 'holders'  && <HoldersTab  p={profile} />}
              {tab === 'analysts' && <AnalystsTab p={profile} />}
              {tab === 'board'    && <BoardTab board={profile.board} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
