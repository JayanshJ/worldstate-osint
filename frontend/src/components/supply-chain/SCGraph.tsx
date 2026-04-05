/**
 * SCGraph — Hierarchical Supply Chain Flow Map
 *
 * Layout:
 *   LEFT   column — UPSTREAM suppliers (sorted by exposure desc)
 *   CENTER         — Focal company node
 *   RIGHT  column — DOWNSTREAM customers
 *   BELOW  focal  — COMPETITORS row
 *   BOTTOM        — META clusters (SHAREHOLDER, BOARD, ANALYST, INDUSTRY)
 *
 * Lines: Bezier curves with stroke-width ∝ exposure_pct (Sankey-style)
 * Nodes: Border color encodes geo-risk (red = high, orange = medium)
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Palette ──────────────────────────────────────────────────────────────────
const DIR_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  UPSTREAM:    { bg: '#061210', border: '#00c896', text: '#6ee7c7' },
  DOWNSTREAM:  { bg: '#120b00', border: '#f59e0b', text: '#fcd34d' },
  COMPETITOR:  { bg: '#0a0a1a', border: '#818cf8', text: '#a5b4fc' },
  SHAREHOLDER: { bg: '#100a00', border: '#eab308', text: '#fde047' },
  BOARD:       { bg: '#130818', border: '#e879f9', text: '#f0abfc' },
  ANALYST:     { bg: '#0a0818', border: '#a78bfa', text: '#c4b5fd' },
  INDUSTRY:    { bg: '#041012', border: '#06b6d4', text: '#67e8f9' },
}

const GEO_HIGH = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN'])
const GEO_MED  = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE'])

function nodeBorderColor(edge: SCEdge): string {
  const pal = DIR_PALETTE[edge.direction] ?? DIR_PALETTE.UPSTREAM
  if (edge.hq_country && GEO_HIGH.has(edge.hq_country)) return '#ef4444'
  if (edge.hq_country && GEO_MED.has(edge.hq_country))  return '#f97316'
  return pal.border
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const FOCAL_R        = 44
const NODE_W         = 140
const NODE_H         = 34
const NODE_GAP       = 10
const COL_DIST       = 340   // focal center → column center X
const COMP_W         = 112
const COMP_H         = 28
const COMP_GAP       = 8
const META_CHIP_W    = 90
const META_CHIP_H    = 22
const META_CHIP_GX   = 4
const META_CHIP_GY   = 3
const META_LABEL_H   = 18
const META_COLS      = 3
const PAD            = 60

export interface SCGraphProps {
  ticker:       string
  legalName:    string
  edges:        SCEdge[]
  onNodeClick:  (e: SCEdge) => void
  onHubClick?:  (dir: string, label: string, nodes: SCEdge[]) => void
  onFocalClick?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normName(s: string): string {
  return s.toLowerCase().replace(/[,\.;:'"()]/g, '').replace(/\s+/g, ' ').trim()
}
function personKey(s: string): string {
  const parts = normName(s).split(' ').filter(p => p.length > 1 && !p.endsWith('.'))
  return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : normName(s)
}
function dedup(es: SCEdge[], dir: string): SCEdge[] {
  const seen = new Map<string, SCEdge>()
  for (const e of es) {
    const k = dir === 'BOARD' ? personKey(e.entity_name) : normName(e.entity_name)
    const ex = seen.get(k)
    if (!ex || (e.confidence ?? 0) > (ex.confidence ?? 0)) seen.set(k, e)
  }
  return Array.from(seen.values())
}

function lineWidth(edge: SCEdge): number {
  const exp = edge.pct_cogs ?? edge.pct_revenue ?? 0
  if (exp > 0) return Math.max(1, Math.min(6, exp / 6))
  return Math.max(0.6, (edge.confidence ?? 0.5) * 1.5)
}

// Spread entry/exit points on the focal circle
function focalEntryY(i: number, n: number): number {
  if (n <= 1) return 0
  const spread = Math.min(FOCAL_R * 0.72, (n - 1) * 9)
  return -spread + (i / (n - 1)) * 2 * spread
}

// ─── Column layout ────────────────────────────────────────────────────────────
interface PositionedNode {
  node: SCEdge
  cx:   number
  cy:   number
  lx:   number
  rx:   number
  ty:   number
  by:   number
}

function columnLayout(nodes: SCEdge[], centerX: number): PositionedNode[] {
  const n = nodes.length
  if (n === 0) return []
  const totalH = n * NODE_H + (n - 1) * NODE_GAP
  return nodes.map((node, i) => {
    const cy = -totalH / 2 + i * (NODE_H + NODE_GAP) + NODE_H / 2
    return {
      node, cx: centerX, cy,
      lx: centerX - NODE_W / 2,
      rx: centerX + NODE_W / 2,
      ty: cy - NODE_H / 2,
      by: cy + NODE_H / 2,
    }
  })
}

// ─── Node box renderer (shared for upstream & downstream) ─────────────────────
function FlowNode({
  node, lx, ty, cy,
  hovered, onHover, onClick,
}: {
  node: SCEdge; lx: number; ty: number; cy: number
  hovered: boolean
  onHover: (id: string | null) => void
  onClick: (e: SCEdge) => void
}) {
  const pal    = DIR_PALETTE[node.direction] ?? DIR_PALETTE.UPSTREAM
  const border = nodeBorderColor(node)
  const exp    = node.pct_cogs ?? node.pct_revenue ?? 0
  const hasExp = exp > 0
  const name   = node.entity_name.length > 19 ? node.entity_name.slice(0, 18) + '…' : node.entity_name
  const subParts = [
    node.hq_country ?? '',
    hasExp ? `${exp.toFixed(0)}%` : '',
    node.sole_source ? 'SOLE' : '',
  ].filter(Boolean)
  const sub = subParts.join(' · ')

  return (
    <g data-node="1" style={{ cursor: 'pointer' }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(node)}
    >
      <rect x={lx} y={ty} width={NODE_W} height={NODE_H} rx={3}
        fill={hovered ? pal.bg + 'ff' : pal.bg + 'cc'}
        stroke={border}
        strokeWidth={hovered ? 1.4 : 0.8}
        strokeOpacity={hovered ? 1 : 0.65}
      />
      {/* Left accent bar — geo-risk color */}
      <rect x={lx} y={ty} width={2.5} height={NODE_H} rx={1}
        fill={border} fillOpacity={0.9} />
      {/* Exposure bar along bottom */}
      {hasExp && (
        <rect
          x={lx + 3} y={ty + NODE_H - 2.5}
          width={Math.min((NODE_W - 6) * (exp / 100), NODE_W - 6)}
          height={2} rx={0.5}
          fill={border} fillOpacity={0.45}
        />
      )}
      <text x={lx + 10} y={cy - (sub ? 4 : 0)}
        dominantBaseline="middle" fontSize={8}
        fill={hovered ? pal.text : pal.text + 'cc'}
        fontFamily="monospace" fontWeight="500">
        {name}
      </text>
      {sub && (
        <text x={lx + 10} y={cy + 8}
          fontSize={5.8} fill={border + '90'}
          fontFamily="monospace">
          {sub}
        </text>
      )}
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SCGraph({ ticker, legalName, edges, onNodeClick, onHubClick, onFocalClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tf, setTf]           = useState({ x: 0, y: 0, s: 1 })
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })
  const svgRef    = useRef<SVGSVGElement>(null)

  // ── Pan / zoom ─────────────────────────────────────────────────────────────
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
    dragging.current = true
    lastPos.current  = { x: e.clientX, y: e.clientY }
    e.currentTarget.style.cursor = 'grabbing'
  }, [])
  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x, dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])
  const onMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    dragging.current = false
    e.currentTarget.style.cursor = 'grab'
  }, [])
  const resetView = useCallback(() => setTf({ x: 0, y: 0, s: 1 }), [])

  // ── Layout computation ─────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const upstream = dedup(edges.filter(e => e.direction === 'UPSTREAM'), 'UPSTREAM')
      .sort((a, b) =>
        ((b.pct_cogs ?? b.pct_revenue ?? 0) - (a.pct_cogs ?? a.pct_revenue ?? 0)) ||
        ((b.confidence ?? 0) - (a.confidence ?? 0))
      )
    const downstream = dedup(edges.filter(e => e.direction === 'DOWNSTREAM'), 'DOWNSTREAM')
      .sort((a, b) =>
        ((b.pct_revenue ?? b.pct_cogs ?? 0) - (a.pct_revenue ?? a.pct_cogs ?? 0)) ||
        ((b.confidence ?? 0) - (a.confidence ?? 0))
      )
    const competitors = dedup(edges.filter(e => e.direction === 'COMPETITOR'), 'COMPETITOR').slice(0, 8)

    const upNodes   = columnLayout(upstream,   -COL_DIST)
    const downNodes = columnLayout(downstream,  COL_DIST)

    // Competitor row: below whichever column is taller
    const colBottomY = Math.max(
      upNodes.length   > 0 ? upNodes[upNodes.length - 1].by   : FOCAL_R,
      downNodes.length > 0 ? downNodes[downNodes.length - 1].by : FOCAL_R,
      FOCAL_R,
    )
    const compRowY = colBottomY + 72

    const compTotalW = competitors.length * COMP_W + (competitors.length - 1) * COMP_GAP
    const compNodes = competitors.map((node, i) => ({
      node,
      cx: -compTotalW / 2 + i * (COMP_W + COMP_GAP) + COMP_W / 2,
      cy: compRowY,
    }))

    // Meta clusters (SHAREHOLDER, BOARD, ANALYST, INDUSTRY) — 2-column chip grid
    const META_DEFS = [
      { dir: 'SHAREHOLDER' as const, label: 'HOLDERS'    },
      { dir: 'BOARD'       as const, label: 'BOARD'      },
      { dir: 'ANALYST'     as const, label: 'ANALYSTS'   },
      { dir: 'INDUSTRY'    as const, label: 'INDUSTRIES' },
    ]

    const metaBaseY   = compRowY + COMP_H / 2 + 64
    const META_COL_W  = META_COLS * META_CHIP_W + (META_COLS - 1) * META_CHIP_GX
    const META_COL_X  = [-(META_COL_W + 20), 20]
    const colCurY     = [metaBaseY, metaBaseY]

    interface MetaCluster {
      dir:   string
      label: string
      color: typeof DIR_PALETTE[string]
      gx: number; gy: number; gw: number; gh: number
      chips: Array<SCEdge & { _cx: number; _cy: number }>
    }

    const metaClusters: MetaCluster[] = META_DEFS
      .map(def => ({
        ...def,
        nodes: dedup(edges.filter(e => e.direction === def.dir), def.dir),
        color: DIR_PALETTE[def.dir],
      }))
      .filter(c => c.nodes.length > 0)
      .map((mc, i) => {
        const col  = i % 2
        const n    = mc.nodes.length
        const cols = Math.min(META_COLS, n)
        const rows = Math.ceil(n / cols)
        const gw   = cols * META_CHIP_W + (cols - 1) * META_CHIP_GX
        const gh   = META_LABEL_H + rows * META_CHIP_H + (rows - 1) * META_CHIP_GY
        const gx   = META_COL_X[col]
        const gy   = colCurY[col]
        colCurY[col] = gy + gh + 16

        const chips = mc.nodes.map((node, j) => ({
          ...node,
          _cx: gx + (j % cols) * (META_CHIP_W + META_CHIP_GX),
          _cy: gy + META_LABEL_H + Math.floor(j / cols) * (META_CHIP_H + META_CHIP_GY),
        }))

        return { dir: mc.dir, label: mc.label, color: mc.color, gx, gy, gw, gh, chips }
      })

    // ViewBox bounds
    const allX: number[] = [-FOCAL_R, FOCAL_R]
    const allY: number[] = [-FOCAL_R, FOCAL_R]
    for (const p of [...upNodes, ...downNodes]) {
      allX.push(p.lx, p.rx)
      allY.push(p.ty, p.by)
    }
    for (const p of compNodes) {
      allX.push(p.cx - COMP_W / 2, p.cx + COMP_W / 2)
      allY.push(p.cy + COMP_H / 2)
    }
    for (const mc of metaClusters) {
      allX.push(mc.gx, mc.gx + mc.gw)
      allY.push(mc.gy, mc.gy + mc.gh)
    }
    const minX = Math.min(...allX) - PAD
    const maxX = Math.max(...allX) + PAD
    const minY = Math.min(...allY) - PAD
    const maxY = Math.max(...allY) + PAD

    return { upNodes, downNodes, compNodes, metaClusters, vb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } }
  }, [edges])

  const { upNodes, downNodes, compNodes, metaClusters, vb } = layout
  const hasMain = upNodes.length > 0 || downNodes.length > 0

  if (!hasMain && compNodes.length === 0 && metaClusters.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-terminal-dim text-xs font-mono">
        No graph data
      </div>
    )
  }

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 240 }}>
      <button onClick={resetView}
        className="absolute top-2 right-2 z-10 text-[9px] font-mono tracking-widest px-2 py-1 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-text hover:border-terminal-accent/40 rounded-sm transition-colors">
        RESET
      </button>
      <div className="absolute bottom-2 right-2 z-10 text-[8px] font-mono text-terminal-dim/30 pointer-events-none select-none">
        ctrl+scroll to zoom · drag to pan
      </div>

      <svg ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      >
        <defs>
          <filter id="sc-glow-f" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="sc-glow-e" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.s})`}>

          {/* ── Column header labels ──────────────────────────────────── */}
          {upNodes.length > 0 && (
            <text x={-COL_DIST} y={upNodes[0].ty - 14}
              textAnchor="middle" fontSize={7} fontWeight="bold" letterSpacing={1.5}
              fill="#00c89655" fontFamily="monospace">
              ↑ SUPPLIERS ({upNodes.length})
            </text>
          )}
          {downNodes.length > 0 && (
            <text x={COL_DIST} y={downNodes[0].ty - 14}
              textAnchor="middle" fontSize={7} fontWeight="bold" letterSpacing={1.5}
              fill="#f59e0b55" fontFamily="monospace">
              ↓ CUSTOMERS ({downNodes.length})
            </text>
          )}

          {/* ── Flow lines: UPSTREAM → focal ─────────────────────────── */}
          {upNodes.map(({ node, rx, cy }, i) => {
            const ey  = focalEntryY(i, upNodes.length)
            const ex  = -Math.sqrt(Math.max(0, FOCAL_R * FOCAL_R - ey * ey))
            const cpx = (rx + ex) / 2
            const isHov = hovered === node.id
            const sw    = lineWidth(node)
            return (
              <path key={`lu-${node.id}`}
                d={`M ${rx} ${cy} C ${cpx} ${cy} ${cpx} ${ey} ${ex} ${ey}`}
                fill="none"
                stroke={DIR_PALETTE.UPSTREAM.border}
                strokeWidth={isHov ? sw * 1.8 : sw}
                strokeOpacity={isHov ? 0.75 : 0.30}
              />
            )
          })}

          {/* ── Flow lines: focal → DOWNSTREAM ───────────────────────── */}
          {downNodes.map(({ node, lx, cy }, i) => {
            const ey  = focalEntryY(i, downNodes.length)
            const ex  = Math.sqrt(Math.max(0, FOCAL_R * FOCAL_R - ey * ey))
            const cpx = (ex + lx) / 2
            const isHov = hovered === node.id
            const sw    = lineWidth(node)
            return (
              <path key={`ld-${node.id}`}
                d={`M ${ex} ${ey} C ${cpx} ${ey} ${cpx} ${cy} ${lx} ${cy}`}
                fill="none"
                stroke={DIR_PALETTE.DOWNSTREAM.border}
                strokeWidth={isHov ? sw * 1.8 : sw}
                strokeOpacity={isHov ? 0.75 : 0.30}
              />
            )
          })}

          {/* ── Dashed lines: focal → competitors ────────────────────── */}
          {compNodes.map(({ node, cx, cy }) => (
            <line key={`lc-${node.id}`}
              x1={0} y1={FOCAL_R}
              x2={cx} y2={cy - COMP_H / 2}
              stroke="#818cf850" strokeWidth={0.6} strokeDasharray="3 4"
            />
          ))}

          {/* ── UPSTREAM boxes ────────────────────────────────────────── */}
          {upNodes.map(({ node, lx, ty, cy }) => (
            <FlowNode key={`up-${node.id}`}
              node={node} lx={lx} ty={ty} cy={cy}
              hovered={hovered === node.id}
              onHover={setHovered}
              onClick={onNodeClick}
            />
          ))}

          {/* ── DOWNSTREAM boxes ──────────────────────────────────────── */}
          {downNodes.map(({ node, lx, ty, cy }) => (
            <FlowNode key={`dn-${node.id}`}
              node={node} lx={lx} ty={ty} cy={cy}
              hovered={hovered === node.id}
              onHover={setHovered}
              onClick={onNodeClick}
            />
          ))}

          {/* ── Competitor chips ─────────────────────────────────────── */}
          {compNodes.length > 0 && (
            <>
              <text x={0} y={compNodes[0].cy - COMP_H / 2 - 9}
                textAnchor="middle" fontSize={7} fontWeight="bold" letterSpacing={1.5}
                fill="#818cf855" fontFamily="monospace">
                PEERS ({compNodes.length})
              </text>
              {compNodes.map(({ node, cx, cy }) => {
                const pal   = DIR_PALETTE.COMPETITOR
                const isHov = hovered === node.id
                const name  = node.entity_name.length > 15 ? node.entity_name.slice(0, 14) + '…' : node.entity_name
                return (
                  <g key={`co-${node.id}`} data-node="1" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered(node.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onNodeClick(node)}
                    filter={isHov ? 'url(#sc-glow-e)' : undefined}
                  >
                    <rect x={cx - COMP_W / 2} y={cy - COMP_H / 2}
                      width={COMP_W} height={COMP_H} rx={3}
                      fill={isHov ? pal.bg + 'ff' : pal.bg + 'aa'}
                      stroke={pal.border}
                      strokeWidth={isHov ? 1.2 : 0.5}
                      strokeOpacity={isHov ? 1 : 0.5}
                    />
                    <text x={cx} y={cy}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fill={isHov ? pal.text : pal.text + 'aa'}
                      fontFamily="monospace">
                      {name}
                    </text>
                  </g>
                )
              })}
            </>
          )}

          {/* ── Meta chip clusters ────────────────────────────────────── */}
          {metaClusters.map(mc => (
            <g key={`meta-${mc.dir}`}>
              <rect x={mc.gx - 2} y={mc.gy - 2} width={mc.gw + 4} height={mc.gh + 4} rx={4}
                fill="none" stroke={mc.color.border} strokeWidth={0.4} strokeOpacity={0.15}/>
              {/* Label bar */}
              <g data-node="1" style={{ cursor: 'pointer' }}
                onClick={() => onHubClick?.(mc.dir, mc.label, mc.chips as SCEdge[])}>
                <rect x={mc.gx} y={mc.gy} width={mc.gw} height={META_LABEL_H} rx={2}
                  fill={mc.color.border + '15'}/>
                <rect x={mc.gx} y={mc.gy} width={mc.gw} height={2} rx={1}
                  fill={mc.color.border} fillOpacity={0.5}/>
                <text x={mc.gx + mc.gw / 2} y={mc.gy + META_LABEL_H / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={6.5} fontWeight="bold" letterSpacing={1.5}
                  fill={mc.color.text} fontFamily="monospace">
                  {mc.label} ({mc.chips.length})
                </text>
              </g>
              {/* Chips */}
              {mc.chips.map(chip => {
                const isHov = hovered === chip.id
                const name  = chip.entity_name.length > 13 ? chip.entity_name.slice(0, 12) + '…' : chip.entity_name
                return (
                  <g key={`mc-${chip.id}`} data-node="1" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered(chip.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onNodeClick(chip)}
                    filter={isHov ? 'url(#sc-glow-e)' : undefined}
                  >
                    <rect x={chip._cx} y={chip._cy} width={META_CHIP_W} height={META_CHIP_H} rx={2}
                      fill={isHov ? mc.color.bg + 'ff' : mc.color.bg + 'dd'}
                      stroke={isHov ? mc.color.border : mc.color.border + '55'}
                      strokeWidth={isHov ? 1 : 0.4}/>
                    <rect x={chip._cx} y={chip._cy} width={2} height={META_CHIP_H} rx={1}
                      fill={mc.color.border} fillOpacity={0.8}/>
                    <text x={chip._cx + 7} y={chip._cy + META_CHIP_H / 2}
                      dominantBaseline="middle" fontSize={6.5}
                      fill={isHov ? mc.color.text : mc.color.text + 'cc'}
                      fontFamily="monospace">
                      {name}
                    </text>
                  </g>
                )
              })}
            </g>
          ))}

          {/* ── Focal node ───────────────────────────────────────────── */}
          <g filter="url(#sc-glow-f)" data-node="1" style={{ cursor: 'pointer' }}
            onClick={() => onFocalClick?.()}>
            <circle cx={0} cy={0} r={FOCAL_R + 14}
              fill="none" stroke="#00d4ff" strokeWidth={0.4} strokeOpacity={0.1}/>
            <circle cx={0} cy={0} r={FOCAL_R + 5}
              fill="none" stroke="#00d4ff" strokeWidth={0.6} strokeOpacity={0.18}/>
            <circle cx={0} cy={0} r={FOCAL_R}
              fill="#030c18" stroke="#00d4ff" strokeWidth={1.8}/>
            <text x={0} y={-6} textAnchor="middle" dominantBaseline="middle"
              fontSize={16} fontWeight="bold" fill="#00d4ff" fontFamily="monospace">
              {ticker}
            </text>
            <text x={0} y={11} textAnchor="middle"
              fontSize={6.5} fill="#4a6070" fontFamily="monospace">
              {legalName.length > 18 ? legalName.slice(0, 17) + '…' : legalName}
            </text>
          </g>

        </g>
      </svg>
    </div>
  )
}
