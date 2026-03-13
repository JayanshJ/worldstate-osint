/**
 * SCGraph — Bloomberg P164-style Relationship Map.
 *
 * Layout mirrors Bloomberg terminal:
 *   - Focal company node at centre
 *   - Each category forms a compact chip-grid cluster orbiting the focal
 *   - A small hub dot + category label sits between focal and the chip grid
 *   - Single spoke from focal edge → hub dot → chip grid
 *
 * Categories: SUPPLIERS · CUSTOMERS · COMPETITORS · SHAREHOLDERS · BOARD · ANALYSTS · INDUSTRIES
 */

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import type { SCEdge } from '@/lib/api'

// ─── Palette ────────────────────────────────────────────────────────────────
const DIR: Record<string, { bg: string; border: string; text: string; edge: string }> = {
  UPSTREAM:    { bg: '#061210', border: '#00c896', text: '#6ee7c7', edge: '#00c896' },
  DOWNSTREAM:  { bg: '#120b00', border: '#f59e0b', text: '#fcd34d', edge: '#f59e0b' },
  COMPETITOR:  { bg: '#08081a', border: '#818cf8', text: '#a5b4fc', edge: '#818cf8' },
  SHAREHOLDER: { bg: '#100a00', border: '#eab308', text: '#fde047', edge: '#eab308' },
  BOARD:       { bg: '#130818', border: '#e879f9', text: '#f0abfc', edge: '#e879f9' },
  ANALYST:     { bg: '#0a0818', border: '#a78bfa', text: '#c4b5fd', edge: '#a78bfa' },
  INDUSTRY:    { bg: '#041012', border: '#06b6d4', text: '#67e8f9', edge: '#06b6d4' },
}

const RATING_COLOR: Record<string, string> = {
  BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444',
}

const RISK_COLOR = { HIGH: '#ef4444', MEDIUM: '#f97316', LOW: '#22c55e', NONE: '#2a3a4a' }

function riskOf(e: SCEdge): keyof typeof RISK_COLOR {
  const x = e.pct_revenue ?? e.pct_cogs ?? 0
  if (e.sole_source || x >= 20) return 'HIGH'
  if (x >= 10) return 'MEDIUM'
  if (x > 0)   return 'LOW'
  return 'NONE'
}

// ─── Category ring order (clockwise from top) ────────────────────────────────
const CAT_DEFS = [
  { dir: 'UPSTREAM',    label: 'SUPPLIERS',    short: 'SUPPLIERS'    },
  { dir: 'DOWNSTREAM',  label: 'CUSTOMERS',    short: 'CUSTOMERS'    },
  { dir: 'SHAREHOLDER', label: 'HOLDERS',      short: 'HOLDERS'      },
  { dir: 'BOARD',       label: 'BOARD',        short: 'BOARD'        },
  { dir: 'ANALYST',     label: 'ANALYSTS',     short: 'ANALYSTS'     },
  { dir: 'INDUSTRY',    label: 'INDUSTRIES',   short: 'INDUSTRIES'   },
  { dir: 'COMPETITOR',  label: 'PEERS',        short: 'PEERS'        },
] as const

// ─── Chip grid constants ──────────────────────────────────────────────────────
const COLS      = 3       // chips per row in each cluster
const CHIP_W    = 82      // chip width
const CHIP_H    = 22      // chip height
const GAP_X     = 4       // horizontal gap between chips
const GAP_Y     = 3       // vertical gap between chip rows
const LABEL_H   = 18      // category label bar height
const HUB_CR    = 6       // hub dot radius
const HUB_R     = 200     // hub orbit radius from focal centre
const GRID_EXTRA = 28     // extra distance past hub before grid starts
const FOCAL_R   = 44
const PAD       = 72

interface ChipNode extends SCEdge {
  _x: number   // chip top-left x
  _y: number   // chip top-left y
}

