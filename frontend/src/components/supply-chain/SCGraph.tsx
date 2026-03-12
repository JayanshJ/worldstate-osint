/**
 * SCGraph — pure-SVG hierarchical supply-chain network.
 * No extra npm dependencies. Uses React state for hover/select.
 *
 * Layout:
 *   [Tier-2 upstream] → [Tier-1 upstream] → [FOCAL] → [Downstream] → [Competitors below]
 */

import { useState, useMemo } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Colours ──────────────────────────────────────────────────────────────
const RISK_COLOR = {
  HIGH:   '#ef4444',
  MEDIUM: '#f97316',
  LOW:    '#22c55e',
  NONE:   '#5a6380',
}
const DIR_STROKE = {
  UPSTREAM:   '#0ea5e9',
  DOWNSTREAM: '#22c55e',
  COMPETITOR: '#9ca3af',
}
const DISC_ICON: Record<string, string> = {
  DISCLOSED: '📄',
  ESTIMATED: '~',
  INFERRED:  '⚡',
}

function riskLevel(e: SCEdge): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  const exp = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source || exp >= 20) return 'HIGH'
  if (exp >= 10) return 'MEDIUM'
  if (exp > 0)   return 'LOW'
  return 'NONE'
}

// ─── Layout constants ─────────────────────────────────────────────────────
const NODE_W  = 140
const NODE_H  = 48
const H_GAP   = 170  // horizontal gap between columns
const V_GAP   = 16   // vertical gap between nodes in same column
const PAD_X   = 20
const PAD_Y   = 30

type Column = { x: number; nodes: SCEdge[] }

interface SCGraphProps {
  ticker:      string
  legalName:   string
  edges:       SCEdge[]
  onNodeClick: (e: SCEdge) => void
}

