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
      {/* Panel header — § eyebrow + serif headline */}
      <div className="px-4 py-3 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-terminal-dim mb-0.5">
              § 01 · Active clusters
              {breakingCount > 0 && (
                <span className="ml-2 text-[#d64747] animate-blink">{breakingCount} BREAKING</span>
              )}
            </p>
            <h2 className="font-serif text-[20px] leading-none tracking-[-0.01em] text-terminal-text">
              Stories, <em className="italic text-terminal-accent">clustered.</em>
            </h2>
          </div>

          {/* Volatility filter */}
          <div className="flex items-center gap-0.5 flex-shrink-0 pb-0.5">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMinVolt(opt.value)}
                className={cn(
                  'text-[9px] font-mono px-2 py-1 tracking-[0.1em] transition-colors border',
                  minVolt === opt.value
                    ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/40'
                    : 'text-terminal-dim hover:text-terminal-text border-terminal-border',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
