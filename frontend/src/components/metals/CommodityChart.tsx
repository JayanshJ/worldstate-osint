import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { useTimezone } from '@/context/TimezoneContext'

interface PricePoint { t: string; p: number; o?: number; h?: number; l?: number }

interface HistoryData {
  key:     string
  range:   string
  points:  PricePoint[]
  current: number
  open:    number
  high:    number
  low:     number
  change:  number | null
}

export interface CommodityInfo {
  key:    string
  label:  string
  name:   string
  color:  string
  price:  string
  change: number | null
}

const RANGES = ['1h', '6h', '1d', '1w', '1m'] as const
type Range = typeof RANGES[number]
type ChartType = 'line' | 'candle'

function fmt(v: number, key: string) {
  return key === 'silver' || key === 'wti'
    ? `$${v.toFixed(2)}`
    : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function fmtAxis(v: number, key: string) {
  return key === 'silver' || key === 'wti' ? v.toFixed(2) : v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtTime(iso: string, range: Range, tz: string) {
  // Bare date strings (e.g. "2026-03-28" from stooq) are UTC midnight — append noon
  // to prevent timezone rollback to the previous day in local display
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso
  const d = new Date(normalized)
  if (range === '1w' || range === '1m')
    return d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  return d.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
}

// Catmull-Rom smooth path
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  const t = 0.3
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i], p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) * t
    const cp1y = p1[1] + (p2[1] - p0[1]) * t
    const cp2x = p2[0] - (p3[0] - p1[0]) * t
    const cp2y = p2[1] - (p3[1] - p1[1]) * t
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

const W = 640, H = 180
const PL = 8, PR = 56, PT = 12, PB = 28
const CW = W - PL - PR, CH = H - PT - PB

function LineChart({ points, color, range, commodity, tz }: {
  points: PricePoint[]; color: string; range: Range; commodity: string; tz: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (points.length < 2) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center text-[11px] font-mono text-[#3a3f5c] tracking-widest">
        COLLECTING DATA
      </div>
    )
  }

  const prices = points.map(p => p.p)
  const lo = Math.min(...prices), hi = Math.max(...prices)
  const pad = (hi - lo) * 0.15 || hi * 0.008
  const yLo = lo - pad, yHi = hi + pad

  // Time-based x-scaling so market gaps (evenings, weekends) don't stretch the chart
  const tsArr = points.map(p => new Date(p.t).getTime())
  const tMin = tsArr[0], tMax = tsArr[tsArr.length - 1]
  const tRange = tMax - tMin || 1
  const xS = (i: number) => PL + ((tsArr[i] - tMin) / tRange) * CW
  const yS = (p: number) => PT + (1 - (p - yLo) / (yHi - yLo)) * CH

  const isUp = prices[prices.length - 1] >= prices[0]
  const lineClr = isUp ? color : '#f87171'

  const coords: [number, number][] = points.map((_, i) => [xS(i), yS(points[i].p)])
  const line = smoothPath(coords)

  const yTicks = [0, 0.5, 1].map(f => yLo + f * (yHi - yLo))
  const xIdxs = [0, Math.floor(points.length * 0.33), Math.floor(points.length * 0.66), points.length - 1]

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return
    const r = svg.getBoundingClientRect()
    const mx = (e.clientX - r.left) * (W / r.width) - PL
    // Find closest point by time position
    const targetT = tMin + (mx / CW) * tRange
    let closest = 0
    let bestDiff = Infinity
    tsArr.forEach((t, i) => { const d = Math.abs(t - targetT); if (d < bestDiff) { bestDiff = d; closest = i } })
    setHoverIdx(closest)
  }, [tsArr, tMin, tRange])

  const hp = hoverIdx !== null ? points[hoverIdx] : null
  const hx = hoverIdx !== null ? xS(hoverIdx) : null
  const hy = hoverIdx !== null ? yS(points[hoverIdx].p) : null

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}
      onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>

      {yTicks.map((v, i) => (
        <line key={i} x1={PL} y1={yS(v).toFixed(1)} x2={PL + CW} y2={yS(v).toFixed(1)}
          stroke="#ffffff06" strokeWidth="1" />
      ))}

      <path d={line} fill="none" stroke={lineClr} strokeWidth="1.5" strokeLinecap="round" />

      {hoverIdx === null && (
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]}
          r="2.5" fill={lineClr} />
      )}

      {yTicks.map((v, i) => (
        <text key={i} x={PL + CW + 5} y={yS(v) + 3.5}
          fontSize="8.5" fill="#374151" fontFamily="monospace" textAnchor="start">
          {fmtAxis(v, commodity)}
        </text>
      ))}

      {xIdxs.map((idx, i) => (
        <text key={i} x={xS(idx)} y={H - 5}
          fontSize="8.5" fill="#374151" fontFamily="monospace"
          textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'}>
          {fmtTime(points[idx].t, range, tz)}
        </text>
      ))}

      {hoverIdx !== null && hp && hx !== null && hy !== null && (
        <>
          <line x1={hx} y1={PT} x2={hx} y2={PT + CH} stroke="#ffffff0d" strokeWidth="1" />
          <circle cx={hx} cy={hy} r="3" fill="#0a0c14" stroke={lineClr} strokeWidth="1.5" />
          <rect x={PL + CW + 1} y={hy - 7} width={PR - 3} height={14} rx="2"
            fill="#0a0c14" stroke={lineClr} strokeWidth="0.75" strokeOpacity="0.5" />
          <text x={PL + CW + PR / 2 - 1} y={hy + 4}
            fontSize="8.5" fill={lineClr} fontFamily="monospace" textAnchor="middle" fontWeight="600">
            {fmtAxis(hp.p, commodity)}
          </text>
        </>
      )}
    </svg>
  )
}

