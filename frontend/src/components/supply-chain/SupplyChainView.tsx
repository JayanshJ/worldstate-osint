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
import { api, type SCCompany, type SCEdge, type SCSearchResult, type CompanyProfile, type SearchResponse, type ClusterMemberDetail } from '@/lib/api'
import type { EventCluster } from '@/types'
import { SCGraph }  from './SCGraph'
import { SCTable, type CellClickEvent }  from './SCTable'
import { SCIntel }  from './SCIntel'
import { cn }       from '@/lib/utils'

// ─── Formatting helpers ───────────────────────────────────────────────────
function fmtMarketCap(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toLocaleString()}`
}
function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtNumber(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString()
}
function fmtPct(v: number | null | undefined, suffix = '%'): string {
  if (v == null) return '—'
  return `${v.toFixed(2)}${suffix}`
}

// ─── Profile fetch hook ───────────────────────────────────────────────────
function useNodeProfile(ticker: string | null | undefined) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [loading, setLoading]  = useState(false)
  useEffect(() => {
    if (!ticker) { setProfile(null); return }
    let cancelled = false
    setLoading(true)
    api.company.get(ticker).then(p => {
      if (!cancelled) { setProfile(p); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker])
  return { profile, loading }
}

// ─── Events fetch hook ────────────────────────────────────────────────────
function useNodeEvents(query: string | null | undefined) {
  const [events, setEvents] = useState<SearchResponse['cluster_hits']>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!query) { setEvents([]); return }
    let cancelled = false
    setLoading(true)
    api.search.query(query, 'keyword', 10).then(res => {
      if (!cancelled) { setEvents(res.cluster_hits); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query])
  return { events, loading }
}

// ─── Live Entity Research hook ────────────────────────────────────────────
function useLiveResearch(name: string | null | undefined, type?: string | null) {
  const [research, setResearch] = useState<{
    summary: string;
    key_developments: string[];
    known_affiliations: string[];
    risk_indicators: string[];
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) { setResearch(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    api.research.entity(name, type ?? undefined)
      .then(res => {
        if (!cancelled) { setResearch(res); setLoading(false) }
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [name, type])

  return { research, loading, error }
}

// ─── Event Deep Dive hook ─────────────────────────────────────────────────
function useEventDeepDive(id: string | null) {
  const [cluster, setCluster] = useState<(EventCluster & { members: ClusterMemberDetail[] }) | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setCluster(null); setAnalysis(null); setError(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    
    Promise.all([
      api.clusters.get(id),
      api.clusters.deepdive(id).catch(err => {
        console.error("Deep dive failed:", err)
        return { analysis: "Analysis generation failed. Please try again later." }
      })
    ]).then(([cRes, aRes]) => {
      if (!cancelled) {
        setCluster(cRes)
        setAnalysis(aRes.analysis)
        setLoading(false)
      }
    }).catch(err => {
      if (!cancelled) { setError(err.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [id])

  return { cluster, analysis, loading, error }
}

type ViewTab = 'graph' | 'table' | 'intel'

// ─── Drawer selection union ───────────────────────────────────────────────
type DrawerItem =
  | { kind: 'edge';    edge: SCEdge }
  | { kind: 'hub';     dir: string; label: string; nodes: SCEdge[] }
  | { kind: 'focal';   company: SCCompany; edges: SCEdge[] }
  | { kind: 'country'; country: string; edges: SCEdge[] }
  | { kind: 'entity';  edge: SCEdge }

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

// ─── Colour map (mirrors SCGraph) ─────────────────────────────────────────
const DIR_COLOR: Record<string, string> = {
  UPSTREAM:    '#00c896', DOWNSTREAM: '#f59e0b', COMPETITOR:  '#818cf8',
  SHAREHOLDER: '#eab308', BOARD:      '#e879f9', ANALYST:     '#a78bfa',
  INDUSTRY:    '#06b6d4',
}

// ─── Hub / category drawer ────────────────────────────────────────────────
function HubDrawer({ dir, label, nodes, onClose, onNodeClick }: {
  dir: string; label: string; nodes: SCEdge[]; onClose: () => void; onNodeClick?: (e: SCEdge) => void
}) {
  const color = DIR_COLOR[dir] ?? '#00d4ff'
  const isMeta = ['SHAREHOLDER','BOARD','ANALYST','INDUSTRY'].includes(dir)
  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="font-mono font-bold text-sm" style={{ color }}>{label}</span>
          <span className="text-[9px] font-mono text-terminal-dim">({nodes.length})</span>
        </div>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
        {nodes.map(n => {
          const sub = n.relationship_type?.replace(/_/g, ' ') ?? ''
          const pct = n.pct_revenue ?? n.pct_cogs ?? 0
          return (
            <button key={n.id}
              onClick={() => onNodeClick?.(n)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-sm text-left hover:brightness-125 transition-all cursor-pointer"
              style={{ background: '#ffffff06', border: `0.5px solid ${color}30` }}
            >
              <div className="min-w-0">
                <div className="text-[10px] font-mono font-bold text-terminal-text truncate"
                  style={{ color: color + 'dd' }}>
                  {n.entity_name}
                </div>
                {sub && (
                  <div className="text-[8px] font-mono text-terminal-dim/60 truncate mt-0.5">{sub}</div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {pct > 0 && (
                  <span className="text-[9px] font-mono" style={{ color }}>
                    {pct.toFixed(1)}%
                  </span>
                )}
                {n.hq_country && (
                  <span className="text-[8px] font-mono text-terminal-dim/50">
                    {n.hq_country}
                  </span>
                )}
                {!isMeta && n.tier === 2 && (
                  <span className="text-[7px] font-mono text-terminal-dim/40">T2</span>
                )}
                <span className="text-[8px] text-terminal-dim/30 ml-1">→</span>
              </div>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ─── Focal / company drawer ───────────────────────────────────────────────
function FocalDrawer({ company, edges, onClose }: {
  company: SCCompany; edges: SCEdge[]; onClose: () => void
}) {
  const { profile, loading: profileLoading } = useNodeProfile(company.ticker)
  const upstream   = edges.filter(e => e.direction === 'UPSTREAM').length
  const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length
  const competitor = edges.filter(e => e.direction === 'COMPETITOR').length
  const shareholder= edges.filter(e => e.direction === 'SHAREHOLDER').length
  const board      = edges.filter(e => e.direction === 'BOARD').length
  const analyst    = edges.filter(e => e.direction === 'ANALYST').length
  const industry   = edges.filter(e => e.direction === 'INDUSTRY').length

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00d4ff]" />
          <span className="font-mono font-bold text-sm text-[#00d4ff]">{company.ticker}</span>
          <span className="text-[9px] font-mono text-terminal-dim truncate max-w-[180px]">
            {company.legal_name}
          </span>
        </div>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {/* Company metadata */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'TICKER',   value: company.ticker },
            { label: 'EXCHANGE', value: profile?.exchange ?? '—' },
            { label: 'SECTOR',   value: company.sector  ?? '—' },
            { label: 'SIC CODE', value: company.sic_code ? `SIC ${company.sic_code}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
              <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
              <div className="text-[10px] font-mono text-terminal-text">{value}</div>
            </div>
          ))}
        </div>

        {/* Market data — from CompanyProfile */}
        {profileLoading && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={10} className="animate-spin text-terminal-accent" />
            <span className="text-[8px] font-mono text-terminal-dim">Loading market data…</span>
          </div>
        )}
        {profile && (
          <>
            <div>
              <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2">MARKET DATA</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'MARKET CAP', value: fmtMarketCap(profile.market_cap), style: { color: '#00d4ff' } },
                  { label: 'PRICE',      value: fmtPrice(profile.current_price), style: { color: '#22c55e' } },
                  { label: 'P/E RATIO',  value: profile.pe_ratio?.toFixed(1) ?? '—' },
                  { label: 'FORWARD P/E',value: profile.forward_pe?.toFixed(1) ?? '—' },
                  { label: 'BETA',       value: profile.beta?.toFixed(2) ?? '—' },
                  { label: 'EMPLOYEES',  value: fmtNumber(profile.employees) },
                  { label: 'DIV YIELD',  value: profile.dividend_yield > 0 ? fmtPct(profile.dividend_yield) : '—' },
                  { label: 'COUNTRY',    value: profile.country || '—' },
                ].map(({ label, value, style }) => (
                  <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                    <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                    <div className="text-[10px] font-mono text-terminal-text" style={style}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 52-week range */}
            {profile.fifty_two_week_low != null && profile.fifty_two_week_high != null && profile.current_price != null && (
              <div>
                <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">52-WEEK RANGE</div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-mono text-terminal-dim">{fmtPrice(profile.fifty_two_week_low)}</span>
                  <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden relative">
                    <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400"
                      style={{ width: '100%', opacity: 0.3 }} />
                    <div className="absolute top-0 h-full w-1 bg-[#00d4ff] rounded-full"
                      style={{ left: `${Math.min(100, Math.max(0, ((profile.current_price - profile.fifty_two_week_low) / (profile.fifty_two_week_high - profile.fifty_two_week_low)) * 100))}%` }} />
                  </div>
                  <span className="text-[8px] font-mono text-terminal-dim">{fmtPrice(profile.fifty_two_week_high)}</span>
                </div>
              </div>
            )}

            {/* Description */}
            {profile.description && (
              <div>
                <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">DESCRIPTION</div>
                <p className="text-[9px] font-mono text-terminal-dim/70 leading-relaxed">
                  {profile.description.slice(0, 300)}{profile.description.length > 300 ? '…' : ''}
                </p>
              </div>
            )}
          </>
        )}

        {/* Relationship summary */}
        <div>
          <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2">RELATIONSHIPS MAPPED</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: 'Suppliers',    count: upstream,    color: '#00c896' },
              { label: 'Customers',    count: downstream,  color: '#f59e0b' },
              { label: 'Peers',        count: competitor,  color: '#818cf8' },
              { label: 'Shareholders', count: shareholder, color: '#eab308' },
              { label: 'Board',        count: board,       color: '#e879f9' },
              { label: 'Analysts',     count: analyst,     color: '#a78bfa' },
              { label: 'Industries',   count: industry,    color: '#06b6d4' },
            ].filter(r => r.count > 0).map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between px-3 py-1.5 rounded-sm"
                style={{ background: color + '0d', border: `0.5px solid ${color}30` }}>
                <span className="text-[9px] font-mono" style={{ color: color + 'cc' }}>{label}</span>
                <span className="text-[11px] font-mono font-bold" style={{ color }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
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

// ─── Country drawer ───────────────────────────────────────────────────────
const ALPHA3_TO_2: Record<string, string> = {
  TWN: 'TW', CHN: 'CN', USA: 'US', KOR: 'KR', JPN: 'JP',
  DEU: 'DE', GBR: 'GB', IND: 'IN', NLD: 'NL', IRL: 'IE',
  SGP: 'SG', MYS: 'MY', VNM: 'VN', THA: 'TH', PHL: 'PH',
  MEX: 'MX', BRA: 'BR', CAN: 'CA', AUS: 'AU', FRA: 'FR',
  ITA: 'IT', CHE: 'CH', SWE: 'SE', ISR: 'IL', NOR: 'NO',
  FIN: 'FI', DNK: 'DK', AUT: 'AT', BEL: 'BE', HKG: 'HK',
}

const HIGH_GEO_RISK = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN'])
const MED_GEO_RISK  = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE'])

function flagEmoji(alpha3: string): string {
  const a2 = ALPHA3_TO_2[alpha3]
  if (!a2) return '🌐'
  return a2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

function CountryDrawer({ country, edges, onClose, onNodeClick }: {
  country: string; edges: SCEdge[]; onClose: () => void; onNodeClick?: (e: SCEdge) => void
}) {
  const geoRisk = HIGH_GEO_RISK.has(country) ? 'HIGH' : MED_GEO_RISK.has(country) ? 'MEDIUM' : 'LOW'
  const geoColor = geoRisk === 'HIGH' ? '#ef4444' : geoRisk === 'MEDIUM' ? '#f97316' : '#22c55e'

  const groups: { label: string; dir: string; color: string; items: SCEdge[] }[] = [
    { label: 'SUPPLIERS',   dir: 'UPSTREAM',   color: '#00c896', items: edges.filter(e => e.direction === 'UPSTREAM') },
    { label: 'CUSTOMERS',   dir: 'DOWNSTREAM', color: '#f59e0b', items: edges.filter(e => e.direction === 'DOWNSTREAM') },
    { label: 'COMPETITORS', dir: 'COMPETITOR',  color: '#818cf8', items: edges.filter(e => e.direction === 'COMPETITOR') },
    { label: 'SHAREHOLDERS',dir: 'SHAREHOLDER', color: '#eab308', items: edges.filter(e => e.direction === 'SHAREHOLDER') },
    { label: 'OTHER',       dir: 'OTHER',       color: '#5a6380', items: edges.filter(e => !['UPSTREAM','DOWNSTREAM','COMPETITOR','SHAREHOLDER'].includes(e.direction)) },
  ].filter(g => g.items.length > 0)

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{flagEmoji(country)}</span>
          <span className="font-mono font-bold text-sm text-terminal-text">{country}</span>
          <span className={`text-[8px] font-mono tracking-widest`} style={{ color: geoColor }}>
            GEO RISK: {geoRisk}
          </span>
        </div>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-terminal-surface/50 rounded-sm px-3 py-2">
            <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">COUNTRY</div>
            <div className="text-[10px] font-mono text-terminal-text">{country}</div>
          </div>
          <div className="bg-terminal-surface/50 rounded-sm px-3 py-2">
            <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">ENTITIES</div>
            <div className="text-[10px] font-mono text-terminal-text">{edges.length}</div>
          </div>
        </div>

        {/* Grouped entities */}
        {groups.map(g => (
          <div key={g.dir}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
              <span className="text-[8px] font-mono tracking-widest" style={{ color: g.color }}>
                {g.label} ({g.items.length})
              </span>
            </div>
            <div className="space-y-1">
              {g.items.map(n => {
                const pct = n.pct_revenue ?? n.pct_cogs ?? 0
                return (
                  <button key={n.id}
                    onClick={() => onNodeClick?.(n)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-sm text-left hover:brightness-125 transition-all cursor-pointer"
                    style={{ background: '#ffffff06', border: `0.5px solid ${g.color}30` }}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono font-bold text-terminal-text truncate"
                        style={{ color: g.color + 'dd' }}>
                        {n.entity_name}
                      </div>
                      {n.relationship_type && (
                        <div className="text-[8px] font-mono text-terminal-dim/60 truncate mt-0.5">
                          {n.relationship_type.replace(/_/g, ' ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {pct > 0 && (
                        <span className="text-[9px] font-mono" style={{ color: g.color }}>
                          {pct.toFixed(1)}%
                        </span>
                      )}
                      <span className="text-[8px] text-terminal-dim/30 ml-1">→</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Event Detail View ────────────────────────────────────────────────────
function EventDetailView({ eventId, onBack }: { eventId: string, onBack: () => void }) {
  const { cluster, analysis, loading, error } = useEventDeepDive(eventId)

  return (
    <div className="flex flex-col h-full bg-terminal-surface relative">
      <div className="p-3 border-b border-terminal-border bg-terminal-accent/5 sticky top-0 z-10 backdrop-blur flex items-center gap-2">
        <button onClick={onBack} className="text-terminal-dim hover:text-terminal-text transition-colors p-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span className="text-[10px] font-mono tracking-widest text-terminal-accent font-bold">EVENT DEEP DIVE</span>
      </div>

      <div className="p-4 overflow-y-auto space-y-6">
        {loading && !cluster && (
          <div className="flex flex-col gap-3 py-6 items-center flex-1 justify-center">
             <div className="w-full h-1 bg-terminal-accent/20 rounded overflow-hidden relative">
               <div className="absolute top-0 left-0 h-full w-1/3 bg-terminal-accent animate-[scan_1.5s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
             </div>
             <span className="text-[10px] font-mono animate-pulse text-terminal-accent tracking-widest">ANALYZING SOURCES</span>
          </div>
        )}

        {error && (
          <div className="text-[10px] font-mono text-red-500 bg-red-500/10 p-3 rounded border border-red-500/20">
            {error}
          </div>
        )}

        {cluster && (
          <>
            <div>
              <h3 className="font-mono text-[13px] font-bold text-terminal-text mb-2 leading-snug">{cluster.label}</h3>
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("px-1.5 py-0.5 rounded font-mono text-[8px] font-bold tracking-widest")} 
                     style={{ backgroundColor: `${cluster.sentiment > 0 ? '#10b981' : cluster.sentiment < 0 ? '#ef4444' : '#6b7280'}20`, color: cluster.sentiment > 0 ? '#10b981' : cluster.sentiment < 0 ? '#ef4444' : '#6b7280' }}>
                  SENTIMENT: {cluster.sentiment.toFixed(2)}
                </div>
                <div className="px-1.5 py-0.5 rounded bg-terminal-border font-mono text-[8px] tracking-widest text-terminal-dim">
                  VOL: {Math.round(cluster.volatility * 100)}%
                </div>
              </div>

              {cluster.bullets && cluster.bullets.length > 0 && (
                <ul className="space-y-1 mb-4">
                  {cluster.bullets.map((b: string, i: number) => (
                    <li key={i} className="text-[10px] font-mono text-terminal-dim/90 flex gap-2 leading-relaxed">
                      <span className="text-terminal-accent mt-0.5 opacity-70">►</span> {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* AI Deep Dive Section */}
            <div>
              <div className="text-[9px] font-mono tracking-widest text-terminal-accent mb-2 border-b border-terminal-accent/20 pb-1">AI DETAILED SUMMARY</div>
              <div className="text-[10px] font-mono text-terminal-text leading-[1.6] space-y-3 whitespace-pre-wrap">
                {analysis ? analysis : loading ? (
                  <div className="space-y-2 py-2">
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-full" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-11/12" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-5/6" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-full mt-4" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-4/6" />
                  </div>
                ) : (
                  <span className="italic text-terminal-dim/50">Analysis unavailable.</span>
                )}
              </div>
            </div>

            {/* Sources */}
            <div>
               <div className="text-[9px] font-mono tracking-widest text-terminal-dim mb-2 border-b border-terminal-border/50 pb-1">SOURCE ARTICLES ({cluster.members.length})</div>
               <div className="flex flex-col gap-2">
                 {cluster.members.map((m: any) => (
                   <a key={m.article_id} href={m.url} target="_blank" rel="noopener noreferrer" 
                      className="block p-2 bg-terminal-bg border border-terminal-border hover:border-terminal-accent/50 rounded transition-colors group">
                     <div className="text-[10px] font-mono font-bold text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-snug mb-1">
                       {m.title}
                     </div>
                     <div className="flex justify-between items-center text-[8px] font-mono text-terminal-dim">
                       <span>{m.source_id.toUpperCase().replace('_', ' ')}</span>
                       {m.published_at && <span>{new Date(m.published_at).toLocaleDateString()}</span>}
                     </div>
                   </a>
                 ))}
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Entity detail drawer ─────────────────────────────────────────────────
function EntityDetailDrawer({ edge, onClose }: {
  edge: SCEdge; onClose: () => void
}) {
  const [drawerTab, setDrawerTab] = useState<'profile' | 'events'>('profile')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const { profile, loading: profileLoading } = useNodeProfile(edge.entity_ticker)
  
  // Only query events and live research when the tab is explicitly opened to save API costs
  const { events, loading: eventsLoading } = useNodeEvents(drawerTab === 'events' ? edge.entity_name : null)
  const { research, loading: researchLoading, error: researchError } = useLiveResearch(
    drawerTab === 'events' ? edge.entity_name : null,
    edge.relationship_type
  )
  
  const { level, color } = riskLevel(edge)

  return (
    <motion.div
      initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      exit={{ x: 380, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
    >
      <div className="flex flex-col border-b border-terminal-border bg-terminal-surface flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="font-mono font-bold text-sm text-terminal-text truncate max-w-[180px]" title={edge.entity_name}>
              {edge.entity_name}
            </span>
            {edge.entity_ticker && (
              <span className="text-[9px] font-mono text-terminal-accent">{edge.entity_ticker}</span>
            )}
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex px-4 pb-2 gap-4">
          <button
            onClick={() => setDrawerTab('profile')}
            className={cn(
              "text-[10px] font-mono tracking-widest pb-1 border-b-2 transition-colors",
              drawerTab === 'profile' ? "border-terminal-accent text-terminal-accent" : "border-transparent text-terminal-dim hover:text-terminal-text"
            )}
          >
            PROFILE
          </button>
          <button
            onClick={() => setDrawerTab('events')}
            className={cn(
              "text-[10px] font-mono tracking-widest pb-1 border-b-2 transition-colors",
              drawerTab === 'events' ? "border-terminal-accent text-terminal-accent" : "border-transparent text-terminal-dim hover:text-terminal-text"
            )}
          >
            EVENTS & NEWS
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4 relative">
        {selectedEventId ? (
          <div className="absolute inset-0 z-20 bg-terminal-surface">
            <EventDetailView eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />
          </div>
        ) : (
          <>
            {drawerTab === 'profile' ? (
          <>
            {/* Edge metadata */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'DIRECTION',    value: edge.direction },
                { label: 'TYPE',         value: (edge.relationship_type ?? '—').replace(/_/g, ' ') },
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

            {/* Company profile - only if has ticker */}
            {profileLoading && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={10} className="animate-spin text-terminal-accent" />
                <span className="text-[8px] font-mono text-terminal-dim">Loading company data…</span>
              </div>
            )}
            {profile && (
              <>
                <div>
                  <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2">MARKET DATA</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'MARKET CAP', value: fmtMarketCap(profile.market_cap), style: { color: '#00d4ff' } },
                      { label: 'PRICE',      value: fmtPrice(profile.current_price), style: { color: '#22c55e' } },
                      { label: 'P/E RATIO',  value: profile.pe_ratio?.toFixed(1) ?? '—' },
                      { label: 'FORWARD P/E',value: profile.forward_pe?.toFixed(1) ?? '—' },
                      { label: 'BETA',       value: profile.beta?.toFixed(2) ?? '—' },
                      { label: 'EMPLOYEES',  value: fmtNumber(profile.employees) },
                      { label: 'DIV YIELD',  value: profile.dividend_yield > 0 ? fmtPct(profile.dividend_yield) : '—' },
                      { label: 'EXCHANGE',   value: profile.exchange || '—' },
                    ].map(({ label, value, style }) => (
                      <div key={label} className="bg-terminal-surface/50 rounded-sm px-3 py-2">
                        <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5">{label}</div>
                        <div className="text-[10px] font-mono text-terminal-text" style={style}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 52-week range */}
                {profile.fifty_two_week_low != null && profile.fifty_two_week_high != null && profile.current_price != null && (
                  <div>
                    <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">52-WEEK RANGE</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-terminal-dim">{fmtPrice(profile.fifty_two_week_low)}</span>
                      <div className="flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden relative">
                        <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400"
                          style={{ width: '100%', opacity: 0.3 }} />
                        <div className="absolute top-0 h-full w-1 bg-[#00d4ff] rounded-full"
                          style={{ left: `${Math.min(100, Math.max(0, ((profile.current_price - profile.fifty_two_week_low) / (profile.fifty_two_week_high - profile.fifty_two_week_low)) * 100))}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-terminal-dim">{fmtPrice(profile.fifty_two_week_high)}</span>
                    </div>
                  </div>
                )}

                {/* Description */}
                {profile.description && (
                  <div>
                    <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-1">DESCRIPTION</div>
                    <p className="text-[9px] font-mono text-terminal-dim/70 leading-relaxed">
                      {profile.description.slice(0, 300)}{profile.description.length > 300 ? '…' : ''}
                    </p>
                  </div>
                )}
              </>
            )}

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
          </>
        ) : (
          /* Events Tab */
          <div className="space-y-4">
            
            {/* Live AI Research Card */}
            <div className="bg-terminal-surface/20 border border-terminal-accent/30 rounded-sm overflow-hidden text-left relative">
              {/* Animated scanning line effect */}
              {researchLoading && (
                <div className="absolute top-0 left-0 w-full h-[2px] bg-terminal-accent/50 shadow-[0_0_8px_rgba(0,212,255,0.8)] animate-[scan_2s_ease-in-out_infinite]" />
              )}
              
              <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-accent/20 bg-terminal-accent/5">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", researchLoading ? "animate-pulse bg-terminal-dim" : research ? "bg-terminal-accent" : "bg-red-400")} />
                  <span className="text-[9px] font-mono tracking-widest text-terminal-accent">LIVE OSINT INTELLIGENCE</span>
                </div>
                {researchLoading && <span className="text-[8px] font-mono animate-pulse text-terminal-accent">QUERYING WEB...</span>}
              </div>
              
              <div className="p-3">
                {researchLoading ? (
                  <div className="space-y-2">
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-full" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-5/6" />
                    <div className="h-2 bg-terminal-surface/50 rounded animate-pulse w-4/6" />
                  </div>
                ) : researchError ? (
                  <div className="text-[9px] font-mono text-red-400">Failed to generate live research: {researchError}</div>
                ) : research ? (
                  <div className="space-y-3">
                    <p className="text-[10px] font-mono text-terminal-text leading-relaxed">
                      {research.summary}
                    </p>
                    
                    {research.key_developments.length > 0 && (
                      <div>
                        <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-1">KEY DEVELOPMENTS</div>
                        <ul className="space-y-1">
                          {research.key_developments.map((dev, i) => (
                            <li key={i} className="text-[9px] font-mono text-terminal-dim/90 flex gap-1.5">
                              <span className="text-terminal-accent">»</span> {dev}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(research.risk_indicators.length > 0 || research.known_affiliations.length > 0) && (
                      <div className="grid grid-cols-2 gap-2 border-t border-terminal-border pt-2">
                        {research.risk_indicators.length > 0 && (
                          <div>
                            <div className="text-[8px] font-mono text-red-400 tracking-widest mb-1">RISK FLAGS</div>
                            <ul className="space-y-0.5">
                              {research.risk_indicators.map((r, i) => (
                                <li key={i} className="text-[8px] font-mono text-red-400/80 truncate" title={r}>• {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {research.known_affiliations.length > 0 && (
                          <div>
                            <div className="text-[8px] font-mono text-terminal-dim tracking-widest mb-1">AFFILIATIONS</div>
                            <ul className="space-y-0.5">
                              {research.known_affiliations.slice(0, 3).map((a, i) => (
                                <li key={i} className="text-[8px] font-mono text-terminal-dim/70 truncate" title={a}>• {a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[9px] font-mono text-terminal-dim/50 italic">No research available.</div>
                )}
              </div>
            </div>

            {/* Local DB Events Header */}
            <div className="text-[9px] font-mono tracking-widest text-terminal-dim border-b border-terminal-border/50 pb-1 mt-4">
              LOCAL DATABASE MENTIONS
            </div>

            {eventsLoading && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={10} className="animate-spin text-terminal-accent" />
                <span className="text-[8px] font-mono text-terminal-dim">Searching internal feed…</span>
              </div>
            )}
            
            {!eventsLoading && events.length === 0 && (
              <p className="text-[9px] font-mono text-terminal-dim/50 leading-relaxed py-2 italic font-medium">
                No recent event clusters found for "{edge.entity_name}" in database.
              </p>
            )}

            {!eventsLoading && events.map((ev) => {
              const sentColor = ev.sentiment > 0.2 ? '#10b981' : ev.sentiment < -0.2 ? '#f87171' : '#6b7280'
              return (
                <button 
                  key={ev.cluster_id} 
                  onClick={() => setSelectedEventId(ev.cluster_id)}
                  className="w-full text-left bg-terminal-surface/30 border border-terminal-border rounded-sm p-3 hover:bg-terminal-surface/80 hover:border-terminal-accent/50 transition-colors group"
                >
                  <div className="text-[11px] font-bold font-mono text-terminal-text group-hover:text-terminal-accent leading-snug mb-2 transition-colors">
                    {ev.label}
                  </div>
                  
                  {ev.bullets && ev.bullets.length > 0 && (
                     <div className="text-[9px] font-mono text-terminal-dim/80 mb-2 truncate">
                       • {ev.bullets[0]}
                     </div>
                  )}

                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <div className="flex items-center gap-2">
                      <span style={{ color: sentColor }}>SENT {(ev.sentiment > 0 ? '+' : '') + ev.sentiment.toFixed(2)}</span>
                      <span className="text-terminal-dim">VOL {Math.round(ev.volatility * 100)}%</span>
                    </div>
                    <span className="text-terminal-dim/50 flex flex-col items-end">
                      {ev.member_count} src
                      <span className="text-terminal-accent/0 group-hover:text-terminal-accent/100 transition-opacity flex items-center gap-0.5 mt-1">
                        DEEP DIVE <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
          </>
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
interface SupplyChainViewProps {
  initialTicker?:    string
  onTickerChange?:   (ticker: string | null) => void
}

export function SupplyChainView({ initialTicker, onTickerChange }: SupplyChainViewProps) {
  const [input,        setInput]        = useState(initialTicker ?? '')
  const [suggestions,  setSuggestions]  = useState<SCSearchResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [company,      setCompany]      = useState<SCCompany | null>(null)
  const [edges,        setEdges]        = useState<SCEdge[]>([])
  const [tab,          setTab]          = useState<ViewTab>('graph')
  const [selected,     setSelected]     = useState<DrawerItem | null>(null)
  const [analysing,    setAnalysing]    = useState(false)
  const [prevTickers,  setPrevTickers]  = useState<SCCompany[]>([])
  const inputRef  = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    api.splc.list().then(setPrevTickers).catch(() => {})
  }, [])

  // Load ticker from URL on mount
  useEffect(() => {
    if (initialTicker) load(initialTicker)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    onTickerChange?.(ticker.toUpperCase())
    try {
      const data = await api.splc.get(ticker)
      setCompany(data.company)
      // Silently fetch company profile to inject shareholders + board as nodes
      const allEdges = [...data.edges]
      try {
        const profile = await api.company.get(ticker)
        allEdges.push(...buildMetaNodes(profile))
      } catch (profileErr) { console.warn('[SPLC] company profile fetch failed:', profileErr) }
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
      } catch (profileErr) { console.warn('[SPLC] company profile fetch failed:', profileErr) }
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
    if (company?.ticker === ticker) { setCompany(null); setEdges([]); onTickerChange?.(null) }
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
                      onNodeClick={e => setSelected({ kind: 'entity', edge: e })}
                      onHubClick={(dir, label, nodes) => setSelected({ kind: 'hub', dir, label, nodes })}
                      onFocalClick={() => setSelected({ kind: 'focal', company, edges })}
                    />
                  </div>
                ) : tab === 'table' ? (
                  <SCTable
                    edges={edges}
                    onRowClick={e => setSelected({ kind: 'edge', edge: e })}
                    onCellClick={ev => {
                      switch (ev.type) {
                        case 'entity':
                          setSelected({ kind: 'entity', edge: ev.edge })
                          break
                        case 'direction': {
                          const dirLabel = ev.direction === 'UPSTREAM' ? 'SUPPLIERS'
                            : ev.direction === 'DOWNSTREAM' ? 'CUSTOMERS'
                            : ev.direction === 'COMPETITOR' ? 'COMPETITORS'
                            : ev.direction
                          setSelected({ kind: 'hub', dir: ev.direction, label: dirLabel, nodes: ev.edges })
                          break
                        }
                        case 'country':
                          setSelected({ kind: 'country', country: ev.country, edges: ev.edges })
                          break
                        case 'edge':
                          setSelected({ kind: 'edge', edge: ev.edge })
                          break
                      }
                    }}
                  />
                ) : (
                  <SCIntel company={company} edges={edges} />
                )}
              </div>
            )}
          </div>

          {/* Drawers */}
          <AnimatePresence>
            {selected?.kind === 'edge' && (
              <EvidenceDrawer
                key={selected.edge.id}
                edge={selected.edge}
                onClose={() => setSelected(null)}
              />
            )}
            {selected?.kind === 'hub' && (
              <HubDrawer
                key={`hub-${selected.dir}`}
                dir={selected.dir}
                label={selected.label}
                nodes={selected.nodes}
                onClose={() => setSelected(null)}
                onNodeClick={e => setSelected({ kind: 'entity', edge: e })}
              />
            )}
            {selected?.kind === 'country' && (
              <CountryDrawer
                key={`country-${selected.country}`}
                country={selected.country}
                edges={selected.edges}
                onClose={() => setSelected(null)}
                onNodeClick={e => setSelected({ kind: 'entity', edge: e })}
              />
            )}
            {selected?.kind === 'entity' && (
              <EntityDetailDrawer
                key={`entity-${selected.edge.id}`}
                edge={selected.edge}
                onClose={() => setSelected(null)}
              />
            )}
            {selected?.kind === 'focal' && (
              <FocalDrawer
                key="focal"
                company={selected.company}
                edges={selected.edges}
                onClose={() => setSelected(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
