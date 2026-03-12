import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps'
// @ts-expect-error — Graticule exists at runtime but is missing from the bundled .d.ts
import { Graticule } from 'react-simple-maps'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Globe, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { api } from '@/lib/api'
import type { EventCluster } from '@/types'
import type { ClusterHit, ArticleHit, SearchResponse } from '@/lib/api'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { CredibilityDot } from '@/components/ui/CredibilityDot'
import { timeAgo } from '@/lib/utils'
import { getSourceLabel } from '@/types'

const GEO_URL = '/countries-110m.json'

// ─── Country name normalisation ──────────────────────────────────────────────
// Maps search-extracted names → canonical GeoJSON names
const COUNTRY_ALIASES: Record<string, string> = {
  'USA': 'United States of America',
  'US': 'United States of America',
  'United States': 'United States of America',
  'America': 'United States of America',
  'UK': 'United Kingdom',
  'Britain': 'United Kingdom',
  'England': 'United Kingdom',
  'UAE': 'United Arab Emirates',
  'Russia': 'Russian Federation',
  'Iran': 'Iran',
  'South Korea': 'South Korea',
  'North Korea': 'Dem. Rep. Korea',
  'DPRK': 'Dem. Rep. Korea',
  'DR Congo': 'Dem. Rep. Congo',
  'Congo': 'Congo',
  'Ivory Coast': "Côte d'Ivoire",
  'Czech Republic': 'Czechia',
  'Taiwan': 'Taiwan',
  'Palestine': 'Palestine',
  'Venezuela': 'Venezuela',
  'Bolivia': 'Bolivia',
  'Tanzania': 'Tanzania',
}

function normaliseCountry(raw: string): string {
  const trimmed = raw.trim()
  return COUNTRY_ALIASES[trimmed] ?? trimmed
}

