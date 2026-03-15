import { useState, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Filter, Zap } from 'lucide-react'
import { useClusters } from '@/hooks/useClusters'
import { EventCard } from './EventCard'
import {
  type ClusterCategory,
  CATEGORY_LABELS,
  categorizeCluster,
} from '@/types'
import { cn } from '@/lib/utils'

const FILTER_OPTIONS = [
  { label: 'ALL',  value: 0 },
  { label: 'MOD+', value: 0.4 },
  { label: 'HIGH', value: 0.7 },
  { label: 'CRIT', value: 0.85 },
]

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClusterCategory[]

const CATEGORY_COLORS: Record<ClusterCategory, string> = {
  ALL:         '#00d4aa',
  CONFLICT:    '#ef4444',
  GEOPOLITICS: '#f97316',
  POLITICS:    '#a855f7',
  FINANCE:     '#22c55e',
  CRYPTO:      '#f59e0b',
  BUSINESS:    '#84cc16',
  TECHNOLOGY:  '#3b82f6',
  CRIME:       '#ec4899',
  HEALTH:      '#06b6d4',
  CLIMATE:     '#10b981',
}

interface Props {
  onClusterSelect?: (id: string) => void
}

export function ClusterFeed({ onClusterSelect }: Props) {
  const { clusters, loading, error } = useClusters()
  const [minVolt, setMinVolt]       = useState(0)
  const [category, setCategory]     = useState<ClusterCategory>('ALL')
  const tabsRef                     = useRef<HTMLDivElement>(null)

  const byVolatility = clusters.filter(c => c.volatility >= minVolt)
  const inCategory = category === 'ALL'
    ? byVolatility
    : byVolatility.filter(c => categorizeCluster(c) === category)
  // ALL: keep recency order; category tabs: sort by importance (volatility × score)
  const filtered = category === 'ALL'
    ? inCategory
    : [...inCategory].sort((a, b) => (b.volatility * b.weighted_score) - (a.volatility * a.weighted_score))

  const breakingCount = clusters.filter(c => c.volatility >= 0.7).length

  const counts = CATEGORIES.reduce<Record<ClusterCategory, number>>((acc, cat) => {
    acc[cat] = cat === 'ALL'
      ? byVolatility.length
      : byVolatility.filter(c => categorizeCluster(c) === cat).length
    return acc
  }, {} as Record<ClusterCategory, number>)

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-terminal-accent" />
          <span className="text-[11px] font-mono font-semibold text-terminal-accent tracking-widest uppercase">
            Event Clusters
          </span>
          <span className="text-[10px] font-mono bg-terminal-muted px-1.5 py-0.5 rounded text-terminal-dim">
            {filtered.length}
          </span>
          {breakingCount > 0 && (
            <span className="text-[10px] font-mono bg-red-900/40 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded animate-blink">
              {breakingCount} BREAKING
            </span>
          )}
        </div>

        {/* Volatility filter */}
        <div className="flex items-center gap-0.5">
          <Filter size={9} className="text-terminal-dim mr-1" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMinVolt(opt.value)}
              className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded-sm transition-colors',
                minVolt === opt.value
                  ? 'bg-terminal-accent/20 text-terminal-accent border border-terminal-accent/40'
                  : 'text-terminal-dim hover:text-terminal-text border border-transparent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category tabs */}
      <div
        ref={tabsRef}
        className="flex items-center gap-0.5 px-2 py-1.5 border-b border-terminal-border overflow-x-auto scrollbar-none flex-shrink-0"
      >
        {CATEGORIES.map(cat => {
          const active = category === cat
          const color  = CATEGORY_COLORS[cat]
          const count  = counts[cat]
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-sm whitespace-nowrap transition-all',
                active
                  ? 'border'
                  : 'text-terminal-dim hover:text-terminal-text border border-transparent',
              )}
              style={active ? {
                backgroundColor: `${color}18`,
                borderColor:     `${color}55`,
                color,
              } : undefined}
            >
              {CATEGORY_LABELS[cat].toUpperCase()}
              {count > 0 && (
                <span
                  className="rounded-sm"
                  style={{ color: active ? color : undefined, opacity: active ? 0.8 : 0.5 }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-2">
        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-sm bg-terminal-surface animate-pulse"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-400 font-mono text-xs">
            ⚠ API error: {error}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-terminal-dim font-mono text-xs">
            <div className="text-2xl mb-2 opacity-30">◌</div>
            Monitoring sources — no clusters yet
          </div>
        )}

        <AnimatePresence initial={false}>
          {filtered.map(cluster => (
            <EventCard
              key={cluster.id}
              cluster={cluster}
              isNew={cluster.isNew}
              isUpdated={cluster.isUpdated}
              onSelect={onClusterSelect}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
