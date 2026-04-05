/**
 * SCIntel — Supply Chain Intelligence Dashboard
 *
 * Four panels:
 *   1. Risk Scorecard   — overall SC risk score with sub-scores
 *   2. Geo Exposure     — country breakdown with flag + risk tier
 *   3. Tariff Exposure  — per-country tariff impact (hardcoded April 2026 rates)
 *   4. Concentration    — ranked bar chart by revenue/COGS exposure %
 *   5. Live Disruptions — active event clusters that match supplier/customer entities
 *   6. Contagion Web    — other companies sharing the same suppliers
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Globe, BarChart2, Zap, Network, DollarSign } from 'lucide-react'
import type { SCEdge, SCCompany } from '@/lib/api'

// ─── Country helpers ──────────────────────────────────────────────────────────

const ALPHA3_TO_2: Record<string, string> = {
  TWN: 'TW', CHN: 'CN', USA: 'US', KOR: 'KR', JPN: 'JP',
  DEU: 'DE', GBR: 'GB', IND: 'IN', NLD: 'NL', IRL: 'IE',
  SGP: 'SG', MYS: 'MY', VNM: 'VN', THA: 'TH', PHL: 'PH',
  MEX: 'MX', BRA: 'BR', CAN: 'CA', AUS: 'AU', FRA: 'FR',
  ITA: 'IT', CHE: 'CH', SWE: 'SE', ISR: 'IL', NOR: 'NO',
  FIN: 'FI', DNK: 'DK', AUT: 'AT', BEL: 'BE', HKG: 'HK',
  RUS: 'RU', IRN: 'IR', SAU: 'SA', ARE: 'AE', TUR: 'TR',
}

const ALPHA3_TO_NAME: Record<string, string> = {
  CHN: 'China', USA: 'United States', TWN: 'Taiwan', KOR: 'South Korea',
  JPN: 'Japan', DEU: 'Germany', GBR: 'United Kingdom', IND: 'India',
  MEX: 'Mexico', CAN: 'Canada', IRL: 'Ireland', NLD: 'Netherlands',
  SGP: 'Singapore', MYS: 'Malaysia', VNM: 'Vietnam', THA: 'Thailand',
  PHL: 'Philippines', BRA: 'Brazil', AUS: 'Australia', FRA: 'France',
  ITA: 'Italy', CHE: 'Switzerland', SWE: 'Sweden', ISR: 'Israel',
  RUS: 'Russia', HKG: 'Hong Kong', ARE: 'UAE', SAU: 'Saudi Arabia',
  TUR: 'Turkey',
}

const HIGH_GEO_RISK = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN'])
const MED_GEO_RISK  = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE'])

function flagEmoji(alpha3: string): string {
  const a2 = ALPHA3_TO_2[alpha3]
  if (!a2) return '🌐'
  return a2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

function geoRisk(alpha3: string): 'high' | 'med' | 'low' {
  if (HIGH_GEO_RISK.has(alpha3)) return 'high'
  if (MED_GEO_RISK.has(alpha3))  return 'med'
  return 'low'
}

// ─── Tariff rates (April 2026) ────────────────────────────────────────────────
// Source: White House executive orders + USTR tariff schedules
interface TariffInfo {
  rate:    number       // percentage
  note:    string
  impact: 'critical' | 'high' | 'medium' | 'low' | 'stable'
}

const TARIFF_RATES: Record<string, TariffInfo> = {
  // China: cumulative 145% (20% fentanyl + 125% retaliation escalation)
  CHN: { rate: 145, note: 'Reciprocal + fentanyl tariffs',   impact: 'critical' },
  // Canada/Mexico: 25% on non-USMCA goods
  CAN: { rate: 25,  note: 'Non-USMCA goods',                 impact: 'high'     },
  MEX: { rate: 25,  note: 'Non-USMCA goods',                 impact: 'high'     },
  // EU: 20% (suspended 90 days but listed as pending)
  DEU: { rate: 20,  note: 'EU reciprocal (suspended 90d)',   impact: 'medium'   },
  FRA: { rate: 20,  note: 'EU reciprocal (suspended 90d)',   impact: 'medium'   },
  IRL: { rate: 20,  note: 'EU reciprocal (suspended 90d)',   impact: 'medium'   },
  NLD: { rate: 20,  note: 'EU reciprocal (suspended 90d)',   impact: 'medium'   },
  ITA: { rate: 20,  note: 'EU reciprocal (suspended 90d)',   impact: 'medium'   },
  // Russia: sanctioned, effectively blocked
  RUS: { rate: 35,  note: 'Sanctions + Column 2 tariffs',    impact: 'critical' },
  // Vietnam: 46% (reciprocal)
  VNM: { rate: 46,  note: 'Reciprocal tariff (suspended 90d)', impact: 'high'  },
  // India: 26%
  IND: { rate: 26,  note: 'Reciprocal tariff (suspended 90d)', impact: 'medium'},
  // Taiwan: 32%
  TWN: { rate: 32,  note: 'Reciprocal tariff (suspended 90d)', impact: 'high'  },
  // Japan: 24%
  JPN: { rate: 24,  note: 'Reciprocal tariff (suspended 90d)', impact: 'medium'},
  // South Korea: 25%
  KOR: { rate: 25,  note: 'Reciprocal tariff (suspended 90d)', impact: 'high'  },
  // Thailand: 36%
  THA: { rate: 36,  note: 'Reciprocal tariff (suspended 90d)', impact: 'high'  },
  // Malaysia: 24%
  MYS: { rate: 24,  note: 'Reciprocal tariff (suspended 90d)', impact: 'medium'},
}

const IMPACT_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
  stable:   '#4a6070',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Panel: Risk Scorecard ────────────────────────────────────────────────────

interface RiskScores {
  overall:       number
  concentration: number
  soleSource:    number
  geoRisk:       number
  tier:          'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  color:         string
}

function computeRisk(edges: SCEdge[]): RiskScores {
  const upstream    = edges.filter(e => e.direction === 'UPSTREAM')
  const exposures   = upstream.map(e => e.pct_cogs ?? e.pct_revenue ?? 0)
  const topExposure = Math.max(0, ...exposures)
  const concScore   = Math.min(100, topExposure * 3)
  const soles       = upstream.filter(e => e.sole_source).length
  const ssScore     = Math.min(100, soles * 25)
  const hiGeo       = upstream.filter(e => e.hq_country && HIGH_GEO_RISK.has(e.hq_country)).length
  const mdGeo       = upstream.filter(e => e.hq_country && MED_GEO_RISK.has(e.hq_country)).length
  const geoScore    = Math.min(100, hiGeo * 20 + mdGeo * 8)
  const overall     = Math.round(concScore * 0.4 + ssScore * 0.35 + geoScore * 0.25)
  const tier        = overall >= 70 ? 'CRITICAL' : overall >= 45 ? 'HIGH' : overall >= 20 ? 'MEDIUM' : 'LOW'
  const color       = tier === 'CRITICAL' ? '#ef4444' : tier === 'HIGH' ? '#f97316' : tier === 'MEDIUM' ? '#eab308' : '#22c55e'
  return { overall, concentration: Math.round(concScore), soleSource: Math.round(ssScore), geoRisk: Math.round(geoScore), tier, color }
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[8px] font-mono text-terminal-dim tracking-widest">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 bg-terminal-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }}/>
      </div>
    </div>
  )
}

function RiskScorecard({ edges }: { edges: SCEdge[] }) {
  const scores     = computeRisk(edges)
  const upstream   = edges.filter(e => e.direction === 'UPSTREAM').length
  const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length
  const soles      = edges.filter(e => e.sole_source).length
  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">SUPPLY CHAIN RISK SCORE</span>
      </div>
      <div className="flex items-end gap-3">
        <div className="text-5xl font-mono font-bold leading-none" style={{ color: scores.color }}>{scores.overall}</div>
        <div className="pb-1 space-y-0.5">
          <div className="text-[9px] font-mono font-bold tracking-widest" style={{ color: scores.color }}>{scores.tier}</div>
          <div className="text-[8px] font-mono text-terminal-dim/50">out of 100</div>
        </div>
      </div>
      <div className="space-y-2.5">
        <ScoreBar label="CONCENTRATION RISK" value={scores.concentration} color={scores.color}/>
        <ScoreBar label="SOLE-SOURCE RISK"   value={scores.soleSource}    color={scores.color}/>
        <ScoreBar label="GEOPOLITICAL RISK"  value={scores.geoRisk}       color={scores.color}/>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-terminal-border">
        {[
          { label: 'SUPPLIERS',   value: upstream   },
          { label: 'CUSTOMERS',   value: downstream },
          { label: 'SOLE-SOURCE', value: soles      },
        ].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-[15px] font-mono font-bold text-terminal-text">{value}</div>
            <div className="text-[7px] font-mono text-terminal-dim/50 tracking-wider">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Geographic Exposure ───────────────────────────────────────────────

function GeoExposure({ edges }: { edges: SCEdge[] }) {
  const countryMap = new Map<string, { sup: number; cust: number }>()
  for (const e of edges) {
    if (!e.hq_country) continue
    const prev = countryMap.get(e.hq_country) ?? { sup: 0, cust: 0 }
    if (e.direction === 'UPSTREAM')   countryMap.set(e.hq_country, { ...prev, sup:  prev.sup  + 1 })
    if (e.direction === 'DOWNSTREAM') countryMap.set(e.hq_country, { ...prev, cust: prev.cust + 1 })
  }
  const countries = Array.from(countryMap.entries())
    .map(([code, counts]) => ({ code, ...counts, total: counts.sup + counts.cust }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">GEOGRAPHIC EXPOSURE</span>
        <span className="ml-auto text-[8px] font-mono text-terminal-dim/40">{countries.length} countries</span>
      </div>
      {countries.length === 0 ? (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">No country data</p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
          {countries.map(({ code, sup, cust }) => {
            const risk      = geoRisk(code)
            const riskColor = risk === 'high' ? '#ef4444' : risk === 'med' ? '#f97316' : '#5a6380'
            return (
              <div key={code} className="flex items-center gap-2">
                <span className="text-base leading-none w-5">{flagEmoji(code)}</span>
                <span className="text-[9px] font-mono text-terminal-dim w-8">{code}</span>
                <div className="flex-1 flex gap-1">
                  {sup  > 0 && <span className="text-[8px] font-mono px-1 bg-sky-500/10 text-sky-400 rounded-sm">{sup}↑ sup</span>}
                  {cust > 0 && <span className="text-[8px] font-mono px-1 bg-green-500/10 text-green-400 rounded-sm">{cust}↓ cust</span>}
                </div>
                {risk !== 'low' && (
                  <span className="text-[7px] font-mono tracking-widest" style={{ color: riskColor }}>{risk.toUpperCase()}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Panel: Tariff Impact Estimator ──────────────────────────────────────────

function TariffPanel({ edges }: { edges: SCEdge[] }) {
  // Build per-country supplier count + avg exposure
  const upstream = edges.filter(e => e.direction === 'UPSTREAM' && e.hq_country)
  const countryMap = new Map<string, { count: number; totalExp: number }>()
  for (const e of upstream) {
    const c   = e.hq_country!
    const exp = e.pct_cogs ?? e.pct_revenue ?? 0
    const prev = countryMap.get(c) ?? { count: 0, totalExp: 0 }
    countryMap.set(c, { count: prev.count + 1, totalExp: prev.totalExp + exp })
  }

  const rows = Array.from(countryMap.entries())
    .filter(([code]) => TARIFF_RATES[code] !== undefined)
    .map(([code, { count, totalExp }]) => {
      const tariff = TARIFF_RATES[code]
      const avgExp = totalExp / count
      return { code, count, avgExp, tariff }
    })
    .sort((a, b) => b.tariff.rate - a.tariff.rate)

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">TARIFF EXPOSURE</span>
        <span className="ml-auto text-[8px] font-mono text-terminal-dim/30">Apr 2026</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">
          No tariff-affected suppliers found
        </p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-thin">
          {rows.map(({ code, count, avgExp, tariff }) => {
            const impactColor = IMPACT_COLOR[tariff.impact]
            const name = ALPHA3_TO_NAME[code] ?? code
            return (
              <div key={code} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{flagEmoji(code)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] font-mono text-terminal-dim truncate">{name}</span>
                      <span className="text-[10px] font-mono font-bold flex-shrink-0" style={{ color: impactColor }}>
                        {tariff.rate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[7px] font-mono text-terminal-dim/50">
                        {count} supplier{count !== 1 ? 's' : ''}
                        {avgExp > 0 ? ` · ~${avgExp.toFixed(0)}% avg COGS` : ''}
                      </span>
                      <span className="text-[7px] font-mono tracking-widest ml-auto"
                        style={{ color: impactColor }}>
                        {tariff.impact.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-8">
                  <div className="flex-1 h-1 bg-terminal-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, tariff.rate / 1.5)}%`,
                      background: impactColor,
                    }}/>
                  </div>
                </div>
                <p className="text-[7px] font-mono text-terminal-dim/30 pl-8 truncate">{tariff.note}</p>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-terminal-border">
        <p className="text-[7px] font-mono text-terminal-dim/25 leading-relaxed">
          Rates based on executive orders effective April 2026. Suspended rates shown at full amount.
        </p>
      </div>
    </div>
  )
}

// ─── Panel: Concentration Chart ───────────────────────────────────────────────

function ConcentrationChart({ edges }: { edges: SCEdge[] }) {
  const withExposure = edges
    .filter(e => (e.pct_revenue ?? e.pct_cogs ?? 0) > 0)
    .map(e => ({ name: e.entity_name, value: e.pct_revenue ?? e.pct_cogs ?? 0, direction: e.direction, label: e.pct_revenue != null ? 'REV%' : 'COG%', isConf: false }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)

  const useFallback = withExposure.length === 0
  const items = useFallback
    ? edges.filter(e => e.direction !== 'COMPETITOR').sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 12)
        .map(e => ({ name: e.entity_name, value: (e.confidence ?? 0.5) * 100, direction: e.direction, label: 'CONF', isConf: true }))
    : withExposure

  const maxVal = Math.max(1, ...items.map(e => e.value))

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">
          {useFallback ? 'TOP RELATIONSHIPS' : 'CONCENTRATION'}
        </span>
        <span className="ml-auto text-[8px] font-mono text-terminal-dim/40">
          {useFallback ? 'by confidence' : 'by exposure'}
        </span>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
        {items.map(({ name, value, direction, label }) => {
          const barColor = direction === 'UPSTREAM' ? '#0ea5e9' : direction === 'DOWNSTREAM' ? '#22c55e' : '#9ca3af'
          return (
            <div key={name} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[8px] font-mono text-terminal-dim truncate max-w-[160px]">{name}</span>
                <span className="text-[8px] font-mono flex-shrink-0 tabular-nums" style={{ color: barColor }}>
                  {value.toFixed(0)}{label === 'CONF' ? '%' : `% ${label}`}
                </span>
              </div>
              <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(value / maxVal) * 100}%`, background: barColor }}/>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-3 pt-2 border-t border-terminal-border">
        {[{ color: '#0ea5e9', label: 'SUPPLIER' }, { color: '#22c55e', label: 'CUSTOMER' }, { color: '#9ca3af', label: 'COMPETITOR' }].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-1.5 rounded-full" style={{ background: color }}/>
            <span className="text-[7px] font-mono text-terminal-dim/40">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Live Disruption Feed ──────────────────────────────────────────────

interface DisruptionItem {
  cluster_id:    string
  label:         string | null
  volatility:    number
  bullets:       string[] | null
  affected:      string[]   // supplier/customer names that matched
  last_updated:  string
}

function VolatilityBadge({ v }: { v: number }) {
  const color = v >= 0.75 ? '#ef4444' : v >= 0.5 ? '#f97316' : '#eab308'
  return (
    <span className="text-[8px] font-mono font-bold px-1 py-0.5 rounded-sm"
      style={{ background: color + '22', color, border: `0.5px solid ${color}44` }}>
      {(v * 100).toFixed(0)}
    </span>
  )
}

function SCDisruptions({ ticker, edges }: { ticker: string; edges: SCEdge[] }) {
  const [items,   setItems]   = useState<DisruptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(false)
    fetch(`/api/v1/splc/${ticker}/disruptions`, {
      headers: (() => {
        const t = localStorage.getItem('ws_token')
        return t ? { Authorization: `Bearer ${t}` } : {}
      })(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: DisruptionItem[]) => { setItems(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [ticker])

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">LIVE DISRUPTION FEED</span>
        {loading && <span className="ml-auto text-[8px] font-mono text-terminal-dim/40 animate-pulse">scanning…</span>}
      </div>

      {!loading && error && (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">Could not load disruption feed</p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">
          No active disruptions matching supply chain
        </p>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
        {items.map(item => (
          <div key={item.cluster_id}
            className="border border-terminal-border/40 rounded-sm p-2.5 space-y-1 hover:border-terminal-accent/20 transition-colors">
            <div className="flex items-start gap-2">
              <VolatilityBadge v={item.volatility}/>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-mono text-terminal-dim leading-snug line-clamp-2">
                  {item.label ?? 'Unnamed cluster'}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.affected.map(a => (
                    <span key={a} className="text-[7px] font-mono px-1 py-0.5 rounded-sm bg-sky-500/10 text-sky-400">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[7px] font-mono text-terminal-dim/30 flex-shrink-0 mt-0.5">
                {timeAgo(item.last_updated)}
              </span>
            </div>
            {item.bullets && item.bullets.length > 0 && (
              <p className="text-[7.5px] font-mono text-terminal-dim/50 pl-1 line-clamp-2 leading-relaxed">
                {item.bullets[0]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Contagion Web ─────────────────────────────────────────────────────

interface ContagionItem {
  shared_supplier: string
  other_tickers: Array<{ ticker: string; company_name: string | null }>
}

function ContagionPanel({ ticker }: { ticker: string }) {
  const [items,   setItems]   = useState<ContagionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(false)
    fetch(`/api/v1/splc/${ticker}/contagion`, {
      headers: (() => {
        const t = localStorage.getItem('ws_token')
        return t ? { Authorization: `Bearer ${t}` } : {}
      })(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: ContagionItem[]) => { setItems(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [ticker])

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network size={11} className="text-terminal-dim"/>
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">SHARED EXPOSURE</span>
        {loading && <span className="ml-auto text-[8px] font-mono text-terminal-dim/40 animate-pulse">loading…</span>}
      </div>

      {!loading && error && (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">Could not load contagion data</p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">
          No shared suppliers found across analyzed companies
        </p>
      )}

      <div className="space-y-2.5 max-h-52 overflow-y-auto scrollbar-thin">
        {items.map(item => (
          <div key={item.shared_supplier} className="space-y-1">
            <div className="flex items-baseline gap-1">
              <span className="text-[8px] font-mono text-[#00c896] font-bold truncate">{item.shared_supplier}</span>
              <span className="text-[7px] font-mono text-terminal-dim/40 flex-shrink-0">also supplies:</span>
            </div>
            <div className="flex flex-wrap gap-1 pl-2">
              {item.other_tickers.map(({ ticker: t, company_name }) => (
                <span key={t}
                  className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm bg-terminal-surface border border-terminal-border/50 text-terminal-accent cursor-default"
                  title={company_name ?? t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface SCIntelProps {
  company: SCCompany
  edges:   SCEdge[]
}

export function SCIntel({ company, edges }: SCIntelProps) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Row 1: Risk + Geo */}
        <RiskScorecard edges={edges}/>
        <GeoExposure   edges={edges}/>

        {/* Row 2: Tariff + Concentration */}
        <TariffPanel        edges={edges}/>
        <ConcentrationChart edges={edges}/>

        {/* Row 3: Disruptions + Contagion */}
        <SCDisruptions ticker={company.ticker} edges={edges}/>
        <ContagionPanel    ticker={company.ticker}/>

      </div>
    </div>
  )
}
