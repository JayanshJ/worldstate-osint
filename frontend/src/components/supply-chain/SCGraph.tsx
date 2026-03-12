/**
 * SCGraph — pure-SVG hierarchical supply-chain network.
 * No extra npm dependencies. Uses React state for hover/select.
 *
 * Layout:
 *   [T2 Upstream] → [T1 Upstream] → [FOCAL] → [Downstream]
 *                                      ↕
 *                               [Competitors row]
 *
 * Adaptive: node height & gap shrink automatically when columns have many nodes.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
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

// ─── Fixed layout constants ────────────────────────────────────────────────
const NODE_W   = 144
const H_GAP    = 160
const PAD_X    = 24
const PAD_Y    = 36
const COMP_GAP = 18   // gap between competitor nodes in row
const COMP_SEP = 52   // vertical separation between focal bottom and competitor row

interface LayoutNode extends SCEdge {
  _x: number
  _y: number
}

interface SCGraphProps {
  ticker:      string
  legalName:   string
  edges:       SCEdge[]
  onNodeClick: (e: SCEdge) => void
}

export function SCGraph({ ticker, legalName, edges, onNodeClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // ── Pan / zoom ────────────────────────────────────────────────────────────
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const dragging = useRef(false)
  const lastPos  = useRef({ x: 0, y: 0 })
  const svgRef   = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setTransform(t => ({ ...t, scale: Math.max(0.15, Math.min(5, t.scale * delta)) }))
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
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
    setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = false
    e.currentTarget.style.cursor = 'grab'
  }, [])

  const resetView = useCallback(() => setTransform({ x: 0, y: 0, scale: 1 }), [])

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const upT2 = edges.filter(e => e.direction === 'UPSTREAM'   && e.tier === 2)
    const upT1 = edges.filter(e => e.direction === 'UPSTREAM'   && (e.tier ?? 1) === 1)
    const down = edges.filter(e => e.direction === 'DOWNSTREAM')
    const comp = edges.filter(e => e.direction === 'COMPETITOR')

    // Adaptive node sizing — shrink for large columns
    const maxCol = Math.max(upT1.length, down.length, upT2.length, 1)
    const nH  = maxCol <=  5 ? 50 : maxCol <= 10 ? 42 : maxCol <= 16 ? 34 : maxCol <= 24 ? 28 : 22
    const vG  = maxCol <=  5 ? 14 : maxCol <= 10 ?  9 : maxCol <= 16 ?  6 : maxCol <= 24 ?  4 :  3
    const fontSize = nH >= 42 ? 9 : nH >= 34 ? 8.5 : 8

    const colH = (n: number) => n === 0 ? nH * 2 : n * (nH + vG) - vG

    // Columns: [upT2?] [upT1] [FOCAL placeholder] [down]
    type Col = { nodes: SCEdge[]; x: number }
    const cols: Col[] = []
    if (upT2.length > 0) cols.push({ nodes: upT2, x: 0 })
    cols.push({ nodes: upT1, x: 0 })
    const focalColIdx = cols.length
    cols.push({ nodes: [], x: 0 })   // focal placeholder
    cols.push({ nodes: down, x: 0 })

    // Assign x
    let cx = PAD_X
    for (const col of cols) {
      col.x = cx
      cx += NODE_W + H_GAP
    }
    const mainW  = cx - H_GAP + PAD_X
    const focalX = cols[focalColIdx].x

    const maxEdgeH = Math.max(...cols.filter(c => c.nodes.length).map(c => colH(c.nodes.length)), nH * 2)
    const focalH   = Math.max(nH * 2, maxEdgeH)
    const focalY   = PAD_Y + (focalH - nH * 2) / 2

    // Assign node positions for non-focal columns
    const placed: LayoutNode[] = []
    for (let ci = 0; ci < cols.length; ci++) {
      if (ci === focalColIdx) continue
      const col   = cols[ci]
      const h     = colH(col.nodes.length)
      const startY = PAD_Y + (focalH - h) / 2
      col.nodes.forEach((n, ni) => {
        placed.push({
          ...n,
          _x: col.x,
          _y: startY + ni * (nH + vG),
        } as LayoutNode)
      })
    }

    // Competitors: horizontal row centered below focal
    const compRowY = PAD_Y + focalH + COMP_SEP
    const compTotalW = comp.length * NODE_W + Math.max(0, comp.length - 1) * COMP_GAP
    const compStartX = focalX + NODE_W / 2 - compTotalW / 2
    const compNodes: LayoutNode[] = comp.map((n, ni) => ({
      ...n,
      _x: compStartX + ni * (NODE_W + COMP_GAP),
      _y: compRowY,
    } as LayoutNode))

    const totalW = Math.max(mainW, compStartX + compTotalW + PAD_X)
    const totalH = compRowY + (comp.length > 0 ? nH + PAD_Y : PAD_Y)

    return {
      placed,
      compNodes,
      focalX,
      focalY,
      focalH,
      svgW:  Math.max(totalW, 400),
      svgH:  Math.max(totalH, 200),
      nH,
      fontSize,
      colLabels: cols.map((col, ci) => {
        const dir = col.nodes[0]?.direction
        const tier = col.nodes[0]?.tier
        if (!dir) return null
        const label =
          dir === 'UPSTREAM'   ? (tier === 2 ? 'TIER-2 UPSTREAM' : 'TIER-1 UPSTREAM')
          : dir === 'DOWNSTREAM' ? 'CUSTOMERS'
          : null
        return label ? { x: col.x + NODE_W / 2, label } : null
      }).filter(Boolean) as { x: number; label: string }[],
    }
  }, [edges])

  const { placed, compNodes, focalX, focalY, focalH, svgW, svgH, nH, fontSize, colLabels } = layout
  const allNodes = [...placed, ...compNodes]
  const focalCx  = focalX + NODE_W / 2
  const focalCy  = focalY + nH  // vertical center of focal (height = 2*nH)

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 240 }}>
      {/* Controls */}
      <button
        onClick={resetView}
        className="absolute top-2 right-2 z-10 text-[9px] font-mono tracking-widest px-2 py-1 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-accent/40 rounded-sm transition-colors"
      >
        RESET
      </button>
      <div className="absolute bottom-2 right-2 z-10 text-[8px] font-mono text-terminal-dim/30 pointer-events-none">
        scroll to zoom · drag to pan
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
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
          {(['UPSTREAM', 'DOWNSTREAM'] as const).map(dir => (
            <marker key={dir} id={`arrow-${dir}`} markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={DIR_STROKE[dir]} fillOpacity={0.5} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>

          {/* ── Column labels ── */}
          {colLabels.map(({ x, label }) => (
            <text key={label} x={x} y={PAD_Y - 16} textAnchor="middle"
              fontSize={7.5} fill="#5a6380" letterSpacing={1.5} fontFamily="monospace">
              {label}
            </text>
          ))}

          {/* ── Competitor section label ── */}
          {compNodes.length > 0 && (
            <>
              <text
                x={focalCx}
                y={PAD_Y + focalH + COMP_SEP - 22}
                textAnchor="middle"
                fontSize={7.5}
                fill="#5a6380"
                letterSpacing={1.5}
                fontFamily="monospace"
              >
                COMPETITORS
              </text>
              <line
                x1={Math.min(...compNodes.map(n => n._x)) - 12}
                x2={Math.max(...compNodes.map(n => n._x)) + NODE_W + 12}
                y1={PAD_Y + focalH + COMP_SEP - 12}
                y2={PAD_Y + focalH + COMP_SEP - 12}
                stroke="#5a6380"
                strokeWidth={0.5}
                strokeOpacity={0.3}
                strokeDasharray="4 4"
              />
            </>
          )}

          {/* ── Edges ── */}
          {allNodes.map(e => {
            const nodeCx = e._x + NODE_W / 2
            const nodeCy = e._y + nH / 2
            const isHov  = hovered === e.id
            const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
            const sw     = Math.max(0.7, Math.min(3.5, (exp / 20) * 2.5 + 0.7))
            const strokeColor = DIR_STROKE[e.direction as keyof typeof DIR_STROKE] ?? '#5a6380'

            let x1: number, y1: number, x2: number, y2: number

            if (e.direction === 'UPSTREAM') {
              x1 = e._x + NODE_W; y1 = nodeCy
              x2 = focalX;        y2 = focalCy
            } else if (e.direction === 'DOWNSTREAM') {
              x1 = focalX + NODE_W; y1 = focalCy
              x2 = e._x;            y2 = nodeCy
            } else {
              // COMPETITOR: center-to-center, dashed
              x1 = focalCx; y1 = focalY + nH * 2
              x2 = nodeCx;  y2 = e._y
            }

            const mx = (x1 + x2) / 2

            return (
              <path
                key={`edge-${e.id}`}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isHov ? sw + 0.8 : sw}
                strokeOpacity={isHov ? 0.85 : 0.3}
                strokeDasharray={e.direction === 'COMPETITOR' ? '5 4' : undefined}
                markerEnd={e.direction === 'UPSTREAM' ? 'url(#arrow-UPSTREAM)' : e.direction === 'DOWNSTREAM' ? 'url(#arrow-DOWNSTREAM)' : undefined}
              />
            )
          })}

          {/* ── Focal node ── */}
          <g>
            <rect x={focalX} y={focalY} width={NODE_W} height={nH * 2} rx={5}
              fill="#0d1b2e" stroke="#00d4ff" strokeWidth={1.5} />
            {/* Accent top bar */}
            <rect x={focalX} y={focalY} width={NODE_W} height={3} rx={2} fill="#00d4ff" fillOpacity={0.6} />
            <text x={focalCx} y={focalY + nH - 4} textAnchor="middle"
              fontSize={Math.min(13, nH * 0.28)} fontWeight="bold" fill="#00d4ff" fontFamily="monospace">
              {ticker}
            </text>
            <text x={focalCx} y={focalY + nH + 10} textAnchor="middle"
              fontSize={7.5} fill="#5a6380" fontFamily="monospace">
              {legalName.length > 22 ? legalName.slice(0, 20) + '…' : legalName}
            </text>
            <text x={focalCx} y={focalY + nH * 2 - 6} textAnchor="middle"
              fontSize={6.5} fill="#00d4ff55" fontFamily="monospace" letterSpacing={1}>
              FOCAL
            </text>
          </g>

          {/* ── Entity nodes ── */}
          {allNodes.map(e => {
            const risk  = riskLevel(e)
            const color = RISK_COLOR[risk]
            const isHov = hovered === e.id
            const exp   = e.pct_revenue ?? e.pct_cogs ?? 0
            const expStr = exp > 0 ? `${exp.toFixed(1)}%` : null
            const nameMaxLen = Math.floor(NODE_W / (fontSize * 0.65))
            const name = e.entity_name.length > nameMaxLen
              ? e.entity_name.slice(0, nameMaxLen - 1) + '…'
              : e.entity_name

            return (
              <g key={`node-${e.id}`} data-node="1" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(e.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNodeClick(e)}
              >
                {/* Background */}
                <rect x={e._x} y={e._y} width={NODE_W} height={nH} rx={3}
                  fill={isHov ? '#111d32' : '#090e1a'}
                  stroke={isHov ? color : color + '50'}
                  strokeWidth={isHov ? 1.2 : 0.7}
                />
                {/* Left risk bar */}
                <rect x={e._x} y={e._y} width={3} height={nH} rx={1.5}
                  fill={color} fillOpacity={0.85} />

                {/* Entity name */}
                <text x={e._x + 9} y={e._y + nH * 0.42}
                  fontSize={fontSize} fill={isHov ? '#e2e8f0' : '#94a3b8'}
                  fontFamily="monospace" fontWeight="500">
                  {name}
                </text>

                {/* Exposure / label */}
                {nH >= 28 && (
                  <text x={e._x + 9} y={e._y + nH * 0.75}
                    fontSize={Math.max(6.5, fontSize - 1.5)} fill={color + 'cc'} fontFamily="monospace">
                    {e.sole_source
                      ? '⚠ SOLE'
                      : expStr
                        ? `${DISC_ICON[e.disclosure_type ?? 'INFERRED']} ${expStr}`
                        : `${DISC_ICON[e.disclosure_type ?? 'INFERRED']} no data`
                    }
                  </text>
                )}

                {/* Country */}
                {e.hq_country && nH >= 32 && (
                  <text x={e._x + NODE_W - 6} y={e._y + nH * 0.38}
                    fontSize={Math.max(6, fontSize - 1.5)} fill="#5a6380"
                    fontFamily="monospace" textAnchor="end">
                    {e.hq_country}
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