interface Cluster {
  dir: string
  label: string
  color: typeof DIR[string]
  hubX: number
  hubY: number
  angle: number
  gridX: number   // grid top-left x
  gridY: number   // grid top-left y
  gridW: number
  gridH: number
  chips: ChipNode[]
  total: number   // total node count (same as chips.length for now)
}

export interface SCGraphProps {
  ticker: string
  legalName: string
  edges: SCEdge[]
  onNodeClick: (e: SCEdge) => void
  onHubClick?: (dir: string, label: string, nodes: SCEdge[]) => void
  onFocalClick?: () => void
}

export function SCGraph({ ticker, legalName, edges, onNodeClick, onHubClick, onFocalClick }: SCGraphProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [tf, setTf]           = useState({ x: 0, y: 0, s: 1 })
  const dragging = useRef(false)
  const lastPos  = useRef({ x: 0, y: 0 })
  const svgRef   = useRef<SVGSVGElement>(null)

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
    lastPos.current = { x: e.clientX, y: e.clientY }
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

  // ── Layout ─────────────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    const cx = 0, cy = 0

    const activeCats = CAT_DEFS
      .map(def => ({ ...def, nodes: edges.filter(e => e.direction === def.dir) }))
      .filter(c => c.nodes.length > 0)

    if (activeCats.length === 0) return null

    // Proportional angular sectors
    const weights = activeCats.map(c => Math.max(2, c.nodes.length))
    const totalW  = weights.reduce((a, b) => a + b, 0)

    let angleAccum = -Math.PI / 2  // start at 12 o'clock

    const clusters: Cluster[] = activeCats.map((cat, i) => {
      const sectorSpan = (weights[i] / totalW) * 2 * Math.PI
      const midAngle   = angleAccum + sectorSpan / 2
      angleAccum      += sectorSpan

      const color = DIR[cat.dir] ?? DIR.COMPETITOR

      // Hub dot position
      const hubX = cx + HUB_R * Math.cos(midAngle)
      const hubY = cy + HUB_R * Math.sin(midAngle)

      // Grid dimensions
      const n     = cat.nodes.length
      const cols  = Math.min(COLS, n)
      const rows  = Math.ceil(n / cols)
      const gridW = cols * CHIP_W + (cols - 1) * GAP_X
      const gridH = LABEL_H + rows * CHIP_H + (rows - 1) * GAP_Y

      // Grid centre: pushed further out from focal past hub
      const outDist  = HUB_R + GRID_EXTRA + gridH / 2
      const gridCX   = cx + Math.cos(midAngle) * outDist
      const gridCY   = cy + Math.sin(midAngle) * outDist
      const gridX    = gridCX - gridW / 2
      const gridY    = gridCY - gridH / 2

      // Chip positions within grid
      const chips: ChipNode[] = cat.nodes.map((node, j) => {
        const col = j % cols
        const row = Math.floor(j / cols)
        return {
          ...node,
          _x: gridX + col * (CHIP_W + GAP_X),
          _y: gridY + LABEL_H + row * (CHIP_H + GAP_Y),
        }
      })

      return {
        dir: cat.dir, label: cat.label, color,
        hubX, hubY, angle: midAngle,
        gridX, gridY, gridW, gridH,
        chips, total: n,
      }
    })

    // ViewBox
    const allX: number[] = [], allY: number[] = []
    for (const c of clusters) {
      allX.push(c.gridX, c.gridX + c.gridW)
      allY.push(c.gridY, c.gridY + c.gridH)
    }
    const minX = Math.min(...allX) - PAD
    const maxX = Math.max(...allX) + PAD
    const minY = Math.min(...allY) - PAD
    const maxY = Math.max(...allY) + PAD

    return { cx, cy, clusters, vb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } }
  }, [edges])

  if (!layout) return (
    <div className="w-full h-full flex items-center justify-center text-terminal-dim text-xs font-mono">
      No graph data
    </div>
  )

  const { cx, cy, clusters, vb } = layout

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
          <filter id="sc-glow-hub" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="sc-glow-e" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.s})`}>

          {/* ── Spokes: focal → hub dot ──────────────────────────────────── */}
          {clusters.map(c => {
            const dx = c.hubX - cx, dy = c.hubY - cy
            const len = Math.sqrt(dx * dx + dy * dy)
            const ux = dx / len, uy = dy / len
            // spoke from focal circle edge to just before the hub dot
            const x1 = cx + ux * (FOCAL_R + 2)
            const y1 = cy + uy * (FOCAL_R + 2)
            const x2 = c.hubX - ux * (HUB_CR + 1)
            const y2 = c.hubY - uy * (HUB_CR + 1)
            // line continues from hub to grid label centre
            const labelCX = c.gridX + c.gridW / 2
            const labelCY = c.gridY + LABEL_H / 2
            const dx2 = labelCX - c.hubX, dy2 = labelCY - c.hubY
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
            const x3 = c.hubX + (dx2 / len2) * (HUB_CR + 1)
            const y3 = c.hubY + (dy2 / len2) * (HUB_CR + 1)
            return (
              <g key={`spoke-${c.dir}`}>
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={c.color.edge} strokeWidth={0.8} strokeOpacity={0.35}/>
                <line x1={x3} y1={y3} x2={labelCX} y2={labelCY}
                  stroke={c.color.edge} strokeWidth={0.6}
                  strokeOpacity={0.2} strokeDasharray="3 4"/>
              </g>
            )
          })}

          {/* ── Hub dots ─────────────────────────────────────────────────── */}
          {clusters.map(c => (
            <g key={`hub-${c.dir}`} filter="url(#sc-glow-hub)"
              data-node="1" style={{ cursor: 'pointer' }}
              onClick={() => onHubClick?.(c.dir, c.label, c.chips as SCEdge[])}
            >
              {/* Large invisible hit area */}
              <circle cx={c.hubX} cy={c.hubY} r={HUB_CR + 14} fill="transparent"/>
              <circle cx={c.hubX} cy={c.hubY} r={HUB_CR + 4}
                fill="none" stroke={c.color.border}
                strokeWidth={0.5} strokeOpacity={0.2}/>
              <circle cx={c.hubX} cy={c.hubY} r={HUB_CR}
                fill={c.color.bg} stroke={c.color.border} strokeWidth={1.2}/>
            </g>
          ))}

          {/* ── Chip clusters ─────────────────────────────────────────────── */}
          {clusters.map(c => (
            <g key={`cluster-${c.dir}`}>
              {/* Cluster outer border */}
              <rect x={c.gridX - 2} y={c.gridY - 2}
                width={c.gridW + 4} height={c.gridH + 4} rx={4}
                fill="none"
                stroke={c.color.border} strokeWidth={0.5} strokeOpacity={0.15}/>

              {/* Category label bar — clickable */}
              <g data-node="1" style={{ cursor: 'pointer' }}
                onClick={() => onHubClick?.(c.dir, c.label, c.chips as SCEdge[])}>
                <rect x={c.gridX} y={c.gridY} width={c.gridW} height={LABEL_H} rx={3}
                  fill={c.color.border + '18'}/>
                <rect x={c.gridX} y={c.gridY} width={c.gridW} height={2} rx={1}
                  fill={c.color.border} fillOpacity={0.6}/>
                <text x={c.gridX + c.gridW / 2} y={c.gridY + LABEL_H / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={7} fontWeight="bold" letterSpacing={1.5}
                  fill={c.color.text} fontFamily="monospace">
                  {c.label} ({c.total})
                </text>
              </g>

              {/* Chip nodes */}
              {c.chips.map(chip => {
                const isHov = hovered === chip.id
                const isSH  = chip.direction === 'SHAREHOLDER'
                const isBD  = chip.direction === 'BOARD'
                const isAN  = chip.direction === 'ANALYST'
                const isIN  = chip.direction === 'INDUSTRY'
                const isMeta = isSH || isBD || isAN || isIN
                const exp   = chip.pct_revenue ?? chip.pct_cogs ?? 0
                const risk  = riskOf(chip)

                // Accent colour
                const accentColor = isAN
                  ? (RATING_COLOR[chip.relationship_type ?? ''] ?? c.color.border)
                  : isMeta ? c.color.border : RISK_COLOR[risk]

                // Truncated name — chip is narrow
                const maxCh = Math.floor((CHIP_W - 10) / 5.8)
                const name  = chip.entity_name.length > maxCh
                  ? chip.entity_name.slice(0, maxCh - 1) + '…'
                  : chip.entity_name

                // Sub-label (small, bottom line)
                const sub = isBD
                  ? (chip.relationship_type || '').replace(/_/g, ' ')
                  : isSH
                    ? (exp > 0 ? `${exp.toFixed(1)}%` : chip.relationship_type === 'MUTUAL_FUND' ? 'MF' : 'INST')
                    : isAN
                      ? (chip.relationship_type || '')
                      : isIN
                        ? (chip.relationship_type?.replace('GICS_', '').replace(/_/g, ' ') || '')
                        : [chip.hq_country, chip.tier === 2 ? 'T2' : ''].filter(Boolean).join(' · ')

                const hasSub = !!sub
                const nameY  = hasSub ? chip._y + 7 : chip._y + CHIP_H / 2

                return (
                  <g key={`chip-${chip.id}`} data-node="1" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHovered(chip.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onNodeClick(chip)}
                    filter={isHov ? 'url(#sc-glow-e)' : undefined}
                  >
                    {/* Chip background */}
                    <rect x={chip._x} y={chip._y} width={CHIP_W} height={CHIP_H} rx={2}
                      fill={isHov ? c.color.bg + 'ff' : c.color.bg + 'dd'}
                      stroke={isHov ? c.color.border : c.color.border + '55'}
                      strokeWidth={isHov ? 1 : 0.5}/>
                    {/* Left accent bar */}
                    <rect x={chip._x} y={chip._y} width={2} height={CHIP_H} rx={1}
                      fill={accentColor} fillOpacity={0.85}/>
                    {/* Name */}
                    <text x={chip._x + 7} y={nameY}
                      dominantBaseline="middle" fontSize={7}
                      fill={isHov ? c.color.text : c.color.text + 'cc'}
                      fontFamily="monospace" fontWeight="500">
                      {name}
                    </text>
                    {/* Sub-label */}
                    {hasSub && (
                      <text x={chip._x + 7} y={chip._y + CHIP_H - 5}
                        fontSize={5.5}
                        fill={isAN ? accentColor + 'dd' : c.color.border + '70'}
                        fontFamily="monospace">
                        {sub.length > 16 ? sub.slice(0, 15) + '…' : sub}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          ))}

          {/* ── Focal node ───────────────────────────────────────────────── */}
          <g filter="url(#sc-glow-f)" data-node="1" style={{ cursor: 'pointer' }}
            onClick={() => onFocalClick?.()}>
            <circle cx={cx} cy={cy} r={FOCAL_R + 14}
              fill="none" stroke="#00d4ff" strokeWidth={0.4} strokeOpacity={0.1}/>
            <circle cx={cx} cy={cy} r={FOCAL_R + 5}
              fill="none" stroke="#00d4ff" strokeWidth={0.6} strokeOpacity={0.18}/>
            <circle cx={cx} cy={cy} r={FOCAL_R}
              fill="#030c18" stroke="#00d4ff" strokeWidth={1.8}/>
            <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
              fontSize={16} fontWeight="bold" fill="#00d4ff" fontFamily="monospace">
              {ticker}
            </text>
            <text x={cx} y={cy + 11} textAnchor="middle"
              fontSize={6.5} fill="#4a6070" fontFamily="monospace">
              {legalName.length > 18 ? legalName.slice(0, 17) + '…' : legalName}
            </text>
          </g>

        </g>
      </svg>
    </div>
  )
}