function CandleChart({ points, color, range, commodity, tz }: {
  points: PricePoint[]; color: string; range: Range; commodity: string; tz: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Need OHLC data
  const hasOHLC = points.length > 0 && points[0].o !== undefined

  if (!hasOHLC) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center text-[11px] font-mono text-[#3a3f5c] tracking-widest">
        OHLC UNAVAILABLE FOR THIS RANGE
      </div>
    )
  }

  if (points.length < 2) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center text-[11px] font-mono text-[#3a3f5c] tracking-widest">
        COLLECTING DATA
      </div>
    )
  }

  const allLows  = points.map(p => p.l ?? p.p)
  const allHighs = points.map(p => p.h ?? p.p)
  const lo = Math.min(...allLows), hi = Math.max(...allHighs)
  const pad = (hi - lo) * 0.12 || hi * 0.008
  const yLo = lo - pad, yHi = hi + pad

  const n = points.length
  const candleW = Math.max(2, Math.min(10, (CW / n) * 0.65))
  const xS = (i: number) => PL + (i / (n - 1)) * CW
  const yS = (p: number) => PT + (1 - (p - yLo) / (yHi - yLo)) * CH

  const yTicks = [0, 0.5, 1].map(f => yLo + f * (yHi - yLo))
  const xIdxs = [0, Math.floor(n * 0.33), Math.floor(n * 0.66), n - 1]

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return
    const r = svg.getBoundingClientRect()
    const mx = (e.clientX - r.left) * (W / r.width) - PL
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(mx / CW * (n - 1)))))
  }, [n])

  const hp = hoverIdx !== null ? points[hoverIdx] : null
  const hx = hoverIdx !== null ? xS(hoverIdx) : null

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}
      onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>

      {yTicks.map((v, i) => (
        <line key={i} x1={PL} y1={yS(v).toFixed(1)} x2={PL + CW} y2={yS(v).toFixed(1)}
          stroke="#ffffff06" strokeWidth="1" />
      ))}

      {points.map((p, i) => {
        const open  = p.o ?? p.p
        const close = p.p
        const high  = p.h ?? Math.max(open, close)
        const low   = p.l ?? Math.min(open, close)
        const isGreen = close >= open
        const clr = isGreen ? '#4ade80' : '#f87171'
        const cx = xS(i)
        const bodyTop    = yS(Math.max(open, close))
        const bodyBottom = yS(Math.min(open, close))
        const bodyH = Math.max(1, bodyBottom - bodyTop)
        const isHovered = hoverIdx === i

        return (
          <g key={i} opacity={hoverIdx !== null && !isHovered ? 0.4 : 1}>
            {/* Wick */}
            <line x1={cx} y1={yS(high)} x2={cx} y2={yS(low)}
              stroke={clr} strokeWidth="0.75" strokeOpacity="0.7" />
            {/* Body */}
            <rect
              x={cx - candleW / 2} y={bodyTop}
              width={candleW} height={bodyH}
              fill={isGreen ? `${clr}55` : `${clr}55`}
              stroke={clr} strokeWidth="0.75"
            />
          </g>
        )
      })}

      {yTicks.map((v, i) => (
        <text key={i} x={PL + CW + 5} y={yS(v) + 3.5}
          fontSize="8.5" fill="#374151" fontFamily="monospace" textAnchor="start">
          {fmtAxis(v, commodity)}
        </text>
      ))}

      {xIdxs.map((idx, i) => (
        <text key={i} x={xS(idx)} y={H - 5}
          fontSize="8.5" fill="#374151" fontFamily="monospace"
          textAnchor={i === 0 ? 'start' : i === xIdxs.length - 1 ? 'end' : 'middle'}>
          {fmtTime(points[idx].t, range, tz)}
        </text>
      ))}

      {/* Hover tooltip */}
      {hoverIdx !== null && hp && hx !== null && (() => {
        const open  = hp.o ?? hp.p
        const close = hp.p
        const high  = hp.h ?? Math.max(open, close)
        const low   = hp.l ?? Math.min(open, close)
        const isGreen = close >= open
        const clr = isGreen ? '#4ade80' : '#f87171'
        const midY = yS((high + low) / 2)
        return (
          <>
            <line x1={hx} y1={PT} x2={hx} y2={PT + CH} stroke="#ffffff0d" strokeWidth="1" />
            <rect x={PL + CW + 1} y={midY - 28} width={PR - 3} height={56} rx="2"
              fill="#0a0c14" stroke={clr} strokeWidth="0.75" strokeOpacity="0.5" />
            {[
              { label: 'O', val: open,  yOff: -18 },
              { label: 'H', val: high,  yOff: -6  },
              { label: 'L', val: low,   yOff:  6  },
              { label: 'C', val: close, yOff:  18 },
            ].map(({ label, val, yOff }) => (
              <text key={label} x={PL + CW + PR / 2 - 1} y={midY + yOff}
                fontSize="7.5" fill={label === 'C' ? clr : '#6b7280'}
                fontFamily="monospace" textAnchor="middle" fontWeight={label === 'C' ? '700' : '400'}>
                {label} {fmtAxis(val, commodity)}
              </text>
            ))}
          </>
        )
      })()}
    </svg>
  )
}

