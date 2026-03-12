import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, X, Clock, Users, TrendingUp, ChevronRight } from 'lucide-react'
import { api, type ClusterMemberDetail } from '@/lib/api'
import type { EventCluster } from '@/types'
import { getVolatilityTier, VOLATILITY_COLORS, getSourceLabel } from '@/types'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { EntityPills } from '@/components/ui/EntityPills'
import { CredibilityDot } from '@/components/ui/CredibilityDot'
import { cn, timeAgo, formatTime } from '@/lib/utils'

interface Props {
  clusterId: string
  onClose:   () => void
}

export function ClusterDetailModal({ clusterId, onClose }: Props) {
  const [cluster, setCluster] = useState<(EventCluster & { members: ClusterMemberDetail[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.clusters.get(clusterId).then(data => {
      setCluster(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [clusterId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const tier  = cluster ? getVolatilityTier(cluster.volatility) : 'calm'
  const color = cluster ? VOLATILITY_COLORS[tier] : '#5a6380'

  // Sort members by credibility desc, then by distance asc
  const sortedMembers = cluster?.members
    ? [...cluster.members].sort((a, b) => {
        if (b.credibility_score !== a.credibility_score)
          return b.credibility_score - a.credibility_score
        return (a.distance ?? 1) - (b.distance ?? 1)
      })
    : []

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-3xl bg-terminal-surface border rounded-sm shadow-2xl flex flex-col"
        style={{
          borderColor: `${color}40`,
          borderLeftWidth: '3px',
          borderLeftColor: color,
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-terminal-border flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            {loading ? (
              <div className="h-5 w-64 bg-terminal-muted animate-pulse rounded-sm" />
            ) : (
              <h2 className="font-mono text-base font-bold text-terminal-text leading-snug">
                {cluster?.label ?? 'Cluster Detail'}
              </h2>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {cluster && (
                <>
                  <VolatilityBadge volatility={cluster.volatility} showBar size="md" />
                  <span className="text-[10px] font-mono text-terminal-dim">
                    {cluster.member_count} sources · weight {cluster.weighted_score.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-mono text-terminal-dim">
                    First seen {timeAgo(cluster.first_seen_at)}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1.5 text-terminal-dim hover:text-terminal-text transition-colors rounded-sm hover:bg-terminal-muted"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading && (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-terminal-muted animate-pulse rounded-sm" />
              ))}
            </div>
          )}

          {cluster && (
            <div className="flex flex-col divide-y divide-terminal-border">
              {/* Intelligence Brief */}
              {cluster.bullets && cluster.bullets.length > 0 && (
                <section className="px-5 py-4">
                  <h3 className="text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3">
                    Intelligence Brief
                  </h3>
                  <ul className="space-y-2">
                    {cluster.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className="flex-shrink-0 mt-0.5 font-mono text-xs font-bold"
                          style={{ color }}
                        >
                          {i === 0 ? '►' : '·'}
                        </span>
                        <span className="font-mono text-[12px] text-terminal-text leading-relaxed">
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Key Entities */}
              {cluster.entities && (
                <section className="px-5 py-4">
                  <h3 className="text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3">
                    Key Entities
                  </h3>
                  <EntityPills entities={cluster.entities} max={10} />
                </section>
              )}

              {/* Source Timeline */}
              <section className="px-5 py-4">
                <h3 className="text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3">
                  Source Timeline ({sortedMembers.length})
                </h3>

                <div className="relative">
                  {/* Timeline line */}
                  <div
                    className="absolute left-2.5 top-0 bottom-0 w-px"
                    style={{ backgroundColor: `${color}30` }}
                  />

                  <div className="space-y-2">
                    {sortedMembers.map((member, idx) => (
                      <SourceTimelineEntry
                        key={member.article_id}
                        member={member}
                        isFirst={idx === 0}
                        color={color}
                      />
                    ))}
                  </div>
                </div>
              </section>

              {/* Metadata footer */}
              <section className="px-5 py-3 bg-terminal-bg/50">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {[
                    ['Cluster ID',  cluster.id.slice(0, 16) + '…'],
                    ['First Seen',  formatTime(cluster.first_seen_at)],
                    ['Last Update', formatTime(cluster.last_updated_at)],
                    ['Sentiment',   (cluster.sentiment >= 0 ? '+' : '') + cluster.sentiment.toFixed(3)],
                    ['Status',      cluster.is_active ? 'ACTIVE' : 'EXPIRED'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[10px] font-mono">
                      <span className="text-terminal-dim">{k}:</span>
                      <span className="text-terminal-text">{v}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function SourceTimelineEntry({
  member, isFirst, color,
}: {
  member:  ClusterMemberDetail
  isFirst: boolean
  color:   string
}) {
  return (
    <div className="flex items-start gap-3 pl-1">
      {/* Timeline dot */}
      <div
        className={cn(
          'w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 z-10',
          'border',
        )}
        style={{
          backgroundColor: isFirst ? `${color}30` : 'transparent',
          borderColor:      isFirst ? color : '#2a2a3e',
        }}
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: isFirst ? color : '#2a2a3e' }}
        />
      </div>

      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9px] font-mono font-bold" style={{ color: isFirst ? color : '#5a6380' }}>
            {getSourceLabel(member.source_id)}
          </span>
          <CredibilityDot score={member.credibility_score} sourceId={member.source_id} />
          {member.distance !== null && (
            <span className="text-[9px] font-mono text-terminal-dim ml-auto">
              dist {member.distance.toFixed(3)}
            </span>
          )}
          <span className="text-[9px] font-mono text-terminal-dim">
            {timeAgo(member.published_at)}
          </span>
        </div>

        {member.url ? (
          <a
            href={member.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1 group"
          >
            <span className="font-mono text-[11px] text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-snug">
              {member.title}
            </span>
            <ExternalLink size={9} className="flex-shrink-0 mt-0.5 text-terminal-dim group-hover:text-terminal-accent" />
          </a>
        ) : (
          <p className="font-mono text-[11px] text-terminal-text line-clamp-2 leading-snug">
            {member.title}
          </p>
        )}
      </div>
    </div>
  )
}
