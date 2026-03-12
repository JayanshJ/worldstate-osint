import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Database, Layers, TrendingUp } from 'lucide-react'
import { api, type SystemStats } from '@/lib/api'
import { VOLATILITY_COLORS, getVolatilityTier } from '@/types'
import { cn } from '@/lib/utils'
import { getSourceLabel } from '@/types'

const POLL_INTERVAL_MS = 30_000

export function StatsBar() {
  const [stats, setStats] = useState<SystemStats | null>(null)

  useEffect(() => {
    const fetch = () => api.stats.get().then(setStats).catch(() => {})
    fetch()
    const id = setInterval(fetch, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  if (!stats) return null

  const { articles, clusters } = stats

  const clusterTierData = [
    { label: 'CRIT', count: clusters.critical, volt: 0.9 },
    { label: 'HIGH', count: clusters.high,     volt: 0.75 },
    { label: 'ELEV', count: clusters.elevated, volt: 0.62 },
    { label: 'MOD',  count: clusters.moderate, volt: 0.47 },
    { label: 'CALM', count: clusters.calm,     volt: 0.1 },
  ]

  return (
    <div className="flex-shrink-0 h-8 bg-terminal-bg flex items-center px-3 gap-4 overflow-x-auto">
      {/* Articles/min */}
      <StatChip
        icon={<Activity size={9} />}
        label="ART/MIN"
        value={articles.per_minute.toFixed(1)}
        color="#00d4ff"
      />

      <div className="h-4 w-px bg-terminal-border flex-shrink-0" />

      {/* Articles 1h / 24h */}
      <StatChip label="1H"  value={String(articles.last_1h)}  color="#5a6380" />
      <StatChip label="24H" value={String(articles.last_24h)} color="#5a6380" />

      <div className="h-4 w-px bg-terminal-border flex-shrink-0" />

      {/* Queue depth */}
      <StatChip
        icon={<Database size={9} />}
        label="Q"
        value={String(articles.queue_depth)}
        color={articles.queue_depth > 50 ? '#f97316' : '#5a6380'}
      />

      <div className="h-4 w-px bg-terminal-border flex-shrink-0" />

      {/* Cluster tier breakdown */}
      <div className="flex items-center gap-2">
        <Layers size={9} className="text-terminal-dim flex-shrink-0" />
        {clusterTierData.map(({ label, count, volt }) => {
          if (count === 0) return null
          const color = VOLATILITY_COLORS[getVolatilityTier(volt)]
          return (
            <span
              key={label}
              className="text-[9px] font-mono font-bold flex-shrink-0"
              style={{ color }}
            >
              {count} {label}
            </span>
          )
        })}
        <span className="text-[9px] font-mono text-terminal-dim flex-shrink-0">
          ({clusters.total} total)
        </span>
      </div>

      <div className="h-4 w-px bg-terminal-border flex-shrink-0" />

      {/* Top sources */}
      <div className="flex items-center gap-2 overflow-hidden">
        <TrendingUp size={9} className="text-terminal-dim flex-shrink-0" />
        {stats.source_health.slice(0, 5).map(s => (
          <span key={s.source_id} className="text-[9px] font-mono text-terminal-dim flex-shrink-0 whitespace-nowrap">
            <span className="text-terminal-text">{getSourceLabel(s.source_id)}</span>
            <span className="text-terminal-dim"> {s.count_1h}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function StatChip({
  icon, label, value, color,
}: {
  icon?:  React.ReactNode
  label:  string
  value:  string
  color?: string
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {icon && <span className="text-terminal-dim">{icon}</span>}
      <span className="text-[9px] font-mono tracking-wider text-terminal-dim">{label}</span>
      <span className="text-[10px] font-mono font-semibold" style={{ color: color ?? '#c8d3e8' }}>
        {value}
      </span>
    </div>
  )
}
