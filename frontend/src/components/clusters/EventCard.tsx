import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { EventCluster } from '@/types'
import {
  getVolatilityTier,
  VOLATILITY_BG,
  VOLATILITY_COLORS,
} from '@/types'
import { cn, formatSentiment as fmtSent, timeAgo, formatTime } from '@/lib/utils'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { EntityPills } from '@/components/ui/EntityPills'

// Re-export since formatSentiment is in both places
function fmt(s: number) {
  const sign = s >= 0 ? '+' : ''
  return `${sign}${s.toFixed(2)}`
}

interface Props {
  cluster:    EventCluster
  isNew?:     boolean
  isUpdated?: boolean
  onSelect?:  (id: string) => void
}

export function EventCard({ cluster, isNew, isUpdated, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false)

  const tier   = getVolatilityTier(cluster.volatility)
  const color  = VOLATILITY_COLORS[tier]
  const bg     = VOLATILITY_BG[tier]

  const sentColor =
    cluster.sentiment > 0.2 ? '#10b981' :
    cluster.sentiment < -0.2 ? '#f87171' :
    '#6b7280'

  const hasBullets = cluster.bullets && cluster.bullets.length > 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect?.(cluster.id)}
      className={cn(
        'relative rounded-sm border transition-all duration-300 overflow-hidden',
        'bg-terminal-surface hover:bg-terminal-muted/30',
        isNew && 'animate-pulse-glow',
        onSelect && 'cursor-pointer',
      )}
      style={{
        borderColor: isNew || isUpdated ? `${color}60` : '#1a1a2e',
        borderLeftWidth: '3px',
        borderLeftColor: color,
      }}
    >
      {/* NEW / UPDATED flash banner */}
      {(isNew || isUpdated) && (
        <div
          className="absolute top-0 right-0 text-[9px] font-mono font-bold px-2 py-0.5 tracking-widest"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {isNew ? '● NEW' : '↑ UPD'}
        </div>
      )}

      {/* Card Header */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Title */}
            <h3 className="font-mono text-sm font-semibold text-terminal-text leading-snug truncate">
              {cluster.label ?? (
                <span className="text-terminal-dim italic">Analyzing cluster…</span>
              )}
            </h3>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <VolatilityBadge volatility={cluster.volatility} size="sm" />

              <span
                className="text-[10px] font-mono font-semibold"
                style={{ color: sentColor }}
              >
                SENT {fmt(cluster.sentiment)}
              </span>

              <span className="text-[10px] text-terminal-dim font-mono">
                {cluster.member_count} src · w={cluster.weighted_score.toFixed(1)}
              </span>

              <span className="text-[10px] text-terminal-dim font-mono ml-auto">
                {timeAgo(cluster.last_updated_at)}
              </span>
            </div>
          </div>

          {/* Volatility bar — right side */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 w-16">
            <div className="w-full h-1.5 bg-terminal-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round(cluster.volatility * 100)}%`,
                  backgroundColor: color,
                  boxShadow: cluster.volatility >= 0.4 ? `0 0 8px ${color}60` : 'none',
                }}
              />
            </div>
            <span
              className="text-[9px] font-mono font-bold tracking-widest"
              style={{ color }}
            >
              {Math.round(cluster.volatility * 100)}%
            </span>
          </div>
        </div>

        {/* Bullets — always visible if present */}
        {hasBullets && (
          <ul className="mt-2 space-y-1">
            {cluster.bullets!.map((bullet, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[11px] text-terminal-text font-mono leading-relaxed"
              >
                <span className="flex-shrink-0 mt-0.5" style={{ color }}>
                  {i === 0 ? '►' : '·'}
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Entities */}
        {cluster.entities && (
          <div className="mt-2">
            <EntityPills entities={cluster.entities} max={2} />
          </div>
        )}
      </div>

      {/* Expand toggle */}
      {cluster.entities && (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-terminal-dim hover:text-terminal-text transition-colors border-t border-terminal-border font-mono"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? 'LESS' : 'DETAILS'}
        </button>
      )}

      {/* Expanded: full entities + timestamps */}
      <AnimatePresence>
        {expanded && cluster.entities && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-terminal-border">
              <div className="pt-2">
                <EntityPills entities={cluster.entities} max={8} />
              </div>
              <div className="flex gap-4 text-[10px] text-terminal-dim font-mono">
                <span>FIRST: {formatTime(cluster.first_seen_at)}</span>
                <span>LAST:  {formatTime(cluster.last_updated_at)}</span>
                <span>ID: {cluster.id.slice(0, 8)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