interface Props { commodity: CommodityInfo; onClose: () => void }

export function CommodityChart({ commodity, onClose }: Props) {
  const [range, setRange]         = useState<Range>('1d')
  const [chartType, setChartType] = useState<ChartType>('line')
  const [data, setData]           = useState<HistoryData | null>(null)
  const [loading, setLoading]     = useState(true)
  const { timezone: tz } = useTimezone()

  useEffect(() => {
    setLoading(true); setData(null)
    const tok = localStorage.getItem('ws_token') ?? ''
    fetch(`/api/v1/metals/history/${commodity.key}?range=${range}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    }).then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [commodity.key, range])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Compute % from the actual range shown in the chart (open = first point, current = last)
  // This makes the % always match what the chart is displaying, regardless of range
  const change = data && data.open > 0
    ? +((data.current - data.open) / data.open * 100).toFixed(2)
    : commodity.change
  const isUp = change !== null && change >= 0
  const chgColor = change === null ? '#4b5563' : isUp ? '#4ade80' : '#f87171'

  // Candle mode only meaningful when we have OHLC
  const hasOHLC = data?.points && data.points.length > 0 && data.points[0].o !== undefined
  const effectiveType: ChartType = chartType === 'candle' && !hasOHLC ? 'line' : chartType

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div className="w-full max-w-xl bg-[#08090f] border border-[#13151f] font-mono shadow-2xl">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: commodity.color }}>
              {commodity.label}
            </span>
            <span className="text-[10px] text-[#374151] tracking-wider">{commodity.name}</span>
          </div>
          <button onClick={onClose} className="text-[#374151] hover:text-[#6b7280] transition-colors">
            <X size={13} />
          </button>
        </div>

        {/* Price */}
        <div className="px-5 pb-3">
          <div className="text-2xl font-bold text-white tabular-nums tracking-tight">
            {commodity.price}
          </div>
          {change !== null && (
            <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: chgColor }}>
              {isUp ? '+' : ''}{change.toFixed(2)}%
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="px-2">
          {loading ? (
            <div style={{ height: H }} className="flex items-center justify-center text-[10px] text-[#1f2937] tracking-widest animate-pulse">
              LOADING
            </div>
          ) : data ? (
            effectiveType === 'candle'
              ? <CandleChart points={data.points} color={commodity.color} range={range} commodity={commodity.key} tz={tz} />
              : <LineChart   points={data.points} color={commodity.color} range={range} commodity={commodity.key} tz={tz} />
          ) : (
            <div style={{ height: H }} className="flex items-center justify-center text-[10px] text-[#1f2937]">
              NO DATA
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0 px-5 pb-4 pt-1">
          {/* Range tabs */}
          {(['1h', '6h', '1d', '1w', '1m'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className="text-[9px] tracking-widest px-2.5 py-1 transition-colors"
              style={{
                color:      range === r ? commodity.color : '#374151',
                fontWeight: range === r ? 700 : 400,
              }}>
              {r.toUpperCase()}
            </button>
          ))}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Chart type toggle */}
          <div className="flex items-center gap-0 border border-[#1a1f2e] rounded-sm">
            {(['line', 'candle'] as ChartType[]).map(t => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                disabled={t === 'candle' && !hasOHLC}
                className="text-[8px] tracking-widest px-2 py-0.5 transition-colors disabled:opacity-25"
                style={{
                  color:           chartType === t ? commodity.color : '#374151',
                  fontWeight:      chartType === t ? 700 : 400,
                  backgroundColor: chartType === t ? `${commodity.color}10` : 'transparent',
                }}
              >
                {t === 'line' ? 'LINE' : 'OHLC'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
