/**
 * SCGraph — Bloomberg-style stakeholder network.
 *
 * Layout (left → right):
 *   [T2 Suppliers] → [T1 Suppliers] → [FOCAL] → [Customers] → [Shareholders] → [Board] → [Analysts] → [Industries]
 *                                         ↓
 *                                   [Competitors row]
 *
 * Directions:  UPSTREAM · DOWNSTREAM · COMPETITOR · SHAREHOLDER · BOARD · ANALYST · INDUSTRY
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Colour palette per direction ─────────────────────────────────────────────
const DIR: Record<string, { bg: string; border: string; text: string; edge: string }> = {
  UPSTREAM:    { bg: '#040f0a', border: '#00c896', text: '#6ee7c7', edge: '#00c896' },
  DOWNSTREAM:  { bg: '#100900', border: '#f59e0b', text: '#fcd34d', edge: '#f59e0b' },
  COMPETITOR:  { bg: '#08081a', border: '#818cf8', text: '#a5b4fc', edge: '#818cf8' },
  SHAREHOLDER: { bg: '#0f0900', border: '#eab308', text: '#fde047', edge: '#eab308' },
  BOARD:       { bg: '#130818', border: '#e879f9', text: '#f0abfc', edge: '#e879f9' },
  ANALYST:     { bg: '#0a0818', border: '#a78bfa', text: '#c4b5fd', edge: '#a78bfa' },
  INDUSTRY:    { bg: '#040e10', border: '#06b6d4', text: '#67e8f9', edge: '#06b6d4' },
}

const RATING_COLOR: Record<string, string> = {
  BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444',
}

const RISK_COLOR = { HIGH: '#ef4444', MEDIUM: '#f97316', LOW: '#22c55e', NONE: '#334155' }

function riskOf(e: SCEdge): keyof typeof RISK_COLOR {
  const x = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source || x >= 20) return 'HIGH'
  if (x >= 10) return 'MEDIUM'
  if (x > 0)   return 'LOW'
  return 'NONE'
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const NODE_W   = 134
const NODE_H   = 32
const V_GAP    = 7
const H_GAP    = 148
const FOCAL_W  = 92
const FOCAL_H  = 54
const PAD      = 32
const COMP_SEP = 56

interface LayoutNode extends SCEdge { _x: number; _y: number }

export interface SCGraphProps {
  ticker: string; legalName: string; edges: SCEdge[]; onNodeClick: (e: SCEdge) => void
}

export function SCGraph({ ticker, legalName, edges, onNodeClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tf, setTf]           = useState({ x: 0, y: 0, s: 1 })
  const dragging = useRef(false)
  const lastPos  = useRef({ x: 0, y: 0 })
  const svgRef   = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const { left, top } = svg.getBoundingClientRect()
        const mx = e.clientX - left, my = e.clientY - top
        const f  = Math.exp(-e.deltaY / 300)
        setTf(t => {
          const s2 = Math.max(0.1, Math.min(6, t.s * f)), r = s2 / t.s
          return { s: s2, x: mx - r * (mx - t.x), y: my - r * (my - t.y) }
        })
      } else {
        setTf(t => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('g[data-node]')) return
    dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.style.cursor = 'grabbing'
  }, [])
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x, dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = false; e.currentTarget.style.cursor = 'grab'
  }, [])
  const resetView = useCallback(() => setTf({ x: 0, y: 0, s: 1 }), [])

  // ── Layout ──────────────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const upT2    = edges.filter(e => e.direction === 'UPSTREAM'    && e.tier === 2)
    const upT1    = edges.filter(e => e.direction === 'UPSTREAM'    && (e.tier ?? 1) === 1)
    const down    = edges.filter(e => e.direction === 'DOWNSTREAM')
    const comp    = edges.filter(e => e.direction === 'COMPETITOR')
    const share   = edges.filter(e => e.direction === 'SHAREHOLDER')
    const board   = edges.filter(e => e.direction === 'BOARD')
    const analyst = edges.filter(e => e.direction === 'ANALYST')
    const industry= edges.filter(e => e.direction === 'INDUSTRY')

    const colH = (n: number) => n > 0 ? n * NODE_H + (n - 1) * V_GAP : FOCAL_H
    const mainH = Math.max(
      colH(upT1.length), colH(upT2.length), colH(down.length),
      colH(share.length), colH(board.length), colH(analyst.length), colH(industry.length), FOCAL_H,
    )

    type ColDef = { nodes: SCEdge[]; cx: number; label: string; color: string }
    const cols: ColDef[] = []
    let x = PAD

    if (upT2.length > 0) {
      cols.push({ nodes: upT2, cx: x + NODE_W / 2, label: 'TIER-2',       color: '#00c89640' })
      x += NODE_W + H_GAP
    }
    if (upT1.length > 0) {
      cols.push({ nodes: upT1, cx: x + NODE_W / 2, label: 'SUPPLIERS',    color: '#00c89660' })
      x += NODE_W + H_GAP
    }

    const focalCX = x + FOCAL_W / 2
    const focalCY = PAD + mainH / 2
    x += FOCAL_W + H_GAP

    if (down.length > 0) {
      cols.push({ nodes: down,  cx: x + NODE_W / 2, label: 'CUSTOMERS',   color: '#f59e0b60' })
      x += NODE_W + H_GAP
    }
    if (share.length > 0) {
      cols.push({ nodes: share, cx: x + NODE_W / 2, label: 'SHAREHOLDERS',color: '#eab30860' })
      x += NODE_W + H_GAP
    }
    if (board.length > 0) {
      cols.push({ nodes: board,    cx: x + NODE_W / 2, label: 'BOARD',     color: '#e879f960' })
      x += NODE_W + H_GAP
    }
    if (analyst.length > 0) {
      cols.push({ nodes: analyst,  cx: x + NODE_W / 2, label: 'ANALYSTS',  color: '#a78bfa60' })
      x += NODE_W + H_GAP
    }
    if (industry.length > 0) {
      cols.push({ nodes: industry, cx: x + NODE_W / 2, label: 'INDUSTRIES',color: '#06b6d460' })
      x += NODE_W + PAD
    } else {
      x += PAD
    }

    function placeCol(nodes: SCEdge[], cx: number): LayoutNode[] {
      const h = colH(nodes.length)
      const startY = PAD + (mainH - h) / 2
      return nodes.map((n, i) => ({
        ...n, _x: cx - NODE_W / 2, _y: startY + i * (NODE_H + V_GAP),
      } as LayoutNode))
    }

    const placed = cols.flatMap(c => placeCol(c.nodes, c.cx))

    const C_GAP      = 12
    const compTotalW = comp.length * NODE_W + Math.max(0, comp.length - 1) * C_GAP
    const compStartX = focalCX - compTotalW / 2
    const compY      = PAD + mainH + COMP_SEP
    const compNodes: LayoutNode[] = comp.map((n, i) => ({
      ...n, _x: compStartX + i * (NODE_W + C_GAP), _y: compY,
    } as LayoutNode))

    const allNodes = [...placed, ...compNodes]
    const xs = allNodes.map(n => n._x)
    const ys = allNodes.map(n => n._y)
    const vbX = Math.min(...xs, focalCX - FOCAL_W / 2) - PAD
    const vbY = Math.min(...ys, focalCY - FOCAL_H / 2) - PAD
    const vbW = Math.max(...xs.map(v => v + NODE_W), focalCX + FOCAL_W / 2, x) + PAD - vbX
    const vbH = Math.max(...ys.map(v => v + NODE_H), focalCY + FOCAL_H / 2, compY + NODE_H) + PAD + 20 - vbY

    return { placed, compNodes, focalCX, focalCY, vbX, vbY, vbW, vbH, cols, compY }
  }, [edges])

  const { placed, compNodes, focalCX, focalCY, vbX, vbY, vbW, vbH, cols, compY } = layout
  const allNodes = [...placed, ...compNodes]

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 240 }}>
      <button onClick={resetView}
        className="absolute top-2 right-2 z-10 text-[9px] font-mono tracking-widest px-2 py-1 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-accent/40 rounded-sm transition-colors">
        RESET
      </button>
      <div className="absolute bottom-2 right-2 z-10 text-[8px] font-mono text-terminal-dim/30 pointer-events-none select-none">
        pinch to zoom · scroll to pan · drag to pan
      </div>

      <svg ref={svgRef}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      >
        <defs>
          <filter id="sc-glow-f" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="sc-glow-e" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {(['UPSTREAM', 'DOWNSTREAM'] as const).map(d => (
            <marker key={d} id={`sc-arr-${d}`} markerWidth={5} markerHeight={5} refX={4} refY={2.5} orient="auto">
              <path d="M0,0 L0,5 L5,2.5z" fill={DIR[d].edge} fillOpacity={0.5}/>
            </marker>
          ))}
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.s})`}>

          {/* ── Section labels ── */}
          {cols.map(c => (
            <text key={c.label} x={c.cx} y={vbY + 18}
              textAnchor="middle" fontSize={7.5} fill={c.color}
              letterSpacing={2} fontFamily="monospace">{c.label}</text>
          ))}
          {compNodes.length > 0 && (
            <text x={focalCX} y={compY + NODE_H + 14}
              textAnchor="middle" fontSize={7.5} fill="#818cf850"
              letterSpacing={2} fontFamily="monospace">COMPETITORS</text>
          )}

          {/* ── Edges ── */}
          {allNodes.map(e => {
            const style = DIR[e.direction] ?? DIR.COMPETITOR
            const isHov = hovered === e.id
            const exp   = e.pct_revenue ?? e.pct_cogs ?? 0
            const sw    = isHov ? 1.4 : Math.max(0.4, Math.min(1.8, (exp / 20) * 1.5 + 0.4))
            const nx = e._x + NODE_W / 2, ny = e._y + NODE_H / 2
            return (
              <line key={`e-${e.id}`}
                x1={focalCX} y1={focalCY} x2={nx} y2={ny}
                stroke={style.edge} strokeWidth={sw}
                strokeOpacity={isHov ? 0.75 : 0.18}
                strokeDasharray={['SHAREHOLDER','BOARD','ANALYST','INDUSTRY'].includes(e.direction) ? '4 3' : undefined}
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
            <circle cx={focalCX} cy={focalCY} r={42}
              fill="none" stroke="#00d4ff" strokeWidth={0.5} strokeOpacity={0.25}/>
            <circle cx={focalCX} cy={focalCY} r={30}
              fill="none" stroke="#00d4ff" strokeWidth={0.7} strokeOpacity={0.35}/>
            <rect x={focalCX - FOCAL_W / 2} y={focalCY - FOCAL_H / 2}
              width={FOCAL_W} height={FOCAL_H} rx={5}
              fill="#030c18" stroke="#00d4ff" strokeWidth={1.5}/>
            <rect x={focalCX - FOCAL_W / 2} y={focalCY - FOCAL_H / 2}
              width={FOCAL_W} height={3} rx={2} fill="#00d4ff" fillOpacity={0.6}/>
            <text x={focalCX} y={focalCY - 2} textAnchor="middle"
              fontSize={16} fontWeight="bold" fill="#00d4ff" fontFamily="monospace">{ticker}</text>
            <text x={focalCX} y={focalCY + 14} textAnchor="middle"
              fontSize={7} fill="#4a5568" fontFamily="monospace">
              {legalName.length > 20 ? legalName.slice(0, 19) + '…' : legalName}
            </text>
          </g>

          {/* ── Entity nodes ── */}
          {allNodes.map(e => {
            const style  = DIR[e.direction] ?? DIR.COMPETITOR
            const risk   = riskOf(e)
            const isHov  = hovered === e.id
            const isSH   = e.direction === 'SHAREHOLDER'
            const isBD   = e.direction === 'BOARD'
            const isAN   = e.direction === 'ANALYST'
            const isIN   = e.direction === 'INDUSTRY'
            const isMeta = isSH || isBD || isAN || isIN
            const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
            // Right-side metric: ownership % for shareholders only
            const expStr = isMeta && !isSH ? '' : exp > 0 ? `${exp.toFixed(1)}%` : ''
            const maxCh  = Math.floor((NODE_W - (expStr ? 44 : 18)) / 6.3)
            const name   = e.entity_name.length > maxCh
              ? e.entity_name.slice(0, maxCh - 1) + '…' : e.entity_name
            const subLabel = isBD
              ? (e.relationship_type || '').replace(/_/g, ' ')
              : isSH
                ? (e.relationship_type === 'MUTUAL_FUND' ? 'MF' : 'INST')
                : isAN
                  ? (e.relationship_type || '')   // BUY / HOLD / SELL
                  : isIN
                    ? (e.relationship_type?.replace('GICS_', '').replace('_', ' ') || '')
                    : [e.hq_country, e.tier === 2 ? 'T2' : ''].filter(Boolean).join(' · ')
            // Left accent bar: rating colour for analysts, direction colour for other meta
            const accentColor = isAN
              ? (RATING_COLOR[e.relationship_type ?? ''] ?? style.border)
              : isMeta ? style.border : RISK_COLOR[risk]

            return (
              <g key={`n-${e.id}`} data-node="1" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(e.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onNodeClick(e)}
              >
                <rect x={e._x} y={e._y} width={NODE_W} height={NODE_H} rx={3}
                  fill={isHov ? style.bg + 'dd' : style.bg}
                  stroke={isHov ? style.border : style.border + '60'}
                  strokeWidth={isHov ? 1 : 0.6}/>
                {/* Left accent bar */}
                <rect x={e._x} y={e._y} width={2.5} height={NODE_H} rx={1.5}
                  fill={accentColor} fillOpacity={0.9}/>
                {/* Name */}
                <text x={e._x + 9} y={e._y + NODE_H * 0.42}
                  dominantBaseline="middle" fontSize={7.5}
                  fill={isHov ? style.text : style.text + 'bb'}
                  fontFamily="monospace" fontWeight="500">{name}</text>
                {/* Right metric */}
                {expStr && (
                  <text x={e._x + NODE_W - 5} y={e._y + NODE_H * 0.42}
                    dominantBaseline="middle" fontSize={7} textAnchor="end"
                    fill={style.border + 'cc'} fontFamily="monospace">{expStr}</text>
                )}
                {/* Sub-label */}
                {subLabel && (
                  <text x={e._x + 9} y={e._y + NODE_H - 6}
                    fontSize={6} fill={isMeta ? (isAN ? accentColor + 'cc' : style.border + '80') : '#3a4a5a'}
                    fontFamily="monospace">
                    {subLabel.length > 22 ? subLabel.slice(0, 21) + '…' : subLabel}
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
