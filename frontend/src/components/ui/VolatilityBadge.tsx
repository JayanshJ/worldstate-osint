import {
  getVolatilityTier,
  VOLATILITY_BG,
  VOLATILITY_COLORS,
  VOLATILITY_LABELS,
} from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  volatility: number
  showBar?:   boolean
  size?:      'sm' | 'md' | 'lg'
  className?: string
}

export function VolatilityBadge({ volatility, showBar = false, size = 'md', className }: Props) {
  const tier  = getVolatilityTier(volatility)
  const color = VOLATILITY_COLORS[tier]
  const bg    = VOLATILITY_BG[tier]
  const label = VOLATILITY_LABELS[tier]

  const sizeClasses = {
    sm: 'text-[9px] px-1 py-0.5 gap-1',
    md: 'text-[10px] px-1.5 py-0.5 gap-1.5',
    lg: 'text-xs px-2 py-1 gap-2',
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Badge */}
      <span
        className={cn(
          'inline-flex items-center font-mono font-bold tracking-widest rounded-sm border',
          sizeClasses[size],
        )}
        style={{
          color,
          backgroundColor: bg,
          borderColor: `${color}33`,
        }}
      >
        {/* Blinking dot for elevated+ */}
        {volatility >= 0.55 && (
          <span
            className="w-1.5 h-1.5 rounded-full animate-blink flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        {label}
      </span>

      {/* Optional bar */}
      {showBar && (
        <div className="flex-1 h-1 bg-terminal-muted rounded-full overflow-hidden min-w-[48px]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.round(volatility * 100)}%`,
              backgroundColor: color,
              boxShadow: volatility >= 0.4 ? `0 0 6px ${color}80` : 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