export function SCGraph({ ticker, legalName, edges, onNodeClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const { columns, svgW, svgH, focalY, focalX } = useMemo(() => {
    // Group: upstream T2, upstream T1, downstream, competitors
    const upT2 = edges.filter(e => e.direction === 'UPSTREAM' && e.tier === 2)
    const upT1 = edges.filter(e => e.direction === 'UPSTREAM' && (e.tier ?? 1) === 1)
    const down = edges.filter(e => e.direction === 'DOWNSTREAM')
    const comp = edges.filter(e => e.direction === 'COMPETITOR')

    const cols: Column[] = []
    if (upT2.length > 0) cols.push({ x: 0, nodes: upT2 })
    cols.push({ x: 0, nodes: upT1 })
    // placeholder for focal
    cols.push({ x: 0, nodes: [] })
    cols.push({ x: 0, nodes: down })
    if (comp.length > 0) cols.push({ x: 0, nodes: comp })

    // Compute heights
    const colH = (nodes: SCEdge[]) =>
      nodes.length === 0 ? NODE_H : nodes.length * (NODE_H + V_GAP) - V_GAP

    const maxEdgeH = Math.max(...cols.filter(c => c.nodes.length).map(c => colH(c.nodes)))
    const focalH   = Math.max(NODE_H * 2, maxEdgeH)

    // Assign x positions
    let curX = PAD_X
    const assigned = cols.map(col => {
      const cx = curX
      curX += NODE_W + H_GAP
      return { ...col, x: cx }
    })

    const totalW = curX - H_GAP + PAD_X
    const totalH = focalH + PAD_Y * 2 + (comp.length > 0 ? (NODE_H + V_GAP) * comp.length + 40 : 0)

    // Find focal column index
    const focalIdx = upT2.length > 0 ? 2 : 1
    const focalX   = assigned[focalIdx]?.x ?? totalW / 2

    // Assign node positions
    assigned.forEach((col, ci) => {
      if (ci === focalIdx) return
      const totalH2 = colH(col.nodes)
      const startY  = PAD_Y + (focalH - totalH2) / 2
      col.nodes.forEach((n, ni) => {
        ;(n as SCEdge & { _x?: number; _y?: number })._x = col.x
        ;(n as SCEdge & { _x?: number; _y?: number })._y = startY + ni * (NODE_H + V_GAP)
      })
    })

    return {
      columns:  assigned,
      svgW:     totalW,
      svgH:     totalH,
      focalY:   PAD_Y + (focalH - NODE_H * 2) / 2,
      focalX,
    }
  }, [edges])

  const focalCx = focalX + NODE_W / 2
  const focalCy = focalY + NODE_H           // center of focal node

  return (
    <div className="w-full overflow-x-auto overflow-y-auto">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={svgW}
        height={svgH}
        style={{ minWidth: svgW, display: 'block' }}
      >
        {/* ── Edges (drawn first, below nodes) ── */}
        {edges.map(e => {
          const ex = (e as SCEdge & { _x?: number })._x
          const ey = (e as SCEdge & { _y?: number })._y
          if (ex == null || ey == null) return null

          const nodeCx = ex + NODE_W / 2
          const nodeCy = ey + NODE_H / 2

          const [x1, y1, x2, y2] =
            e.direction === 'UPSTREAM'
              ? [nodeCx + NODE_W / 2, nodeCy, focalCx - NODE_W / 2, focalCy]
              : e.direction === 'DOWNSTREAM'
              ? [focalCx + NODE_W / 2, focalCy, nodeCx - NODE_W / 2, nodeCy]
              : [focalCx, focalCy + NODE_H, nodeCx, nodeCy - 10]

          const mx = (x1 + x2) / 2
          const strokeColor = DIR_STROKE[e.direction as keyof typeof DIR_STROKE] ?? '#5a6380'
          const isHov = hovered === e.id
          const exp = e.pct_revenue ?? e.pct_cogs ?? 0
          const sw  = Math.max(0.8, Math.min(4, (exp / 20) * 3 + 0.8))

          return (
            <path
              key={`edge-${e.id}`}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isHov ? sw + 1 : sw}
              strokeOpacity={isHov ? 0.9 : 0.35}
              markerEnd={e.direction !== 'COMPETITOR' ? `url(#arrow-${e.direction})` : undefined}
            />
          )
        })}

        {/* ── Arrow markers ── */}
        <defs>
          {(['UPSTREAM', 'DOWNSTREAM'] as const).map(dir => (
            <marker
              key={dir}
              id={`arrow-${dir}`}
              markerWidth={6} markerHeight={6}
              refX={5} refY={3}
              orient="auto"
            >
              <path
                d="M0,0 L0,6 L6,3 z"
                fill={DIR_STROKE[dir]}
                fillOpacity={0.5}
              />
            </marker>
          ))}
        </defs>

        {/* ── Column labels ── */}
        {columns.map((col, ci) => {
          const label =
            col.nodes[0]?.direction === 'UPSTREAM'   ? (col.nodes[0]?.tier === 2 ? 'TIER-2 UPSTREAM' : 'TIER-1 UPSTREAM')
            : col.nodes[0]?.direction === 'DOWNSTREAM' ? 'CUSTOMERS'
            : col.nodes[0]?.direction === 'COMPETITOR' ? 'COMPETITORS'
            : null
          if (!label) return null
          return (
            <text
              key={`lbl-${ci}`}
              x={col.x + NODE_W / 2}
              y={PAD_Y - 14}
              textAnchor="middle"
              fontSize={8}
              fill="#5a6380"
              letterSpacing={1.5}
              fontFamily="monospace"
            >
              {label}
            </text>
          )
        })}

        {/* ── Focal company node ── */}
        <g>
          <rect
            x={focalX}
            y={focalY}
            width={NODE_W}
            height={NODE_H * 2}
            rx={4}
            fill="#0d1b2e"
            stroke="#00d4ff"
            strokeWidth={1.5}
          />
          <text
            x={focalX + NODE_W / 2}
            y={focalY + NODE_H * 2 / 2 - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight="bold"
            fill="#00d4ff"
            fontFamily="monospace"
          >
            {ticker}
          </text>
          <text
            x={focalX + NODE_W / 2}
            y={focalY + NODE_H * 2 / 2 + 10}
            textAnchor="middle"
            fontSize={7.5}
            fill="#5a6380"
            fontFamily="monospace"
          >
            {legalName.length > 20 ? legalName.slice(0, 18) + '…' : legalName}
          </text>
          <text
            x={focalX + NODE_W / 2}
            y={focalY + NODE_H * 2 - 6}
            textAnchor="middle"
            fontSize={7}
            fill="#00d4ff66"
            fontFamily="monospace"
          >
            FOCAL
          </text>
        </g>

        {/* ── Entity nodes ── */}
        {edges.map(e => {
          const ex = (e as SCEdge & { _x?: number })._x
          const ey = (e as SCEdge & { _y?: number })._y
          if (ex == null || ey == null) return null

          const risk   = riskLevel(e)
          const color  = RISK_COLOR[risk]
          const isHov  = hovered === e.id
          const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
          const expStr = exp > 0 ? `${exp.toFixed(1)}%` : null

          return (
            <g
              key={`node-${e.id}`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(e.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNodeClick(e)}
            >
              {/* Background */}
              <rect
                x={ex}
                y={ey}
                width={NODE_W}
                height={NODE_H}
                rx={3}
                fill={isHov ? '#0d1b2e' : '#0a0f1c'}
                stroke={isHov ? color : color + '55'}
                strokeWidth={isHov ? 1.2 : 0.8}
              />
              {/* Risk bar on left edge */}
              <rect
                x={ex}
                y={ey}
                width={3}
                height={NODE_H}
                rx={1}
                fill={color}
                fillOpacity={0.85}
              />
              {/* Entity name */}
              <text
                x={ex + 10}
                y={ey + 16}
                fontSize={9}
                fill={isHov ? '#e2e8f0' : '#94a3b8'}
                fontFamily="monospace"
                fontWeight="500"
              >
                {e.entity_name.length > 18
                  ? e.entity_name.slice(0, 17) + '…'
                  : e.entity_name}
              </text>
              {/* Exposure / sole source */}
              <text
                x={ex + 10}
                y={ey + 30}
                fontSize={8}
                fill={color + 'cc'}
                fontFamily="monospace"
              >
                {e.sole_source ? '⚠ SOLE SOURCE' : expStr ? `${DISC_ICON[e.disclosure_type ?? 'DISCLOSED']} ${expStr}` : `${DISC_ICON[e.disclosure_type ?? 'INFERRED']} no data`}
              </text>
              {/* Country flag */}
              {e.hq_country && (
                <text
                  x={ex + NODE_W - 6}
                  y={ey + 14}
                  fontSize={7.5}
                  fill="#5a6380"
                  fontFamily="monospace"
                  textAnchor="end"
                >
                  {e.hq_country}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
