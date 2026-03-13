/**
 * SCGraph — Bloomberg-style radial supply-chain network.
 * Focal node at centre; suppliers fan left, customers fan right,
 * competitors arc below.  No extra npm deps.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Node colour palette (by direction) ──────────────────────────────────────
const DIR = {
  UPSTREAM: {
    bg:     '#040f0a',
    border: '#00c896',
    text:   '#6ee7c7',
    edge:   '#00c896',
    label:  'SUPPLIERS',
  },
  DOWNSTREAM: {
    bg:     '#100900',
    border: '#f59e0b',
    text:   '#fcd34d',
    edge:   '#f59e0b',
    label:  'CUSTOMERS',
  },
  COMPETITOR: {
    bg:     '#08081a',
    border: '#818cf8',
    text:   '#a5b4fc',
    edge:   '#818cf8',
    label:  'COMPETITORS',
  },
} as const

const RISK_COLOR = {
  HIGH:   '#ef4444',
  MEDIUM: '#f97316',
  LOW:    '#22c55e',
  NONE:   '#334155',
}

function riskOf(e: SCEdge): keyof typeof RISK_COLOR {
  const x = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source || x >= 20) return 'HIGH'
  if (x >= 10) return 'MEDIUM'
  if (x > 0)   return 'LOW'
  return 'NONE'
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W   = 130
const NODE_H   = 30
const HW       = NODE_W / 2
const HH       = NODE_H / 2
const DEG      = Math.PI / 180

// Sector centres (radians, SVG: 0=right, π/2=down, π=left)
const UP_MID   = 180 * DEG   // left
const DOWN_MID =   0 * DEG   // right
const COMP_MID =  90 * DEG   // bottom

// Base radii — inflated for dense columns in layout()
const R_T1_BASE   = 195
const R_T2_BASE   = 320
const R_DOWN_BASE = 215
const R_COMP_BASE = 195

// Max arc span per sector
const MAX_SPAN_UP   = 130 * DEG
const MAX_SPAN_DOWN = 120 * DEG
const MAX_SPAN_COMP = 110 * DEG

/**
 * Evenly distribute `count` nodes across an arc centred at `mid`.
 * The span auto-expands so consecutive nodes are at least `minGap` apart (arc-distance).
 */
function arcAngles(count: number, mid: number, baseSpan: number, maxSpan: number, radius: number): number[] {
  if (count === 0) return []
  if (count === 1) return [mid]
  const minGap    = NODE_H + 4          // pixels between node centres along arc
  const needed    = (count - 1) * (minGap / radius)   // radians needed
  const span      = Math.min(maxSpan, Math.max(baseSpan, needed))
  return Array.from({ length: count }, (_, i) =>
    mid - span / 2 + (i / (count - 1)) * span
  )
}

interface LayoutNode extends SCEdge { _x: number; _y: number }

export interface SCGraphProps {
  ticker:      string
  legalName:   string
  edges:       SCEdge[]
  onNodeClick: (e: SCEdge) => void
}

