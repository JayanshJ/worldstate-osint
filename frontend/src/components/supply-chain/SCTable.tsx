/**
 * SCTable — filterable, sortable table view of supply chain edges.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import type { SCEdge } from '@/lib/api'
import { cn } from '@/lib/utils'

type Direction = 'ALL' | 'UPSTREAM' | 'DOWNSTREAM' | 'COMPETITOR'
type SortKey   = 'entity_name' | 'pct_revenue' | 'pct_cogs' | 'confidence' | 'risk'

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
  if (s >= 80) return { label: 'HIGH',   cls: 'text-red-400   border-red-400/40   bg-red-400/10' }
  if (s >= 50) return { label: 'MED',    cls: 'text-orange-400 border-orange-400/40 bg-orange-400/10' }
  if (s >= 20) return { label: 'LOW',    cls: 'text-green-400 border-green-400/40 bg-green-400/10' }
  return              { label: 'NONE',   cls: 'text-terminal-dim border-terminal-border bg-transparent' }
}

const DISC_STYLE: Record<string, string> = {
  DISCLOSED: 'text-terminal-accent',
  ESTIMATED: 'text-yellow-400',
  INFERRED:  'text-terminal-dim',
}
const DISC_ICON: Record<string, string> = {
  DISCLOSED: '📄',
  ESTIMATED: '~',
  INFERRED:  '⚡',
}

interface SCTableProps {
  edges:       SCEdge[]
  onRowClick:  (e: SCEdge) => void
}

export function SCTable({ edges, onRowClick }: SCTableProps) {
  const [direction, setDirection] = useState<Direction>('ALL')
  const [sortKey,   setSortKey]   = useState<SortKey>('risk')
  const [sortAsc,   setSortAsc]   = useState(false)

  const filtered = useMemo(() => {
    let rows = direction === 'ALL' ? edges : edges.filter(e => e.direction === direction)
    rows = [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'entity_name') {
        cmp = a.entity_name.localeCompare(b.entity_name)
      } else if (sortKey === 'pct_revenue') {
        cmp = (a.pct_revenue ?? 0) - (b.pct_revenue ?? 0)
      } else if (sortKey === 'pct_cogs') {
        cmp = (a.pct_cogs ?? 0) - (b.pct_cogs ?? 0)
      } else if (sortKey === 'confidence') {
        cmp = (a.confidence ?? 0) - (b.confidence ?? 0)
      } else {
        cmp = riskScore(a) - riskScore(b)
      }
      return sortAsc ? cmp : -cmp
    })
    return rows
  }, [edges, direction, sortKey, sortAsc])

  function sort(key: SortKey) {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={9} className="text-terminal-dim/40" />
    return sortAsc
      ? <ChevronUp size={9} className="text-terminal-accent" />
      : <ChevronDown size={9} className="text-terminal-accent" />
  }

  const dirCounts = useMemo(() => ({
    ALL:        edges.length,
    UPSTREAM:   edges.filter(e => e.direction === 'UPSTREAM').length,
    DOWNSTREAM: edges.filter(e => e.direction === 'DOWNSTREAM').length,
    COMPETITOR: edges.filter(e => e.direction === 'COMPETITOR').length,
  }), [edges])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-terminal-border bg-terminal-surface/40 flex-shrink-0">
        {(['ALL', 'UPSTREAM', 'DOWNSTREAM', 'COMPETITOR'] as Direction[]).map(d => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={cn(
              'text-[9px] font-mono tracking-widest px-2 py-1 rounded-sm transition-colors border',
              direction === d
                ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                : 'text-terminal-dim border-transparent hover:text-terminal-text',
            )}
          >
            {d} <span className="text-terminal-dim/60">{dirCounts[d]}</span>
          </button>
        ))}
        <span className="ml-auto text-[9px] font-mono text-terminal-dim/50">
          {filtered.length} row{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-terminal-surface z-10">
            <tr className="text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border">
              <th className="px-4 py-2 font-normal">
                <button onClick={() => sort('entity_name')} className="flex items-center gap-1 hover:text-terminal-text">
                  ENTITY <SortIcon k="entity_name" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">DIR</th>
              <th className="px-2 py-2 font-normal">TYPE</th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('pct_revenue')} className="flex items-center gap-1 hover:text-terminal-text">
                  REV% <SortIcon k="pct_revenue" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('pct_cogs')} className="flex items-center gap-1 hover:text-terminal-text">
                  COGS% <SortIcon k="pct_cogs" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">SOLE</th>
              <th className="px-2 py-2 font-normal">GEO</th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('risk')} className="flex items-center gap-1 hover:text-terminal-text">
                  RISK <SortIcon k="risk" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">
                <button onClick={() => sort('confidence')} className="flex items-center gap-1 hover:text-terminal-text">
                  CONF <SortIcon k="confidence" />
                </button>
              </th>
              <th className="px-2 py-2 font-normal">SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const { label, cls } = RISK_LABEL(e)
              const exp = e.pct_revenue ?? e.pct_cogs
              return (
                <tr
                  key={e.id}
                  onClick={() => onRowClick(e)}
                  className={cn(
                    'border-b border-terminal-border/30 cursor-pointer transition-colors text-[11px] font-mono',
                    i % 2 === 0 ? 'bg-terminal-bg' : 'bg-terminal-surface/20',
                    'hover:bg-terminal-muted/30',
                  )}
                >
                  {/* Entity name */}
                  <td className="px-4 py-2.5 text-terminal-text max-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      {e.sole_source && (
                        <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
                      )}
                      <span className="truncate">{e.entity_name}</span>
                    </div>
                  </td>
                  {/* Direction */}
                  <td className="px-2 py-2.5">
                    <span className={cn(
                      'text-[9px] tracking-wider',
                      e.direction === 'UPSTREAM'   ? 'text-sky-400'   :
                      e.direction === 'DOWNSTREAM' ? 'text-green-400' :
                                                     'text-terminal-dim'
                    )}>
                      {e.direction === 'UPSTREAM' ? '↑ UP' : e.direction === 'DOWNSTREAM' ? '↓ DN' : '↔ CO'}
                    </span>
                  </td>
                  {/* Relationship type */}
                  <td className="px-2 py-2.5 text-terminal-dim text-[9px]">
                    {(e.relationship_type ?? '').replace('_', ' ')}
                  </td>
                  {/* Rev% */}
                  <td className="px-2 py-2.5 text-right">
                    {e.pct_revenue != null
                      ? <span className="text-green-400">{e.pct_revenue.toFixed(1)}%</span>
                      : <span className="text-terminal-dim/30">—</span>
                    }
                  </td>
                  {/* COGS% */}
                  <td className="px-2 py-2.5 text-right">
                    {e.pct_cogs != null
                      ? <span className="text-sky-400">{e.pct_cogs.toFixed(1)}%</span>
                      : <span className="text-terminal-dim/30">—</span>
                    }
                  </td>
                  {/* Sole source */}
                  <td className="px-2 py-2.5 text-center">
                    {e.sole_source
                      ? <span className="text-red-400 text-[10px]">YES</span>
                      : <span className="text-terminal-dim/30 text-[10px]">—</span>
                    }
                  </td>
                  {/* Geography */}
                  <td className="px-2 py-2.5 text-terminal-dim text-[9px]">
                    {e.hq_country ?? '—'}
                  </td>
                  {/* Risk */}
                  <td className="px-2 py-2.5">
                    <span className={cn('text-[9px] border px-1 py-0.5 rounded-sm', cls)}>
                      {label}
                    </span>
                  </td>
                  {/* Confidence */}
                  <td className="px-2 py-2.5 text-right">
                    <span className="text-terminal-dim text-[9px]">
                      {((e.confidence ?? 1) * 100).toFixed(0)}%
                    </span>
                  </td>
                  {/* Disclosure type */}
                  <td className="px-2 py-2.5">
                    <span className={cn('text-[9px]', DISC_STYLE[e.disclosure_type ?? 'INFERRED'])}>
                      {DISC_ICON[e.disclosure_type ?? 'INFERRED']} {e.disclosure_type ?? '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24 text-terminal-dim/40 font-mono text-xs">
            No {direction === 'ALL' ? '' : direction.toLowerCase() + ' '}relationships found
          </div>
        )}
      </div>
    </div>
  )
}
