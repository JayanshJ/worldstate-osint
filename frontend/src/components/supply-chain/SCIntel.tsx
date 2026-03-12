/**
 * SCIntel — Supply Chain Intelligence Dashboard
 *
 * Four panels shown on the INTEL tab:
 *   1. Risk Scorecard   — overall SC risk score with sub-scores
 *   2. Geo Exposure     — country breakdown with flag + risk tier
 *   3. Concentration    — ranked bar chart by revenue/COGS exposure %
 *   4. SC News          — live articles mentioning the company + named suppliers
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Globe, BarChart2, Newspaper, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { SCEdge, SCCompany } from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── Country helpers ──────────────────────────────────────────────────────

const ALPHA3_TO_2: Record<string, string> = {
  TWN: 'TW', CHN: 'CN', USA: 'US', KOR: 'KR', JPN: 'JP',
  DEU: 'DE', GBR: 'GB', IND: 'IN', NLD: 'NL', IRL: 'IE',
  SGP: 'SG', MYS: 'MY', VNM: 'VN', THA: 'TH', PHL: 'PH',
  MEX: 'MX', BRA: 'BR', CAN: 'CA', AUS: 'AU', FRA: 'FR',
  ITA: 'IT', CHE: 'CH', SWE: 'SE', ISR: 'IL', NOR: 'NO',
  FIN: 'FI', DNK: 'DK', AUT: 'AT', BEL: 'BE', HKG: 'HK',
}

// Countries with elevated geopolitical risk
const HIGH_GEO_RISK = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN'])
const MED_GEO_RISK  = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE'])

function flagEmoji(alpha3: string): string {
  const a2 = ALPHA3_TO_2[alpha3]
  if (!a2) return '🌐'
  return a2
    .split('')
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('')
}

function geoRisk(alpha3: string): 'high' | 'med' | 'low' {
  if (HIGH_GEO_RISK.has(alpha3)) return 'high'
  if (MED_GEO_RISK.has(alpha3))  return 'med'
  return 'low'
}

// ─── Risk score computation ───────────────────────────────────────────────

interface RiskScores {
  overall:       number   // 0–100, higher = riskier
  concentration: number
  soleSource:    number
  geoRisk:       number
  tier:          'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  color:         string
}

function computeRisk(edges: SCEdge[]): RiskScores {
  const upstream = edges.filter(e => e.direction === 'UPSTREAM')

  // Concentration: penalise heavily-concentrated suppliers
  const exposures  = upstream.map(e => e.pct_cogs ?? e.pct_revenue ?? 0)
  const topExposure = Math.max(0, ...exposures)
  const concScore   = Math.min(100, topExposure * 3)

  // Sole-source
  const soles     = upstream.filter(e => e.sole_source).length
  const ssScore   = Math.min(100, soles * 25)

  // Geo-risk: count suppliers in high/med risk countries
  const hiGeo = upstream.filter(e => e.hq_country && HIGH_GEO_RISK.has(e.hq_country)).length
  const mdGeo = upstream.filter(e => e.hq_country && MED_GEO_RISK.has(e.hq_country)).length
  const geoScore = Math.min(100, hiGeo * 20 + mdGeo * 8)

  const overall = Math.round(concScore * 0.4 + ssScore * 0.35 + geoScore * 0.25)

  const tier  = overall >= 70 ? 'CRITICAL' : overall >= 45 ? 'HIGH' : overall >= 20 ? 'MEDIUM' : 'LOW'
  const color = tier === 'CRITICAL' ? '#ef4444' : tier === 'HIGH' ? '#f97316' : tier === 'MEDIUM' ? '#eab308' : '#22c55e'

  return {
    overall,
    concentration: Math.round(concScore),
    soleSource:    Math.round(ssScore),
    geoRisk:       Math.round(geoScore),
    tier,
    color,
  }
}

// ─── Panel: Risk Scorecard ────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[8px] font-mono text-terminal-dim tracking-widest">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-1 bg-terminal-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  )
}

function RiskScorecard({ edges }: { edges: SCEdge[] }) {
  const scores = computeRisk(edges)
  const upstream   = edges.filter(e => e.direction === 'UPSTREAM').length
  const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length
  const soles      = edges.filter(e => e.sole_source).length

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle size={11} className="text-terminal-dim" />
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">SUPPLY CHAIN RISK SCORE</span>
      </div>

      {/* Big score */}
      <div className="flex items-end gap-3">
        <div
          className="text-5xl font-mono font-bold leading-none"
          style={{ color: scores.color }}
        >
          {scores.overall}
        </div>
        <div className="pb-1 space-y-0.5">
          <div className="text-[9px] font-mono font-bold tracking-widest" style={{ color: scores.color }}>
            {scores.tier}
          </div>
          <div className="text-[8px] font-mono text-terminal-dim/50">out of 100</div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-2.5">
        <ScoreBar label="CONCENTRATION RISK" value={scores.concentration} color={scores.color} />
        <ScoreBar label="SOLE-SOURCE RISK"   value={scores.soleSource}    color={scores.color} />
        <ScoreBar label="GEOPOLITICAL RISK"  value={scores.geoRisk}       color={scores.color} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-terminal-border">
        {[
          { label: 'SUPPLIERS',   value: upstream },
          { label: 'CUSTOMERS',   value: downstream },
          { label: 'SOLE-SOURCE', value: soles },
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

// ─── Panel: Geographic Exposure ───────────────────────────────────────────

function GeoExposure({ edges }: { edges: SCEdge[] }) {
  // Count suppliers and customers per country
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

  if (countries.length === 0) {
    return (
      <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={11} className="text-terminal-dim" />
          <span className="text-[9px] font-mono text-terminal-dim tracking-widest">GEOGRAPHIC EXPOSURE</span>
        </div>
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">No country data</p>
      </div>
    )
  }

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={11} className="text-terminal-dim" />
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">GEOGRAPHIC EXPOSURE</span>
        <span className="ml-auto text-[8px] font-mono text-terminal-dim/40">{countries.length} countries</span>
      </div>

      <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
        {countries.map(({ code, sup, cust, total }) => {
          const risk = geoRisk(code)
          const riskColor = risk === 'high' ? '#ef4444' : risk === 'med' ? '#f97316' : '#5a6380'
          return (
            <div key={code} className="flex items-center gap-2">
              <span className="text-base leading-none w-5">{flagEmoji(code)}</span>
              <span className="text-[9px] font-mono text-terminal-dim w-8">{code}</span>
              <div className="flex-1 flex gap-1">
                {sup  > 0 && (
                  <span className="text-[8px] font-mono px-1 bg-sky-500/10 text-sky-400 rounded-sm">
                    {sup}↑ sup
                  </span>
                )}
                {cust > 0 && (
                  <span className="text-[8px] font-mono px-1 bg-green-500/10 text-green-400 rounded-sm">
                    {cust}↓ cust
                  </span>
                )}
              </div>
              {risk !== 'low' && (
                <span className="text-[7px] font-mono tracking-widest" style={{ color: riskColor }}>
                  {risk.toUpperCase()}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Panel: Concentration Chart ───────────────────────────────────────────

function ConcentrationChart({ edges }: { edges: SCEdge[] }) {
  // Primary: quantified exposures; fallback: top by confidence
  const withExposure = edges
    .filter(e => (e.pct_revenue ?? e.pct_cogs ?? 0) > 0)
    .map(e => ({
      name:      e.entity_name,
      value:     e.pct_revenue ?? e.pct_cogs ?? 0,
      direction: e.direction,
      label:     e.pct_revenue != null ? 'REV%' : 'COG%',
      isConf:    false,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)

  const useFallback = withExposure.length === 0
  const items = useFallback
    ? edges
        .filter(e => e.direction !== 'COMPETITOR')
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 12)
        .map(e => ({
          name:      e.entity_name,
          value:     (e.confidence ?? 0.5) * 100,
          direction: e.direction,
          label:     'CONF',
          isConf:    true,
        }))
    : withExposure

  const maxVal = Math.max(1, ...items.map(e => e.value))

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 size={11} className="text-terminal-dim" />
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
          const pct = (value / maxVal) * 100
          return (
            <div key={name} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[8px] font-mono text-terminal-dim truncate max-w-[160px]">{name}</span>
                <span className="text-[8px] font-mono flex-shrink-0 tabular-nums" style={{ color: barColor }}>
                  {value.toFixed(0)}{label === 'CONF' ? '%' : `% ${label}`}
                </span>
              </div>
              <div className="h-1.5 bg-terminal-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 mt-3 pt-2 border-t border-terminal-border">
        {[
          { color: '#0ea5e9', label: 'SUPPLIER' },
          { color: '#22c55e', label: 'CUSTOMER' },
          { color: '#9ca3af', label: 'COMPETITOR' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[7px] font-mono text-terminal-dim/40">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Supply Chain News ─────────────────────────────────────────────

interface NewsItem {
  id:           string
  title:        string
  url:          string
  source_id?:   string
  published_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)   return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)   return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function SCNews({ company, edges }: { company: SCCompany; edges: SCEdge[] }) {
  const [articles, setArticles] = useState<NewsItem[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!company) return
    setLoading(true)

    // Build query: company name + first word of top named partners
    const names = [company.legal_name ?? company.ticker]
    edges
      .filter(e => !e.entity_name.startsWith('['))
      .slice(0, 4)
      .forEach(e => names.push(e.entity_name.split(' ')[0]))
    const q = names.join(' OR ')

    api.search.query(q, 'keyword', 25)
      .then(res => {
        // SearchResponse has article_hits: ArticleHit[]
        const hits = res.article_hits ?? []
        const arts: NewsItem[] = hits.map(h => ({
          id:           h.article_id,
          title:        h.title,
          url:          h.url ?? '#',
          source_id:    h.source_id,
          published_at: h.published_at ?? '',
        }))
        setArticles(arts.slice(0, 15))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [company.ticker])

  return (
    <div className="bg-terminal-surface/40 border border-terminal-border rounded-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper size={11} className="text-terminal-dim" />
        <span className="text-[9px] font-mono text-terminal-dim tracking-widest">SUPPLY CHAIN NEWS</span>
        {loading && (
          <span className="ml-auto text-[8px] font-mono text-terminal-dim/40 animate-pulse">searching…</span>
        )}
      </div>

      {!loading && articles.length === 0 && (
        <p className="text-[9px] font-mono text-terminal-dim/40 text-center py-4">
          No recent articles found
        </p>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
        {articles.map(a => (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <div className="flex items-start gap-2 py-1.5 border-b border-terminal-border/30 hover:border-terminal-accent/20 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-mono text-terminal-dim group-hover:text-terminal-text transition-colors line-clamp-2 leading-relaxed">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {a.source_id && (
                    <span className="text-[7px] font-mono text-terminal-dim/40 uppercase tracking-widest">
                      {a.source_id.replace(/_/g, ' ')}
                    </span>
                  )}
                  {a.published_at && (
                    <span className="text-[7px] font-mono text-terminal-dim/30">
                      {timeAgo(a.published_at)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────

interface SCIntelProps {
  company: SCCompany
  edges:   SCEdge[]
}

export function SCIntel({ company, edges }: SCIntelProps) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin p-4">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Row 1: Risk Scorecard + Geo Exposure */}
        <RiskScorecard edges={edges} />
        <GeoExposure   edges={edges} />

        {/* Row 2: Concentration Chart */}
        <ConcentrationChart edges={edges} />

        {/* Row 3: News (full width) */}
        <div className="md:col-span-1">
          <SCNews company={company} edges={edges} />
        </div>

      </div>
    </div>
  )
}