// ─── Extract countries from cluster entities ──────────────────────────────────
function extractCountriesFromCluster(cluster: EventCluster): string[] {
  const found = new Set<string>()

  // From locations like "Tehran, Iran (relevance: conflict)" → "Iran"
  for (const loc of cluster.entities?.locations ?? []) {
    // Try "Country (relevance:…)" pattern
    const m1 = loc.match(/^([A-Z][^,(]+?)(?:\s*\(|\s*$)/)
    if (m1) found.add(normaliseCountry(m1[1].trim()))

    // Try "City, Country (relevance:…)" → take part after last comma
    const parts = loc.split(',')
    if (parts.length > 1) {
      const last = parts[parts.length - 1].split('(')[0].trim()
      if (last.length > 1) found.add(normaliseCountry(last))
    }
  }

  // From people like "Khamenei (Supreme Leader/Iran)" → "Iran"
  for (const person of cluster.entities?.people ?? []) {
    const m = person.match(/\/([A-Z][A-Za-z\s]+)\)/)
    if (m) found.add(normaliseCountry(m[1].trim()))
  }

  return [...found].filter(Boolean)
}

// ─── Volatility → fill colour ─────────────────────────────────────────────────
function activityColor(maxVol: number, count: number): string {
  if (count === 0) return '#13132b'
  if (maxVol >= 0.85) return 'rgba(220,38,38,0.55)'   // critical
  if (maxVol >= 0.70) return 'rgba(239,68,68,0.40)'   // high
  if (maxVol >= 0.55) return 'rgba(249,115,22,0.38)'  // elevated
  if (maxVol >= 0.40) return 'rgba(234,179,8,0.30)'   // moderate
  return 'rgba(0,212,255,0.20)'                        // low/calm
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CountryActivity {
  clusters:    EventCluster[]
  maxVol:      number
  count:       number
}

interface Props {
  onClusterSelect?: (id: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function WorldMapView({ onClusterSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [clusters,         setClusters]         = useState<EventCluster[]>([])
  const [selectedCountry,  setSelectedCountry]  = useState<string | null>(null)
  const [hoveredCountry,   setHoveredCountry]   = useState<string | null>(null)
  const [searchResult,     setSearchResult]     = useState<SearchResponse | null>(null)
  const [searching,        setSearching]        = useState(false)
  const [zoom,             setZoom]             = useState(1)
  const [center,           setCenter]           = useState<[number, number]>([0, 20])
  const [isDragging,       setIsDragging]       = useState(false)

  // Fetch clusters once on mount
  useEffect(() => {
    api.clusters.list({ limit: 200, activeOnly: true, minVolatility: 0 })
      .then(setClusters)
      .catch(() => {})
  }, [])

  // Mouse-wheel zoom — prevent page scroll, zoom into map
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => e.deltaY < 0
        ? Math.min(z * 1.25, 20)
        : Math.max(z / 1.25, 1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Build country → activity map
  const countryActivity = useMemo<Map<string, CountryActivity>>(() => {
    const map = new Map<string, CountryActivity>()
    for (const cluster of clusters) {
      const countries = extractCountriesFromCluster(cluster)
      for (const c of countries) {
        const existing = map.get(c) ?? { clusters: [], maxVol: 0, count: 0 }
        existing.clusters.push(cluster)
        existing.maxVol = Math.max(existing.maxVol, cluster.volatility)
        existing.count++
        map.set(c, existing)
      }
    }
    return map
  }, [clusters])

  // When country is selected, search for its news
  const handleCountryClick = useCallback(async (name: string) => {
    setSelectedCountry(name)
    setSearchResult(null)
    setSearching(true)
    try {
      const res = await api.search.query(name, 'keyword', 20)
      setSearchResult(res)
    } catch {
      setSearchResult(null)
    } finally {
      setSearching(false)
    }
  }, [])

  // Active country list for legend
  const topCountries = useMemo(() => {
    return [...countryActivity.entries()]
      .sort((a, b) => b[1].maxVol - a[1].maxVol)
      .slice(0, 8)
  }, [countryActivity])

  return (
    <div className="flex h-full w-full relative overflow-hidden" style={{ background: '#000000' }}>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{
          background: '#000000',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 140 }}
          width={960}
          height={500}
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Ocean background */}
          <rect x={0} y={0} width={960} height={500} fill="#000000" />

          <ZoomableGroup
            zoom={zoom}
            center={center}
            onMoveStart={() => setIsDragging(true)}
            onMoveEnd={({ zoom: z, coordinates }) => {
              setIsDragging(false)
              setZoom(z)
              setCenter(coordinates as [number, number])
            }}
          >
            {/* Graticule — lat/lng grid */}
            <Graticule stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const name     = geo.properties.name as string
                  const activity = countryActivity.get(name)
                  const isSelected = selectedCountry === name
                  const isHovered  = hoveredCountry  === name

                  const fill = isSelected
                    ? '#00d4ff'
                    : isHovered
                    ? '#1e3a5f'
                    : activity
                    ? activityColor(activity.maxVol, activity.count)
                    : '#111118'

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => handleCountryClick(name)}
                      onMouseEnter={() => setHoveredCountry(name)}
                      onMouseLeave={() => setHoveredCountry(null)}
                      style={{
                        default:  { fill, stroke: 'rgba(255,255,255,0.10)', strokeWidth: 0.3, outline: 'none' },
                        hover:    { fill: isSelected ? '#00d4ff' : '#1e3a5f', stroke: '#00d4ff66', strokeWidth: 0.6, outline: 'none', cursor: 'pointer' },
                        pressed:  { fill: '#00d4ff', outline: 'none' },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredCountry && !selectedCountry && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none"
            >
              <div className="bg-terminal-surface border border-terminal-border px-3 py-1.5 rounded-sm font-mono text-xs text-terminal-text flex items-center gap-2">
                <Globe size={10} className="text-terminal-accent" />
                {hoveredCountry}
                {countryActivity.get(hoveredCountry) && (
                  <span className="text-terminal-dim">
                    · {countryActivity.get(hoveredCountry)!.count} cluster{countryActivity.get(hoveredCountry)!.count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-1">
          {[
            { icon: Plus,        action: () => setZoom(z => Math.min(z * 1.5, 12)) },
            { icon: Minus,       action: () => setZoom(z => Math.max(z / 1.5, 1)) },
            { icon: RotateCcw,   action: () => { setZoom(1); setCenter([0, 20]) } },
          ].map(({ icon: Icon, action }, i) => (
            <button
              key={i}
              onClick={action}
              className="w-7 h-7 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-accent hover:border-terminal-accent/50 rounded-sm flex items-center justify-center transition-colors"
            >
              <Icon size={11} />
            </button>
          ))}
        </div>

        {/* Activity legend */}
        {topCountries.length > 0 && (
          <div className="absolute top-4 left-4 bg-terminal-surface/90 border border-terminal-border rounded-sm p-3 min-w-[180px]">
            <div className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2 uppercase">
              Active Regions
            </div>
            {topCountries.map(([country, act]) => (
              <button
                key={country}
                onClick={() => handleCountryClick(country)}
                className="flex items-center gap-2 w-full py-0.5 hover:text-terminal-accent transition-colors group"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: activityColor(act.maxVol, act.count) }}
                />
                <span className="font-mono text-[10px] text-terminal-text group-hover:text-terminal-accent truncate">
                  {country}
                </span>
                <span className="font-mono text-[9px] text-terminal-dim ml-auto">
                  {act.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Instructions */}
        {!selectedCountry && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="font-mono text-[10px] text-terminal-dim/60">
              Click any country to view intelligence · Scroll to zoom
            </span>
          </div>
        )}
      </div>

      {/* ── Side panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedCountry && (
          <motion.div
            key={selectedCountry}
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0,   opacity: 1 }}
            exit={{   x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0">
              <div className="flex items-center gap-2">
                <Globe size={13} className="text-terminal-accent" />
                <span className="font-mono font-bold text-sm text-terminal-text tracking-wide">
                  {selectedCountry}
                </span>
                {countryActivity.get(selectedCountry) && (
                  <span className="text-[9px] font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm">
                    {countryActivity.get(selectedCountry)!.count} CLUSTER{countryActivity.get(selectedCountry)!.count !== 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedCountry(null)}
                className="text-terminal-dim hover:text-terminal-text transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {searching ? (
                <div className="flex items-center justify-center h-32 gap-2 text-terminal-dim font-mono text-xs">
                  <Loader2 size={14} className="animate-spin text-terminal-accent" />
                  Scanning intelligence...
                </div>
              ) : !searchResult || searchResult.total === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-terminal-dim/60 font-mono text-xs">
                  <Globe size={24} className="text-terminal-dim/30" />
                  No current intelligence for {selectedCountry}
                </div>
              ) : (
                <div>
                  {/* Cluster hits */}
                  {searchResult.cluster_hits.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border bg-terminal-surface/50 uppercase">
                        Event Clusters ({searchResult.cluster_hits.length})
                      </div>
                      {searchResult.cluster_hits.map(hit => (
                        <MapClusterRow
                          key={hit.cluster_id}
                          hit={hit}
                          onSelect={() => onClusterSelect?.(hit.cluster_id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Article hits */}
                  {searchResult.article_hits.length > 0 && (
                    <div>
                      <div className="px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border bg-terminal-surface/50 uppercase">
                        Recent Articles ({searchResult.article_hits.length})
                      </div>
                      {searchResult.article_hits.map(hit => (
                        <MapArticleRow key={hit.article_id} hit={hit} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel footer */}
            {searchResult && searchResult.total > 0 && (
              <div className="px-4 py-2 border-t border-terminal-border flex-shrink-0 bg-terminal-surface/30">
                <span className="text-[9px] font-mono text-terminal-dim">
                  {searchResult.total} results · keyword match
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Cluster row ──────────────────────────────────────────────────────────────
function MapClusterRow({ hit, onSelect }: { hit: ClusterHit; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3 border-b border-terminal-border/40 hover:bg-terminal-muted/30 transition-colors text-left group"
    >
      <div className="flex-shrink-0 mt-0.5">
        <VolatilityBadge volatility={hit.volatility} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-relaxed">
          {hit.label ?? 'Unnamed cluster'}
        </p>
        {hit.bullets?.[0] && (
          <p className="font-mono text-[10px] text-terminal-dim mt-1 line-clamp-1">
            {hit.bullets[0]}
          </p>
        )}
      </div>
      <ChevronRight size={11} className="flex-shrink-0 mt-0.5 text-terminal-dim group-hover:text-terminal-accent transition-colors" />
    </button>
  )
}

// ─── Article row ──────────────────────────────────────────────────────────────
function MapArticleRow({ hit }: { hit: ArticleHit }) {
  const inner = (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <CredibilityDot score={hit.credibility_score} sourceId={hit.source_id} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-terminal-text line-clamp-2 leading-relaxed">
          {hit.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-terminal-dim font-mono">
            {getSourceLabel(hit.source_id)}
          </span>
          <span className="text-[9px] text-terminal-dim font-mono ml-auto">
            {hit.published_at ? timeAgo(hit.published_at) : ''}
          </span>
        </div>
      </div>
    </div>
  )
  return hit.url
    ? <a href={hit.url} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <div>{inner}</div>
}
