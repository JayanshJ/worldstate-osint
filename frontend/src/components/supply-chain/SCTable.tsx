/**
 * SCTable — filterable, sortable, searchable table view of supply chain edges.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react'
import type { SCEdge } from '@/lib/api'
import { cn } from '@/lib/utils'

type Direction = 'ALL' | 'UPSTREAM' | 'DOWNSTREAM' | 'COMPETITOR'
type SortKey   = 'entity_name' | 'pct_revenue' | 'pct_cogs' | 'confidence' | 'risk' | 'tier'

function riskScore(e: SCEdge): number {
  const exp = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source) return 100
  if (exp >= 20) return 80
  if (exp >= 10) return 50
  if (exp > 0)   return 20
  return 5
}

const RISK_LABEL = (e: SCEdge) => {
  const s = riskScore(e)
  if (s >= 80) return { label: 'HIGH', color: '#ef4444', bg: 'bg-red-400/10    border-red-400/30'    }
  if (s >= 50) return { label: 'MED',  color: '#f97316', bg: 'bg-orange-400/10 border-orange-400/30' }
  if (s >= 20) return { label: 'LOW',  color: '#22c55e', bg: 'bg-green-400/10  border-green-400/30'  }
  return              { label: '—',    color: '#5a6380', bg: 'bg-transparent   border-terminal-border' }
}

const DIR_CONFIG: Record<string, { label: string; color: string }> = {
  UPSTREAM:    { label: '↑ SUPPLIER',    color: '#0ea5e9' },
  DOWNSTREAM:  { label: '↓ CUSTOMER',    color: '#22c55e' },
  COMPETITOR:  { label: '↔ COMPETITOR',  color: '#9ca3af' },
  SHAREHOLDER: { label: '◆ HOLDER',      color: '#eab308' },
  BOARD:       { label: '● BOARD',       color: '#e879f9' },
  ANALYST:     { label: '◈ ANALYST',     color: '#a78bfa' },
  INDUSTRY:    { label: '▣ INDUSTRY',    color: '#06b6d4' },
}

const DISC_ICON: Record<string, string> = {
  DISCLOSED: '📄', ESTIMATED: '~', INFERRED: '⚡',
}
const DISC_COLOR: Record<string, string> = {
  DISCLOSED: '#00d4ff', ESTIMATED: '#eab308', INFERRED: '#5a6380',
}

// Mini inline bar
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1 bg-terminal-border rounded-full overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color }} className="text-[9px] font-mono tabular-nums">{value.toFixed(1)}%</span>
    </div>
  )
}

// Typed cell-click events for contextual side panel
export type CellClickEvent =
  | { type: 'entity';    edge: SCEdge }
  | { type: 'direction'; direction: string; edges: SCEdge[] }
  | { type: 'country';   country: string; edges: SCEdge[] }
  | { type: 'edge';      edge: SCEdge }

interface SCTableProps {
  edges:       SCEdge[]
  onRowClick:  (e: SCEdge) => void
  onCellClick?: (ev: CellClickEvent) => void
}

export function SCTable({ edges, onRowClick, onCellClick }: SCTableProps) {
  const [direction, setDirection] = useState<Direction>('ALL')
  const [sortKey,   setSortKey]   = useState<SortKey>('risk')
  const [sortAsc,   setSortAsc]   = useState(false)
  const [search,    setSearch]    = useState('')

  const maxExp = useMemo(() =>
    Math.max(1, ...edges.map(e => e.pct_revenue ?? e.pct_cogs ?? 0)),
  [edges])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = edges.filter(e => {
      if (direction !== 'ALL' && e.direction !== direction) return false
      if (q && !e.entity_name.toLowerCase().includes(q) &&
              !(e.hq_country?.toLowerCase().includes(q)) &&
              !(e.relationship_type?.toLowerCase().includes(q))) return false
      return true
    })
    rows = [...rows].sort((a, b) => {
      let cmp = 0
      if      (sortKey === 'entity_name') cmp = a.entity_name.localeCompare(b.entity_name)
      else if (sortKey === 'pct_revenue') cmp = (a.pct_revenue ?? 0) - (b.pct_revenue ?? 0)
      else if (sortKey === 'pct_cogs')    cmp = (a.pct_cogs    ?? 0) - (b.pct_cogs    ?? 0)
      else if (sortKey === 'confidence')  cmp = (a.confidence  ?? 0) - (b.confidence  ?? 0)
      else if (sortKey === 'tier')        cmp = (a.tier        ?? 1) - (b.tier        ?? 1)
      else                                cmp = riskScore(a) - riskScore(b)
      return sortAsc ? cmp : -cmp
    })
    return rows
  }, [edges, direction, sortKey, sortAsc, search])

  function sort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={8} className="text-terminal-dim/30" />
    return sortAsc
      ? <ChevronUp   size={8} className="text-terminal-accent" />
      : <ChevronDown size={8} className="text-terminal-accent" />
  }

  const dirCounts = useMemo(() => ({
    ALL:        edges.length,
    UPSTREAM:   edges.filter(e => e.direction === 'UPSTREAM').length,
    DOWNSTREAM: edges.filter(e => e.direction === 'DOWNSTREAM').length,
    COMPETITOR: edges.filter(e => e.direction === 'COMPETITOR').length,
  }), [edges])

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-surface/40 flex-shrink-0 flex-wrap">
        {/* Direction filters */}
        <div className="flex items-center gap-1">
          {(['ALL', 'UPSTREAM', 'DOWNSTREAM', 'COMPETITOR'] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={cn(
                'text-[8px] font-mono tracking-widest px-2 py-1 rounded-sm transition-colors border',
                direction === d
                  ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                  : 'text-terminal-dim border-transparent hover:text-terminal-text',
              )}
            >
              {d === 'ALL' ? 'ALL' : d === 'UPSTREAM' ? 'SUPPLIERS' : d === 'DOWNSTREAM' ? 'CUSTOMERS' : 'COMPETITORS'}
              {' '}<span className="opacity-50">{dirCounts[d]}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-dim/50 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-7 pr-3 py-1 bg-terminal-bg border border-terminal-border rounded-sm font-mono text-[10px] text-terminal-text placeholder:text-terminal-dim/30 focus:outline-none focus:border-terminal-accent/50 w-36"
          />
        </div>

        <span className="text-[9px] font-mono text-terminal-dim/40">
          {filtered.length} / {edges.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <table className="w-full text-left border-collapse min-w-[680px]">
          <thead className="sticky top-0 bg-terminal-surface z-10">
            <tr className="text-[8px] font-mono text-terminal-dim/70 tracking-widest border-b border-terminal-border">
              <th className="px-4 py-2 font-normal w-[200px]">
                <button onClick={() => sort('entity_name')} className="flex items-center gap-1 hover:text-terminal-text">
                  ENTITY <SortIcon k="entity_name" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">DIR</th>
              <th className="px-2 py-2 font-normal">TYPE</th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('tier')} className="flex items-center gap-1 hover:text-terminal-text">
                  TIER <SortIcon k="tier" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">GEO</th>
              <th className="px-2 py-2 font-normal w-[110px]">
                <button onClick={() => sort('pct_revenue')} className="flex items-center gap-1 hover:text-terminal-text">
                  EXPOSURE <SortIcon k="pct_revenue" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('risk')} className="flex items-center gap-1 hover:text-terminal-text">
                  RISK <SortIcon k="risk" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal w-[90px]">
                <button onClick={() => sort('confidence')} className="flex items-center gap-1 hover:text-terminal-text">
                  CONF <SortIcon k="confidence" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const { label, color, bg } = RISK_LABEL(e)
              const exp = e.pct_revenue ?? e.pct_cogs
              const expLabel = e.pct_revenue != null ? 'REV' : e.pct_cogs != null ? 'COG' : null
              const dirCfg = DIR_CONFIG[e.direction] ?? { label: e.direction, color: '#5a6380' }
              const conf = (e.confidence ?? 0.75) * 100

              // Cell click helper: stops row-level propagation and emits typed event
              const cell = (ev: CellClickEvent) => (me: React.MouseEvent) => {
                me.stopPropagation()
                onCellClick?.(ev)
              }

              return (
                <tr
                  key={e.id}
                  onClick={() => onRowClick(e)}
                  className={cn(
                    'border-b border-terminal-border/20 cursor-pointer transition-colors group',
                    i % 2 === 0 ? 'bg-terminal-bg' : 'bg-terminal-surface/15',
                    'hover:bg-terminal-accent/5',
                  )}
                >
                  {/* Entity name */}
                  <td
                    className="px-4 py-2 text-[11px] font-mono text-terminal-text cursor-pointer"
                    onClick={cell({ type: 'entity', edge: e })}
                  >
                    <div className="flex items-center gap-1.5 max-w-[200px]">
                      {e.sole_source && (
                        <span title="Sole source" className="flex items-center">
                          <AlertTriangle size={9} className="text-red-400 flex-shrink-0" />
                        </span>
                      )}
                      <span className="truncate group-hover:text-white transition-colors hover:underline hover:decoration-terminal-accent/40">
                        {e.entity_name}
                      </span>
                    </div>
                  </td>

                  {/* Direction */}
                  <td
                    className="px-2 py-2 cursor-pointer"
                    onClick={cell({ type: 'direction', direction: e.direction, edges: edges.filter(x => x.direction === e.direction) })}
                  >
                    <span className="text-[8px] font-mono hover:brightness-150 transition-all" style={{ color: dirCfg.color }}>
                      {dirCfg.label}
                    </span>
                  </td>

                  {/* Type */}
                  <td
                    className="px-2 py-2 text-[9px] font-mono text-terminal-dim/70 cursor-pointer hover:text-terminal-text transition-colors"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    {(e.relationship_type ?? '').replaceAll('_', ' ')}
                  </td>

                  {/* Tier */}
                  <td
                    className="px-2 py-2 text-center cursor-pointer hover:text-terminal-text transition-colors"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    <span className="text-[9px] font-mono text-terminal-dim/60">
                      T{e.tier ?? 1}
                    </span>
                  </td>

                  {/* Geo */}
                  <td
                    className="px-2 py-2 text-[9px] font-mono text-terminal-dim/70 cursor-pointer hover:text-terminal-text hover:underline hover:decoration-terminal-accent/40 transition-colors"
                    onClick={cell(e.hq_country
                      ? { type: 'country', country: e.hq_country, edges: edges.filter(x => x.hq_country === e.hq_country) }
                      : { type: 'edge', edge: e })}
                  >
                    {e.hq_country ?? '—'}
                  </td>

                  {/* Exposure */}
                  <td
                    className="px-2 py-2 cursor-pointer"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    {exp != null ? (
                      <div className="flex items-center gap-1 hover:brightness-125 transition-all">
                        <MiniBar value={exp} max={maxExp} color={e.pct_revenue != null ? '#22c55e' : '#0ea5e9'} />
                        <span className="text-[7px] font-mono text-terminal-dim/40">{expLabel}</span>
                      </div>
                    ) : (
                      <span className="text-terminal-dim/25 text-[9px] font-mono">—</span>
                    )}
                  </td>

                  {/* Risk */}
                  <td
                    className="px-2 py-2 cursor-pointer"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    <span
                      className={cn('text-[8px] font-mono border px-1.5 py-0.5 rounded-sm hover:brightness-125 transition-all', bg)}
                      style={{ color }}
                    >
                      {label}
                    </span>
                  </td>

                  {/* Confidence bar */}
                  <td
                    className="px-2 py-2 cursor-pointer"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    <div className="flex items-center gap-1.5 hover:brightness-125 transition-all">
                      <div className="w-10 h-1 bg-terminal-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${conf}%`,
                            background: conf >= 80 ? '#00d4ff' : conf >= 55 ? '#eab308' : '#5a6380',
                          }}
                        />
                      </div>
                      <span className="text-[8px] font-mono text-terminal-dim/50 tabular-nums">
                        {conf.toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  {/* Disclosure */}
                  <td
                    className="px-2 py-2 cursor-pointer hover:brightness-125 transition-all"
                    onClick={cell({ type: 'edge', edge: e })}
                  >
                    <span
                      className="text-[8px] font-mono"
                      style={{ color: DISC_COLOR[e.disclosure_type ?? 'INFERRED'] }}
                    >
                      {DISC_ICON[e.disclosure_type ?? 'INFERRED']} {e.disclosure_type ?? '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-20 text-terminal-dim/30 font-mono text-[11px]">
            {search ? `No matches for "${search}"` : `No ${direction === 'ALL' ? '' : direction.toLowerCase() + ' '}relationships`}
          </div>
        )}
      </div>
    </div>
  )
}
