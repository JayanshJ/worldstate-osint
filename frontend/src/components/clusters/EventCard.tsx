import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { EventCluster } from '@/types'
import {
  getVolatilityTier,
  VOLATILITY_BG,
  VOLATILITY_COLORS,
} from '@/types'
import { cn, formatSentiment as fmtSent, formatAbsTime, formatDateTime } from '@/lib/utils'
import { useTimezone } from '@/context/TimezoneContext'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { EntityPills } from '@/components/ui/EntityPills'
import { api, type ClusterMemberDetail } from '@/lib/api'

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
  const [expanded, setExpanded]   = useState(false)
  const [members, setMembers]     = useState<ClusterMemberDetail[] | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const { timezone } = useTimezone()

  // Lazy-load article members when the card is expanded
  useEffect(() => {
    if (!expanded || members !== null) return
    setMembersLoading(true)
    api.clusters.get(cluster.id)
      .then(data => {
        setMembers(
          [...data.members].sort((a, b) =>
            (b.credibility_score ?? 0) - (a.credibility_score ?? 0)
          )
        )
        setMembersLoading(false)
      })
      .catch(() => setMembersLoading(false))
  }, [expanded, cluster.id, members])

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
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={() => onSelect?.(cluster.id)}
      className={cn(
        'relative border transition-all duration-200 overflow-hidden',
        'bg-terminal-surface hover:bg-terminal-muted/40',
        isNew && 'shimmer-in',
        onSelect && 'cursor-pointer',
      )}
      style={{
        borderColor: isNew || isUpdated ? `${color}50` : 'rgb(var(--t-border))',
        borderLeftWidth: '3px',
        borderLeftColor: color,
      }}
    >
      {/* NEW / UPDATED flash tag */}
      {(isNew || isUpdated) && (
        <div
          className="absolute top-0 right-0 text-[8px] font-mono px-2 py-0.5 tracking-[0.15em]"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {isNew ? '● NEW' : '↑ UPD'}
        </div>
      )}

      {/* Card body */}
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">

            {/* Vol badge + meta row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <VolatilityBadge volatility={cluster.volatility} size="sm" />
              <span className="font-mono text-[9.5px] text-terminal-dim tracking-[0.05em]">
                {cluster.member_count} src · w={cluster.weighted_score.toFixed(1)}
              </span>
              <span className="font-mono text-[9.5px] text-terminal-dim ml-auto">
                {formatAbsTime(cluster.last_updated_at, timezone)}
              </span>
            </div>

            {/* Title — Instrument Serif */}
            <h3 className="font-serif text-[18px] leading-[1.18] tracking-[-0.005em] text-terminal-text mb-2">
              {cluster.label ?? (
                <span className="text-terminal-dim italic font-serif">Analyzing cluster…</span>
              )}
            </h3>

          </div>

          {/* Sentiment + vol bar */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 w-14 pt-0.5">
            <div className="w-full h-[2px] bg-terminal-muted/60 overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${Math.round(cluster.volatility * 100)}%`,
                  backgroundColor: color,
                  boxShadow: cluster.volatility >= 0.55 ? `0 0 6px ${color}70` : 'none',
                }}
              />
            </div>
            <span className="font-mono text-[9px] tracking-[0.12em]" style={{ color }}>
              SENT {fmt(cluster.sentiment)}
            </span>
          </div>
        </div>

        {/* Bullets — design style: dash marker */}
        {hasBullets && (
          <ul className="space-y-1.5 mt-1 mb-2">
            {cluster.bullets!.map((bullet, i) => (
              <li key={i} className="relative pl-4 text-[12px] text-terminal-dim leading-[1.5]">
                <span
                  className="absolute left-0 top-[9px] w-[8px] h-[1px]"
                  style={{ backgroundColor: color }}
                />
                {bullet}
              </li>
            ))}
          </ul>
        )}

        {/* Entity pills */}
        {cluster.entities && (
          <div className="mt-1.5">
            <EntityPills entities={cluster.entities} max={2} />
          </div>
        )}
      </div>

      {/* Expand toggle — always available to load source articles */}
      <button
        onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-terminal-dim hover:text-terminal-text transition-colors border-t border-terminal-border font-mono"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {expanded ? 'HIDE' : `SOURCES (${cluster.member_count})`}
      </button>

      {/* Expanded: source articles + entities */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-terminal-border">
              {/* Source articles */}
              {membersLoading && (
                <div className="pt-2 space-y-1.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-terminal-muted/40 rounded-sm animate-pulse" />
                  ))}
                </div>
              )}
              {members && members.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  {members.map(m => (
                    <a
                      key={m.article_id}
                      href={m.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="block px-2 py-1.5 bg-terminal-bg border border-terminal-border hover:border-terminal-accent/40 rounded-sm transition-colors group"
                    >
                      <div className="font-mono text-[10px] text-terminal-text group-hover:text-terminal-accent transition-colors leading-snug">
                        {m.title}
                      </div>
                      <div className="flex items-center justify-between mt-0.5 text-[8px] font-mono text-terminal-dim/50">
                        <span>{(m.source_id ?? '').toUpperCase().replace(/_/g, ' ')}</span>
                        {m.published_at && <span>{new Date(m.published_at).toLocaleDateString()}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              )}
              {/* Entity pills */}
              {cluster.entities && (
                <div className="pt-1">
                  <EntityPills entities={cluster.entities} max={8} />
                </div>
              )}
              <div className="flex gap-4 text-[9px] text-terminal-dim/40 font-mono pt-1">
                <span>FIRST: {formatDateTime(cluster.first_seen_at, timezone)}</span>
                <span>LAST: {formatDateTime(cluster.last_updated_at, timezone)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
