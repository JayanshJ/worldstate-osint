/**
 * SupplyChainView — Bloomberg SPLC-inspired supply chain analysis.
 *
 * Data source: SEC EDGAR (100% free, no API key).
 * LLM extraction uses the existing OpenAI key already in the stack.
 *
 * Flow:
 *   1. User types a ticker (e.g. AAPL) and hits Analyse
 *   2. POST /api/v1/splc/{ticker} triggers EDGAR download + LLM extraction (~15-30s)
 *   3. Results cached in PostgreSQL; subsequent loads are instant
 *   4. Toggle between GRAPH view and TABLE view
 *   5. Click any node / row → evidence drawer slides in from right
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Loader2, AlertTriangle, X, ChevronRight,
  GitBranch, Table2, Trash2, RefreshCw,
} from 'lucide-react'
import { api, type SCCompany, type SCEdge } from '@/lib/api'
import { SCGraph }  from './SCGraph'
import { SCTable }  from './SCTable'
import { cn }       from '@/lib/utils'

type ViewTab = 'graph' | 'table'

// ─── Risk helpers ─────────────────────────────────────────────────────────
function riskLevel(e: SCEdge) {
  const exp = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source || exp >= 20) return { level: 'HIGH',   color: '#ef4444' }
  if (exp >= 10)                  return { level: 'MEDIUM', color: '#f97316' }
  if (exp > 0)                    return { level: 'LOW',    color: '#22c55e' }
  return                                 { level: 'NONE',   color: '#5a6380' }
}

// ─── Evidence drawer ─────────────────────────────────────────────────────
function EvidenceDrawer({ edge, onClose }: { edge: SCEdge; onClose: () => void }) {
  const { level, color } = riskLevel(edge)
  const exp = edge.pct_revenue ?? edge.pct_cogs

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]">
            {edge.entity_name}
          </span>
        </div>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'DIRECTION',    value: edge.direction },
            { label: 'TYPE',         value: (edge.relationship_type ?? '—').replace('_', ' ') },
            { label: 'RISK LEVEL',   value: level,      style: { color } },
            { label: 'TIER',         value: `Tier ${edge.tier ?? 1}` },
            { label: 'COUNTRY',      value: edge.hq_country ?? '—' },
            { label: 'SOLE SOURCE',  value: edge.sole_source ? 'YES ⚠' : 'No',
              style: edge.sole_source ? { color: '#ef4444' } : undefined },
            ...(edge.pct_revenue != null ? [{ label: 'REV EXPOSURE', value: `${edge.pct_revenue.toFixed(1)}%`, style: { color: '#22c55e' } }] : []),
            ...(edge.pct_cogs    != null ? [{ label: 'COGS EXPOSURE',value: `${edge.pct_cogs.toFixed(1)}%`,   style: { color: '#0ea5e9' } }] : []),
          ].map(({ label, value, style }) => (
            <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
              <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
              <div className="text-[11px] font-mono text-terminal-text" style={style}>{value}</div>
            </div>
          ))}
        </div>

        {/* Confidence */}
        <div>
          <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">
            CONFIDENCE · {edge.disclosure_type ?? '—'}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${((edge.confidence ?? 1) * 100).toFixed(0)}%`,
                  background: color,
                }}
              />
            </div>
            <span className="text-[10px] font-mono text-terminal-dim">
              {((edge.confidence ?? 1) * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Evidence quote */}
        {edge.evidence && (
          <div>
            <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1.5">
              EVIDENCE FROM FILING
            </div>
            <blockquote className="border-l-2 border-terminal-accent/40 pl-3 text-[10px] font-mono text-terminal-dim leading-relaxed italic">
              "{edge.evidence}"
            </blockquote>
          </div>
        )}

        {/* as_of_date */}
        {edge.as_of_date && (
          <div className="text-[9px] font-mono text-terminal-dim/50">
            Source: SEC 10-K filed {edge.as_of_date}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Risk summary bar ─────────────────────────────────────────────────────
function RiskBar({ edges }: { edges: SCEdge[] }) {
  const high   = edges.filter(e => { const r = riskLevel(e); return r.level === 'HIGH' }).length
  const medium = edges.filter(e => { const r = riskLevel(e); return r.level === 'MEDIUM' }).length
  const soles  = edges.filter(e => e.sole_source).length
  const upstream   = edges.filter(e => e.direction === 'UPSTREAM').length
  const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-terminal-border bg-terminal-surface/30 flex-shrink-0 flex-wrap">
      {[
        { label: 'SUPPLIERS',  value: upstream,   color: '#0ea5e9' },
        { label: 'CUSTOMERS',  value: downstream, color: '#22c55e' },
        { label: 'HIGH RISK',  value: high,       color: '#ef4444' },
        { label: 'MED RISK',   value: medium,     color: '#f97316' },
        { label: 'SOLE-SOURCE',value: soles,      color: '#ef4444' },
      ].map(({ label, value, color }) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <span className="text-[9px] font-mono text-terminal-dim tracking-widest">{label}</span>
          <span className="text-[13px] font-mono font-bold" style={{ color }}>{value}</span>
        </div>
      ))}
      <div className="ml-auto text-[8px] font-mono text-terminal-dim/40">
        Source: SEC EDGAR · Free
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────
export function SupplyChainView() {
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [company,     setCompany]     = useState<SCCompany | null>(null)
  const [edges,       setEdges]       = useState<SCEdge[]>([])
  const [tab,         setTab]         = useState<ViewTab>('graph')
  const [selected,    setSelected]    = useState<SCEdge | null>(null)
  const [analysing,   setAnalysing]   = useState(false)
  const [prevTickers, setPrevTickers] = useState<SCCompany[]>([])

  // Load previously analysed tickers on mount
  useEffect(() => {
    api.splc.list().then(setPrevTickers).catch(() => {})
  }, [])

  async function load(ticker: string) {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const data = await api.splc.get(ticker)
      setCompany(data.company)
      setEdges(data.edges)
    } catch (e: unknown) {
      const status = (e as { message?: string })?.message ?? ''
      if (status.includes('404')) {
        setCompany(null)
        setEdges([])
        setError('not_found')
      } else {
        setError(String(e))
      }
    } finally {
      setLoading(false)
    }
  }

  async function analyse(ticker: string) {
    setAnalysing(true)
    setError(null)
    try {
      await api.splc.analyse(ticker)
      await load(ticker)
      const updated = await api.splc.list()
      setPrevTickers(updated)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setAnalysing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = input.trim().toUpperCase()
    if (!t) return
    setInput(t)
    await load(t)
  }

  async function handleDelete(ticker: string) {
    await api.splc.remove(ticker)
    const updated = await api.splc.list()
    setPrevTickers(updated)
    if (company?.ticker === ticker) {
      setCompany(null)
      setEdges([])
    }
  }

  return (
    <div className="flex h-full w-full bg-terminal-bg overflow-hidden">

      {/* ── Left sidebar: history ─────────────────────────────────────── */}
      <div className="w-[180px] flex-shrink-0 border-r border-terminal-border flex flex-col bg-terminal-surface/30">
        <div className="px-3 py-2.5 border-b border-terminal-border">
          <span className="text-[9px] font-mono text-terminal-dim tracking-widest">
            ANALYSED
          </span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {prevTickers.length === 0 && (
            <p className="text-[9px] font-mono text-terminal-dim/40 p-3 leading-relaxed">
              No tickers yet. Enter a ticker to analyse.
            </p>
          )}
          {prevTickers.map(c => (
            <div
              key={c.ticker}
              className={cn(
                'flex items-center justify-between px-3 py-2 group cursor-pointer hover:bg-terminal-muted/30 transition-colors',
                company?.ticker === c.ticker && 'bg-terminal-accent/10 border-l-2 border-terminal-accent',
              )}
              onClick={() => load(c.ticker)}
            >
              <div>
                <div className="text-[10px] font-mono font-bold text-terminal-text">{c.ticker}</div>
                <div className="text-[8px] font-mono text-terminal-dim/60 truncate max-w-[110px]">
                  {c.legal_name ?? c.ticker}
                </div>
              </div>
              <button
                onClick={ev => { ev.stopPropagation(); handleDelete(c.ticker) }}
                className="opacity-0 group-hover:opacity-100 text-terminal-dim hover:text-red-400 transition-all"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Search + controls bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-terminal-border bg-terminal-surface/20 flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 max-w-[320px]">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-dim" />
              <input
                value={input}
                onChange={e => setInput(e.target.value.toUpperCase())}
                placeholder="Ticker  e.g. AAPL"
                className="w-full pl-8 pr-3 py-1.5 bg-terminal-bg border border-terminal-border rounded-sm font-mono text-xs text-terminal-text placeholder:text-terminal-dim/40 focus:outline-none focus:border-terminal-accent/60 tracking-widest uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={loading || analysing}
              className="px-3 py-1.5 text-[9px] font-mono tracking-widest bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm hover:bg-terminal-accent/25 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : 'LOAD'}
            </button>
          </form>

          {/* View tabs */}
          {company && (
            <div className="flex items-center gap-1 ml-4">
              {([
                { id: 'graph' as ViewTab, icon: GitBranch, label: 'GRAPH' },
                { id: 'table' as ViewTab, icon: Table2,    label: 'TABLE' },
              ]).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors border',
                    tab === id
                      ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                      : 'text-terminal-dim border-transparent hover:text-terminal-text',
                  )}
                >
                  <Icon size={10} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Company info badge */}
          {company && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="text-right">
                <div className="text-[11px] font-mono font-bold text-terminal-text">{company.ticker}</div>
                <div className="text-[8px] font-mono text-terminal-dim/60">
                  {company.sector?.slice(0, 30) ?? ''}
                </div>
              </div>
              <button
                onClick={() => analyse(company.ticker)}
                disabled={analysing}
                title="Re-analyse (fetches latest 10-K)"
                className="text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={analysing ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>

        {/* Risk bar */}
        {edges.length > 0 && <RiskBar edges={edges} />}

        {/* Content area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">

            {/* Loading state */}
            {(loading || analysing) && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <Loader2 size={28} className="animate-spin text-terminal-accent" />
                <div className="text-center space-y-1">
                  <p className="font-mono text-sm text-terminal-text">
                    {analysing ? 'Fetching SEC EDGAR filing…' : 'Loading cached data…'}
                  </p>
                  {analysing && (
                    <div className="font-mono text-[9px] text-terminal-dim space-y-0.5 mt-2">
                      <p className="text-terminal-accent/70">① Resolving CIK from SEC ticker map</p>
                      <p className="text-terminal-dim/60">② Downloading 10-K from EDGAR archives</p>
                      <p className="text-terminal-dim/60">③ Stripping HTML / iXBRL → plain text</p>
                      <p className="text-terminal-dim/60">④ LLM extracting relationships (3 chunks)</p>
                      <p className="text-terminal-dim/60">⑤ Saving to database</p>
                      <p className="text-terminal-dim/30 mt-2">~20–40 s · 100% free via sec.gov</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error: not yet analysed */}
            {!loading && !analysing && error === 'not_found' && input && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-center">
                  <p className="font-mono text-sm text-terminal-text mb-1">
                    No data for <span className="text-terminal-accent">{input}</span>
                  </p>
                  <p className="font-mono text-[10px] text-terminal-dim mb-4">
                    Analyse this ticker using the free SEC EDGAR API
                  </p>
                  <button
                    onClick={() => analyse(input)}
                    className="flex items-center gap-2 px-4 py-2 bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm font-mono text-xs tracking-widest hover:bg-terminal-accent/25 transition-colors"
                  >
                    <GitBranch size={13} />
                    ANALYSE {input}
                  </button>
                  <p className="font-mono text-[9px] text-terminal-dim/40 mt-3">
                    Downloads latest 10-K from sec.gov · 100% free
                  </p>
                </div>
              </div>
            )}

            {/* Other error */}
            {!loading && !analysing && error && error !== 'not_found' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2 text-red-400 font-mono text-sm">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !analysing && !error && !company && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                <GitBranch size={36} className="text-terminal-dim/20" />
                <div>
                  <p className="font-mono text-sm text-terminal-text mb-1">Supply Chain Analysis</p>
                  <p className="font-mono text-[10px] text-terminal-dim max-w-xs leading-relaxed">
                    Enter any ticker to map its supplier and customer relationships,
                    extracted from SEC 10-K filings for free.
                  </p>
                </div>
                {prevTickers.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {prevTickers.slice(0, 6).map(c => (
                      <button
                        key={c.ticker}
                        onClick={() => load(c.ticker)}
                        className="text-[9px] font-mono px-2 py-1 border border-terminal-border rounded-sm text-terminal-dim hover:text-terminal-accent hover:border-terminal-accent/40 transition-colors"
                      >
                        {c.ticker}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {!loading && !analysing && !error && company && edges.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                <AlertTriangle size={28} className="text-yellow-400/50" />
                <div>
                  <p className="font-mono text-sm text-terminal-text mb-1">
                    No relationships extracted for <span className="text-terminal-accent">{company.ticker}</span>
                  </p>
                  <p className="font-mono text-[10px] text-terminal-dim mb-4 max-w-xs leading-relaxed">
                    The filing may use a format that wasn't fully parsed, or the 10-K
                    doesn't name specific suppliers/customers. Try re-analysing — the
                    improved iXBRL parser often catches more on retry.
                  </p>
                  <button
                    onClick={() => analyse(company.ticker)}
                    disabled={analysing}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm font-mono text-xs tracking-widest hover:bg-terminal-accent/25 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={analysing ? 'animate-spin' : ''} />
                    RE-ANALYSE {company.ticker}
                  </button>
                </div>
              </div>
            )}

            {!loading && !analysing && !error && company && edges.length > 0 && (
              <div className="flex-1 overflow-auto">
                {tab === 'graph' ? (
                  <div className="p-6">
                    <SCGraph
                      ticker={company.ticker}
                      legalName={company.legal_name}
                      edges={edges}
                      onNodeClick={setSelected}
                    />
                  </div>
                ) : (
                  <SCTable edges={edges} onRowClick={setSelected} />
                )}
              </div>
            )}
          </div>

          {/* Evidence drawer */}
          <AnimatePresence>
            {selected && (
              <EvidenceDrawer
                key={selected.id}
                edge={selected}
                onClose={() => setSelected(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
