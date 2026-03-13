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

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Loader2, AlertTriangle, X,
  GitBranch, Table2, Trash2, RefreshCw, BarChart2,
} from 'lucide-react'
import { api, type SCCompany, type SCEdge, type SCSearchResult, type CompanyProfile } from '@/lib/api'
import { SCGraph }  from './SCGraph'
import { SCTable }  from './SCTable'
import { SCIntel }  from './SCIntel'
import { cn }       from '@/lib/utils'

type ViewTab = 'graph' | 'table' | 'intel'

// ─── Corporate meta nodes ─────────────────────────────────────────────────
function buildMetaNodes(profile: CompanyProfile): SCEdge[] {
  const shareholders: SCEdge[] = [
    ...profile.shareholders.institutions.slice(0, 6),
    ...profile.shareholders.mutual_funds.slice(0, 4),
  ].map((sh, i) => ({
    id:                `sh-${i}-${sh.name}`,
    entity_name:       sh.name,
    entity_ticker:     null,
    direction:         'SHAREHOLDER' as const,
    relationship_type: sh.type,
    tier:              null,
    pct_revenue:       sh.pct_held,
    pct_cogs:          null,
    sole_source:       false,
    disclosure_type:   'DISCLOSED' as const,
    confidence:        1,
    evidence:          null,
    hq_country:        null,
    as_of_date:        sh.date_reported ?? null,
  }))

  const board: SCEdge[] = profile.board.slice(0, 10).map((m, i) => ({
    id:                `bd-${i}-${m.name}`,
    entity_name:       m.name,
    entity_ticker:     null,
    direction:         'BOARD' as const,
    relationship_type: m.title,
    tier:              null,
    pct_revenue:       null,
    pct_cogs:          null,
    sole_source:       false,
    disclosure_type:   'DISCLOSED' as const,
    confidence:        1,
    evidence:          m.bio ?? null,
    hq_country:        null,
    as_of_date:        null,
  }))

  // Deduplicate analysts by firm, keep most recent rating
  const firmMap = new Map<string, typeof profile.analysts.recent[number]>()
  for (const r of profile.analysts.recent) {
    if (!firmMap.has(r.firm) || r.date > firmMap.get(r.firm)!.date) firmMap.set(r.firm, r)
  }
  const analysts: SCEdge[] = Array.from(firmMap.values()).slice(0, 10).map((r, i) => ({
    id:                `an-${i}-${r.firm}`,
    entity_name:       r.firm,
    entity_ticker:     null,
    direction:         'ANALYST' as const,
    relationship_type: r.rating,           // 'BUY' | 'HOLD' | 'SELL'
    tier:              null,
    pct_revenue:       null,
    pct_cogs:          null,
    sole_source:       false,
    disclosure_type:   'DISCLOSED' as const,
    confidence:        1,
    evidence:          `${r.action}: ${r.from_grade} → ${r.to_grade}`,
    hq_country:        null,
    as_of_date:        r.date,
  }))

  const industries: SCEdge[] = profile.industries.map((ind, i) => ({
    id:                `ind-${i}-${ind.label}`,
    entity_name:       ind.label,
    entity_ticker:     null,
    direction:         'INDUSTRY' as const,
    relationship_type: ind.type,
    tier:              null,
    pct_revenue:       null,
    pct_cogs:          null,
    sole_source:       false,
    disclosure_type:   'DISCLOSED' as const,
    confidence:        1,
    evidence:          null,
    hq_country:        null,
    as_of_date:        null,
  }))

  return [...shareholders, ...board, ...analysts, ...industries]
}

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
  const isShareholder = edge.direction === 'SHAREHOLDER'
  const isBoard       = edge.direction === 'BOARD'
  const isMeta        = isShareholder || isBoard

  const metaColor = isShareholder ? '#eab308' : isBoard ? '#e879f9' : undefined
  const { level, color } = isMeta ? { level: '—', color: metaColor! } : riskLevel(edge)

  // Shareholder drawer
  if (isShareholder) {
    const pct = edge.pct_revenue ?? 0
    const holderType = edge.relationship_type === 'MUTUAL_FUND' ? 'Mutual Fund' : 'Institution'
    return (
      <motion.div
        initial={{ x: 380, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 380, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
      >
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
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'TYPE',      value: holderType },
              { label: 'OWNERSHIP', value: pct > 0 ? `${pct.toFixed(2)}%` : '—', style: { color: '#eab308' } },
            ].map(({ label, value, style }) => (
              <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                <div className="text-[11px] font-mono text-terminal-text" style={style}>{value}</div>
              </div>
            ))}
          </div>
          {pct > 0 && (
            <div>
              <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">OWNERSHIP STAKE</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 5, 100)}%`, background: '#eab308' }} />
                </div>
                <span className="text-[10px] font-mono text-terminal-dim">{pct.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Board member drawer
  if (isBoard) {
    const title = (edge.relationship_type ?? '').replace(/_/g, ' ')
    return (
      <motion.div
        initial={{ x: 380, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 380, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
      >
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
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'ROLE',  value: title || '—' },
              { label: 'BOARD', value: 'Member' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                <div className="text-[11px] font-mono text-terminal-text">{value}</div>
              </div>
            ))}
          </div>
          {edge.evidence && (
            <div>
              <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1.5">BIO</div>
              <p className="text-[10px] font-mono text-terminal-dim leading-relaxed">{edge.evidence}</p>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Analyst drawer
  if (edge.direction === 'ANALYST') {
    const ratingColor = { BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444' }[edge.relationship_type ?? ''] ?? '#a78bfa'
    return (
      <motion.div
        initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: ratingColor }} />
            <span className="font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]">{edge.entity_name}</span>
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'FIRM',   value: edge.entity_name },
              { label: 'RATING', value: edge.relationship_type ?? '—', style: { color: ratingColor } },
              { label: 'DATE',   value: edge.as_of_date ?? '—' },
              ...(edge.evidence ? [{ label: 'ACTION', value: edge.evidence }] : []),
            ].map(({ label, value, style }) => (
              <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                <div className="text-[11px] font-mono text-terminal-text" style={style}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    )
  }

  // Industry drawer
  if (edge.direction === 'INDUSTRY') {
    return (
      <motion.div
        initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
            <span className="font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]">{edge.entity_name}</span>
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'CLASSIFICATION', value: (edge.relationship_type ?? '').replace('GICS_', '').replace(/_/g, ' ') || '—' },
              { label: 'LABEL', value: edge.entity_name },
            ].map(({ label, value }) => (
              <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                <div className="text-[11px] font-mono text-terminal-text">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    )
  }

  // Standard supply chain drawer
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
            As of {edge.as_of_date}
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
        Wikipedia · SEC · Model knowledge
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────
export function SupplyChainView() {
  const [input,        setInput]        = useState('')
  const [suggestions,  setSuggestions]  = useState<SCSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [company,      setCompany]      = useState<SCCompany | null>(null)
  const [edges,        setEdges]        = useState<SCEdge[]>([])
  const [tab,          setTab]          = useState<ViewTab>('graph')
  const [selected,     setSelected]     = useState<SCEdge | null>(null)
  const [analysing,    setAnalysing]    = useState(false)
  const [prevTickers,  setPrevTickers]  = useState<SCCompany[]>([])
  const inputRef  = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.splc.list().then(setPrevTickers).catch(() => {})
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search-as-you-type
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleInputChange(val: string) {
    setInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (val.trim().length < 1) { setSuggestions([]); setShowDropdown(false); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await api.splc.search(val.trim())
        setSuggestions(results)
        setShowDropdown(results.length > 0)
      } catch { /* backend not running */ }
    }, 250)
  }

  async function load(ticker: string, autoAnalyseOn404 = true) {
    setInput(ticker)
    setShowDropdown(false)
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const data = await api.splc.get(ticker)
      setCompany(data.company)
      // Silently fetch company profile to inject shareholders + board as nodes
      const allEdges = [...data.edges]
      try {
        const profile = await api.company.get(ticker)
        allEdges.push(...buildMetaNodes(profile))
      } catch { /* profile unavailable — show SC data without meta nodes */ }
      setEdges(allEdges)
      setLoading(false)
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ''
      setLoading(false)
      if (msg.includes('404') && autoAnalyseOn404) {
        // Not in cache — immediately kick off analysis
        await analyse(ticker)
      } else if (msg.includes('404')) {
        setCompany(null); setEdges([]); setError('not_found')
      } else {
        setError(String(e))
      }
    }
  }

  async function analyse(ticker: string) {
    setInput(ticker)
    setShowDropdown(false)
    setAnalysing(true)
    setError(null)
    try {
      await api.splc.analyse(ticker)
      await load(ticker)
      setPrevTickers(await api.splc.list())
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setAnalysing(false)
    }
  }

  // Smart submit: load from cache; if not found, immediately analyse
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = input.trim().toUpperCase()
    if (!t) return
    setInput(t)
    setShowDropdown(false)
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const data = await api.splc.get(t)
      setCompany(data.company)
      const allEdges = [...data.edges]
      try {
        const profile = await api.company.get(t)
        allEdges.push(...buildMetaNodes(profile))
      } catch { /* profile unavailable */ }
      setEdges(allEdges)
      setLoading(false)
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ''
      setLoading(false)
      if (msg.includes('404')) {
        // Auto-trigger analysis if not cached
        await analyse(t)
      } else {
        setError(String(e))
      }
    }
  }

  function pickSuggestion(s: SCSearchResult) {
    setInput(s.ticker)
    setSuggestions([])
    setShowDropdown(false)
    load(s.ticker)
  }

  async function handleDelete(ticker: string) {
    await api.splc.remove(ticker)
    setPrevTickers(await api.splc.list())
    if (company?.ticker === ticker) { setCompany(null); setEdges([]) }
  }

  const busy = loading || analysing

  return (
    <div className="flex h-full w-full bg-terminal-bg overflow-hidden relative">

      {/* ── Left sidebar: history ─────────────────────────────────────── */}
      <div className="w-[180px] flex-shrink-0 border-r border-terminal-border flex flex-col bg-terminal-surface/30 z-10">
        <div className="px-3 py-2.5 border-b border-terminal-border">
          <span className="text-[9px] font-mono text-terminal-dim tracking-widest">ANALYSED</span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {prevTickers.length === 0 && (
            <p className="text-[9px] font-mono text-terminal-dim/40 p-3 leading-relaxed">
              No tickers yet.
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
              <div className="min-w-0">
                <div className="text-[10px] font-mono font-bold text-terminal-text">{c.ticker}</div>
                <div className="text-[8px] font-mono text-terminal-dim/60 truncate">
                  {c.legal_name ?? c.ticker}
                </div>
              </div>
              <button
                onClick={ev => { ev.stopPropagation(); handleDelete(c.ticker) }}
                className="opacity-0 group-hover:opacity-100 text-terminal-dim hover:text-red-400 transition-all flex-shrink-0 ml-1"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Search bar ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-terminal-border bg-terminal-surface/20 flex-shrink-0">

          {/* Search input + dropdown */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1" ref={searchRef}>
            <div className="relative flex-1 max-w-[420px]">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-terminal-dim pointer-events-none" />
              <input
                ref={inputRef}
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                placeholder="Ticker or company name — e.g. AAPL or Apple"
                autoComplete="off"
                className="w-full pl-8 pr-3 py-1.5 bg-terminal-bg border border-terminal-border rounded-sm font-mono text-xs text-terminal-text placeholder:text-terminal-dim/40 focus:outline-none focus:border-terminal-accent/60"
              />
              {/* Autocomplete dropdown */}
              <AnimatePresence>
                {showDropdown && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 right-0 mt-0.5 bg-terminal-surface border border-terminal-border rounded-sm shadow-lg z-50 overflow-hidden"
                  >
                    {suggestions.map(s => (
                      <button
                        key={s.ticker}
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-terminal-muted/40 transition-colors"
                      >
                        <span className="text-[11px] font-mono font-bold text-terminal-accent w-14 flex-shrink-0">{s.ticker}</span>
                        <span className="text-[10px] font-mono text-terminal-dim truncate">{s.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Analyse button — primary action */}
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono tracking-widest bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm hover:bg-terminal-accent/25 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {busy
                ? <Loader2 size={11} className="animate-spin" />
                : <GitBranch size={11} />
              }
              {analysing ? 'ANALYSING…' : loading ? 'LOADING…' : 'ANALYSE'}
            </button>
          </form>

          {/* View tabs — shown when data is loaded */}
          {company && (
            <div className="flex items-center gap-1">
              {([
                { id: 'graph' as ViewTab, icon: GitBranch, label: 'GRAPH' },
                { id: 'table' as ViewTab, icon: Table2,    label: 'TABLE' },
                { id: 'intel' as ViewTab, icon: BarChart2, label: 'INTEL' },
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

          {/* Company badge + re-analyse */}
          {company && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="text-right">
                <div className="text-[11px] font-mono font-bold text-terminal-text">{company.ticker}</div>
                <div className="text-[8px] font-mono text-terminal-dim/60 max-w-[150px] truncate">
                  {company.legal_name ?? company.sector ?? ''}
                </div>
              </div>
              <button
                onClick={() => analyse(company.ticker)}
                disabled={busy}
                title="Re-analyse from latest 10-K"
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

            {/* Loading state — centered over full screen */}
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-terminal-bg/80 backdrop-blur-sm">
                <Loader2 size={28} className="animate-spin text-terminal-accent" />
                <div className="text-center space-y-1">
                  <p className="font-mono text-sm text-terminal-text">
                    {analysing ? 'Analysing supply chain…' : 'Loading…'}
                  </p>
                  {analysing && (
                    <div className="font-mono text-[9px] text-terminal-dim space-y-0.5 mt-2">
                      <p className="text-terminal-accent/70">① Resolving company via SEC EDGAR</p>
                      <p className="text-terminal-dim/60">② Fetching Wikipedia supply chain article</p>
                      <p className="text-terminal-dim/60">③ Fetching Wikipedia company article</p>
                      <p className="text-terminal-dim/60">④ Fetching SEC 10-K for context</p>
                      <p className="text-terminal-dim/60">⑤ LLM extracting all named relationships</p>
                      <p className="text-terminal-dim/60">⑥ Saving to database</p>
                      <p className="text-terminal-dim/30 mt-2">~20–45 s · Wikipedia + SEC + model knowledge</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error: not yet analysed fallback */}
            {!busy && error === 'not_found' && input && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
                <div className="text-center pointer-events-auto">
                  <p className="font-mono text-sm text-terminal-text mb-1">
                    Not yet analysed: <span className="text-terminal-accent">{input}</span>
                  </p>
                  <p className="font-mono text-[10px] text-terminal-dim mb-4">
                    Sources: Wikipedia · SEC 10-K · model knowledge
                  </p>
                  <button
                    onClick={() => analyse(input)}
                    className="flex items-center gap-2 px-4 py-2 bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm font-mono text-xs tracking-widest hover:bg-terminal-accent/25 transition-colors"
                  >
                    <GitBranch size={13} />
                    ANALYSE {input}
                  </button>
                  <p className="font-mono text-[9px] text-terminal-dim/40 mt-3">
                    Wikipedia + SEC 10-K + model knowledge · ~15–30s
                  </p>
                </div>
              </div>
            )}

            {/* Other error */}
            {!busy && error && error !== 'not_found' && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="flex items-center gap-2 text-red-400 font-mono text-sm pointer-events-auto">
                  <AlertTriangle size={16} />
                  {error}
                </div>
              </div>
            )}

            {/* Empty state — centered over full screen */}
            {!busy && !error && !company && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8 z-10 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center gap-4">
                  <GitBranch size={36} className="text-terminal-dim/20" />
                  <div>
                    <p className="font-mono text-sm text-terminal-text mb-1">Supply Chain Analysis</p>
                    <p className="font-mono text-[10px] text-terminal-dim max-w-xs leading-relaxed">
                      Enter any ticker to map named suppliers, customers and competitors
                      using Wikipedia, SEC filings, and model knowledge.
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
              </div>
            )}

            {/* Results */}
            {!busy && !error && company && edges.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                <AlertTriangle size={28} className="text-yellow-400/50" />
                <div>
                  <p className="font-mono text-sm text-terminal-text mb-1">
                    No relationships extracted for <span className="text-terminal-accent">{company.ticker}</span>
                  </p>
                  <p className="font-mono text-[10px] text-terminal-dim mb-4 max-w-xs leading-relaxed">
                    No named suppliers or customers were found. The 10-K may use generic
                    language ("contract manufacturers") without naming companies. Re-analyse
                    to try the updated extraction prompt.
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

            {!busy && !error && company && edges.length > 0 && (
              <div className="flex-1 overflow-hidden">
                {tab === 'graph' ? (
                  <div className="h-full w-full">
                    <SCGraph
                      ticker={company.ticker}
                      legalName={company.legal_name ?? company.ticker}
                      edges={edges}
                      onNodeClick={setSelected}
                    />
                  </div>
                ) : tab === 'table' ? (
                  <SCTable edges={edges} onRowClick={setSelected} />
                ) : (
                  <SCIntel company={company} edges={edges} />
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