export function SCGraph({ ticker, legalName, edges, onNodeClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // ── Pan / zoom ──────────────────────────────────────────────────────────────
  const [tf, setTf] = useState({ x: 0, y: 0, s: 1 })
  const dragging    = useRef(false)
  const lastPos     = useRef({ x: 0, y: 0 })
  const svgRef      = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        // Pinch-to-zoom anchored at cursor
        const rect   = svg.getBoundingClientRect()
        const mx     = e.clientX - rect.left
        const my     = e.clientY - rect.top
        const factor = Math.exp(-e.deltaY / 300)
        setTf(t => {
          const s2    = Math.max(0.1, Math.min(6, t.s * factor))
          const ratio = s2 / t.s
          return { s: s2, x: mx - ratio * (mx - t.x), y: my - ratio * (my - t.y) }
        })
      } else {
        // Two-finger scroll → pan
        setTf(t => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('g[data-node]')) return
    dragging.current = true
    lastPos.current  = { x: e.clientX, y: e.clientY }
    e.currentTarget.style.cursor = 'grabbing'
  }, [])
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = false
    e.currentTarget.style.cursor = 'grab'
  }, [])
  const resetView = useCallback(() => setTf({ x: 0, y: 0, s: 1 }), [])

  // ── Radial layout ───────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const upT2 = edges.filter(e => e.direction === 'UPSTREAM'   && e.tier === 2)
    const upT1 = edges.filter(e => e.direction === 'UPSTREAM'   && (e.tier ?? 1) === 1)
    const down = edges.filter(e => e.direction === 'DOWNSTREAM')
    const comp = edges.filter(e => e.direction === 'COMPETITOR')

    // Scale radius up if column is dense so nodes don't overlap
    const t1R   = Math.max(R_T1_BASE,   upT1.length * 22)
    const t2R   = Math.max(R_T2_BASE,   upT2.length * 22)
    const downR = Math.max(R_DOWN_BASE, down.length * 22)
    const compR = Math.max(R_COMP_BASE, comp.length * 24)

    // Canvas — set focal centre, then compute tight bounding viewBox
    const CX = Math.max(t2R, t1R) + HW + 32
    const CY = compR + HH + 48   // leave room for competitor arc below

    function place(nodes: SCEdge[], mid: number, baseSpan: number, maxSpan: number, radius: number): LayoutNode[] {
      const angles = arcAngles(nodes.length, mid, baseSpan, maxSpan, radius)
      return nodes.map((n, i) => ({
        ...n,
        _x: CX + radius * Math.cos(angles[i]) - HW,
        _y: CY + radius * Math.sin(angles[i]) - HH,
      } as LayoutNode))
    }

    const t1Nodes   = place(upT1, UP_MID,   80 * DEG, MAX_SPAN_UP,   t1R)
    const t2Nodes   = place(upT2, UP_MID,   90 * DEG, MAX_SPAN_UP,   t2R)
    const downNodes = place(down, DOWN_MID, 70 * DEG, MAX_SPAN_DOWN, downR)
    const compNodes = place(comp, COMP_MID, 60 * DEG, MAX_SPAN_COMP, compR)

    const all = [...t1Nodes, ...t2Nodes, ...downNodes, ...compNodes]

    // Tight viewBox
    const xs  = all.map(n => n._x)
    const ys  = all.map(n => n._y)
    const pad = 24
    const minX = Math.min(...xs, CX - 60) - pad
    const minY = Math.min(...ys, CY - 32) - pad
    const maxX = Math.max(...xs.map(x => x + NODE_W), CX + 60) + pad
    const maxY = Math.max(...ys.map(y => y + NODE_H), CY + 32) + pad

    return {
      t1Nodes, t2Nodes, downNodes, compNodes,
      CX, CY,
      VBX: minX, VBY: minY, VBW: maxX - minX, VBH: maxY - minY,
      t1R, t2R, downR, compR,
    }
  }, [edges])

  const { t1Nodes, t2Nodes, downNodes, compNodes, CX, CY, VBX, VBY, VBW, VBH } = layout
  const allNodes = [...t1Nodes, ...t2Nodes, ...downNodes, ...compNodes]

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 240 }}>
      {/* RESET button */}
      <button
        onClick={resetView}
        className="absolute top-2 right-2 z-10 text-[9px] font-mono tracking-widest px-2 py-1 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-accent/40 rounded-sm transition-colors"
      >
        RESET
      </button>
      <div className="absolute bottom-2 right-2 z-10 text-[8px] font-mono text-terminal-dim/30 pointer-events-none select-none">
        pinch to zoom · scroll to pan · drag to pan
      </div>

      <svg
        ref={svgRef}
        viewBox={`${VBX} ${VBY} ${VBW} ${VBH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {/* Soft glow for focal node */}
          <filter id="sc-glow-f" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Subtle edge glow on hover */}
          <filter id="sc-glow-e" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Arrow markers */}
          {(['UPSTREAM', 'DOWNSTREAM'] as const).map(d => (
            <marker key={d} id={`sc-arr-${d}`} markerWidth={5} markerHeight={5} refX={4} refY={2.5} orient="auto">
              <path d="M0,0 L0,5 L5,2.5z" fill={DIR[d].edge} fillOpacity={0.5} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.s})`}>

          {/* ── Sector labels ── */}
          {t1Nodes.length > 0 && (
            <text x={CX - layout.t1R - 16} y={CY - 4} textAnchor="end"
              fontSize={7.5} fill="#00c89650" letterSpacing={2} fontFamily="monospace">
              SUPPLIERS
            </text>
          )}
          {t2Nodes.length > 0 && (
            <text x={CX - layout.t2R - 16} y={CY - 4} textAnchor="end"
              fontSize={7} fill="#00c89635" letterSpacing={2} fontFamily="monospace">
              TIER-2
            </text>
          )}
          {downNodes.length > 0 && (
            <text x={CX + layout.downR + 16} y={CY - 4} textAnchor="start"
              fontSize={7.5} fill="#f59e0b50" letterSpacing={2} fontFamily="monospace">
              CUSTOMERS
            </text>
          )}
          {compNodes.length > 0 && (
            <text x={CX} y={CY + layout.compR + NODE_H + 14} textAnchor="middle"
              fontSize={7.5} fill="#818cf850" letterSpacing={2} fontFamily="monospace">
              COMPETITORS
            </text>
          )}

          {/* ── T1/T2 ring separator arc (visual hint) ── */}
          {t1Nodes.length > 0 && t2Nodes.length > 0 && (
            <circle cx={CX} cy={CY} r={(layout.t1R + layout.t2R) / 2}
              fill="none" stroke="#ffffff08" strokeWidth={1} strokeDasharray="3 8" />
          )}

          {/* ── Edges ── */}
          {allNodes.map(e => {
            const style  = DIR[e.direction as keyof typeof DIR] ?? DIR.COMPETITOR
            const isHov  = hovered === e.id
            const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
            const sw     = isHov ? 1.4 : Math.max(0.5, Math.min(2.0, (exp / 20) * 1.5 + 0.5))
            const nx     = e._x + HW
            const ny     = e._y + HH
            return (
              <line key={`e-${e.id}`}
                x1={CX} y1={CY} x2={nx} y2={ny}
                stroke={style.edge}
                strokeWidth={sw}
                strokeOpacity={isHov ? 0.75 : 0.2}
                markerEnd={
                  e.direction === 'UPSTREAM'   ? 'url(#sc-arr-UPSTREAM)'   :
                  e.direction === 'DOWNSTREAM' ? 'url(#sc-arr-DOWNSTREAM)' : undefined
                }
                filter={isHov ? 'url(#sc-glow-e)' : undefined}
              />
            )
          })}

          {/* ── Focal node ── */}
          <g filter="url(#sc-glow-f)">
            {/* Outer glow ring */}
            <circle cx={CX} cy={CY} r={38} fill="none" stroke="#00d4ff" strokeWidth={0.5} strokeOpacity={0.3} />
            <circle cx={CX} cy={CY} r={28} fill="none" stroke="#00d4ff" strokeWidth={0.8} strokeOpacity={0.4} />
            {/* Core */}
            <rect x={CX - 44} y={CY - 26} width={88} height={52} rx={5}
              fill="#030c18" stroke="#00d4ff" strokeWidth={1.5} />
            {/* Accent top bar */}
            <rect x={CX - 44} y={CY - 26} width={88} height={3} rx={2}
              fill="#00d4ff" fillOpacity={0.6} />
            <text x={CX} y={CY - 4} textAnchor="middle"
              fontSize={15} fontWeight="bold" fill="#00d4ff" fontFamily="monospace">
              {ticker}
            </text>
            <text x={CX} y={CY + 12} textAnchor="middle"
              fontSize={7} fill="#4a5568" fontFamily="monospace">
              {legalName.length > 22 ? legalName.slice(0, 20) + '…' : legalName}
            </text>
          </g>

          {/* ── Entity nodes ── */}
          {allNodes.map(e => {
            const style  = DIR[e.direction as keyof typeof DIR] ?? DIR.COMPETITOR
            const risk   = riskOf(e)
            const isHov  = hovered === e.id
            const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
            const expStr = exp > 0 ? `${exp.toFixed(1)}%` : ''
            // Max chars that fit inside node (approx 6.5px per char at fontSize 7.5)
            const maxChars = Math.floor((NODE_W - (expStr ? 40 : 18)) / 6.4)
            const name = e.entity_name.length > maxChars
              ? e.entity_name.slice(0, maxChars - 1) + '…'
              : e.entity_name

            return (
              <g key={`n-${e.id}`} data-node="1" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(e.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNodeClick(e)}
              >
                {/* Card background */}
                <rect x={e._x} y={e._y} width={NODE_W} height={NODE_H} rx={3}
                  fill={isHov ? style.bg + 'dd' : style.bg}
                  stroke={isHov ? style.border : style.border + '60'}
                  strokeWidth={isHov ? 1 : 0.6}
                />
                {/* Left risk accent bar */}
                <rect x={e._x} y={e._y} width={2.5} height={NODE_H} rx={1.5}
                  fill={RISK_COLOR[risk]} fillOpacity={0.9} />

                {/* Entity name */}
                <text x={e._x + 9} y={e._y + NODE_H * 0.52}
                  dominantBaseline="middle"
                  fontSize={7.5}
                  fill={isHov ? style.text : style.text + 'bb'}
                  fontFamily="monospace"
                  fontWeight="500"
                >
                  {name}
                </text>

                {/* Exposure % (right-aligned) */}
                {expStr && (
                  <text x={e._x + NODE_W - 5} y={e._y + NODE_H * 0.52}
                    dominantBaseline="middle"
                    fontSize={7} textAnchor="end"
                    fill={style.border + 'aa'} fontFamily="monospace">
                    {expStr}
                  </text>
                )}

                {/* Country + tier sub-label */}
                {(e.hq_country || e.tier === 2) && (
                  <text x={e._x + 9} y={e._y + NODE_H - 5}
                    fontSize={6} fill="#3a4a5a" fontFamily="monospace">
                    {[e.hq_country, e.tier === 2 ? 'T2' : ''].filter(Boolean).join(' · ')}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
