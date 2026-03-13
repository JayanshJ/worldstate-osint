/**
 * SCGraph — Bloomberg-style supply-chain network.
 *
 * Layout:
 *   [T2 col] → [T1 col] → [FOCAL] → [Downstream col]
 *                              ↓
 *                       [Competitors row]
 *
 * Straight radiating edges, Bloomberg colour palette, glow focal node.
 * Column layout guarantees zero overlap regardless of node count.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Colour palette ───────────────────────────────────────────────────────────
const DIR = {
  UPSTREAM:   { bg: '#040f0a', border: '#00c896', text: '#6ee7c7', edge: '#00c896' },
  DOWNSTREAM: { bg: '#100900', border: '#f59e0b', text: '#fcd34d', edge: '#f59e0b' },
  COMPETITOR: { bg: '#08081a', border: '#818cf8', text: '#a5b4fc', edge: '#818cf8' },
} as const

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
const V_GAP    = 7     // vertical gap between nodes in a column
const H_GAP    = 148   // horizontal gap between columns
const FOCAL_W  = 92
const FOCAL_H  = 54
const PAD      = 32
const COMP_SEP = 56    // focal bottom → competitor row top

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

  // ── Wheel: pinch=zoom anchored to cursor, two-finger scroll=pan ──────────
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

  // ── Column layout ──────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const upT2 = edges.filter(e => e.direction === 'UPSTREAM'   && e.tier === 2)
    const upT1 = edges.filter(e => e.direction === 'UPSTREAM'   && (e.tier ?? 1) === 1)
    const down = edges.filter(e => e.direction === 'DOWNSTREAM')
    const comp = edges.filter(e => e.direction === 'COMPETITOR')

    const colH = (n: number) => n > 0 ? n * NODE_H + (n - 1) * V_GAP : FOCAL_H
    const mainH = Math.max(colH(upT1.length), colH(upT2.length), colH(down.length), FOCAL_H)

    // Build columns left → right
    const cols: Array<{ nodes: SCEdge[]; cx: number; label: string; color: string }> = []
    let xCursor = PAD

    if (upT2.length > 0) {
      cols.push({ nodes: upT2, cx: xCursor + NODE_W / 2, label: 'TIER-2',    color: '#00c89640' })
      xCursor += NODE_W + H_GAP
    }
    if (upT1.length > 0) {
      cols.push({ nodes: upT1, cx: xCursor + NODE_W / 2, label: 'SUPPLIERS', color: '#00c89660' })
      xCursor += NODE_W + H_GAP
    }

    const focalCX = xCursor + FOCAL_W / 2
    const focalCY = PAD + mainH / 2
    xCursor += FOCAL_W + H_GAP

    if (down.length > 0) {
      cols.push({ nodes: down, cx: xCursor + NODE_W / 2, label: 'CUSTOMERS', color: '#f59e0b60' })
      xCursor += NODE_W + PAD
    } else {
      xCursor += PAD
    }

    // Place column nodes (vertically centred around mainH mid-point)
    function placeCol(nodes: SCEdge[], cx: number): LayoutNode[] {
      const h = colH(nodes.length)
      const startY = PAD + (mainH - h) / 2
      return nodes.map((n, i) => ({
        ...n,
        _x: cx - NODE_W / 2,
        _y: startY + i * (NODE_H + V_GAP),
      } as LayoutNode))
    }

    const placed = cols.flatMap(c => placeCol(c.nodes, c.cx))

    // Competitors: horizontal row centred below focal
    const C_GAP      = 12
    const compTotalW = comp.length * NODE_W + Math.max(0, comp.length - 1) * C_GAP
    const compStartX = focalCX - compTotalW / 2
    const compY      = PAD + mainH + COMP_SEP
    const compNodes: LayoutNode[] = comp.map((n, i) => ({
      ...n,
      _x: compStartX + i * (NODE_W + C_GAP),
      _y: compY,
    } as LayoutNode))

    const allNodes = [...placed, ...compNodes]

    // Tight viewBox
    const xs = allNodes.map(n => n._x)
    const ys = allNodes.map(n => n._y)
    const vbX = Math.min(...xs, focalCX - FOCAL_W / 2) - PAD
    const vbY = Math.min(...ys, focalCY - FOCAL_H / 2) - PAD
    const vbW = Math.max(...xs.map(x => x + NODE_W), focalCX + FOCAL_W / 2, xCursor) + PAD - vbX
    const vbH = Math.max(...ys.map(y => y + NODE_H), focalCY + FOCAL_H / 2, compY + NODE_H) + PAD + 20 - vbY

    return { placed, compNodes, focalCX, focalCY, vbX, vbY, vbW, vbH, cols, compY, mainH }
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

          {/* ── Edges (straight, focal centre → node centre) ── */}
          {allNodes.map(e => {
            const style = DIR[e.direction as keyof typeof DIR] ?? DIR.COMPETITOR
            const isHov = hovered === e.id
            const exp   = e.pct_revenue ?? e.pct_cogs ?? 0
            const sw    = isHov ? 1.4 : Math.max(0.5, Math.min(2.0, (exp / 20) * 1.5 + 0.5))
            const nx    = e._x + NODE_W / 2, ny = e._y + NODE_H / 2
            return (
              <line key={`e-${e.id}`}
                x1={focalCX} y1={focalCY} x2={nx} y2={ny}
                stroke={style.edge} strokeWidth={sw}
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
            const style  = DIR[e.direction as keyof typeof DIR] ?? DIR.COMPETITOR
            const risk   = riskOf(e)
            const isHov  = hovered === e.id
            const exp    = e.pct_revenue ?? e.pct_cogs ?? 0
            const expStr = exp > 0 ? `${exp.toFixed(1)}%` : ''
            const maxCh  = Math.floor((NODE_W - (expStr ? 44 : 18)) / 6.3)
            const name   = e.entity_name.length > maxCh
              ? e.entity_name.slice(0, maxCh - 1) + '…' : e.entity_name

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
                <rect x={e._x} y={e._y} width={2.5} height={NODE_H} rx={1.5}
                  fill={RISK_COLOR[risk]} fillOpacity={0.9}/>
                <text x={e._x + 9} y={e._y + NODE_H * 0.52}
                  dominantBaseline="middle" fontSize={7.5}
                  fill={isHov ? style.text : style.text + 'bb'}
                  fontFamily="monospace" fontWeight="500">{name}</text>
                {expStr && (
                  <text x={e._x + NODE_W - 5} y={e._y + NODE_H * 0.52}
                    dominantBaseline="middle" fontSize={7} textAnchor="end"
                    fill={style.border + 'aa'} fontFamily="monospace">{expStr}</text>
                )}
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
