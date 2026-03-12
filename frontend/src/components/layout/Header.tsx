import { useEffect, useState } from 'react'
import { Activity, Bell, Globe, Search, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { useWebSocket } from '@/context/WebSocketContext'
import type { ConnectionStatus } from '@/types'
import { cn, formatUtcClock } from '@/lib/utils'

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const configs: Record<ConnectionStatus, { icon: typeof Wifi; color: string; label: string }> = {
    connected:    { icon: Wifi,          color: '#22c55e', label: 'LIVE' },
    connecting:   { icon: Activity,      color: '#eab308', label: 'SYNC' },
    disconnected: { icon: WifiOff,       color: '#6b7280', label: 'DISC' },
    error:        { icon: AlertTriangle, color: '#ef4444', label: 'ERR' },
  }
  const cfg  = configs[status]
  const Icon = cfg.icon
  return (
    <div
      className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest px-2 py-1 rounded-sm border"
      style={{ color: cfg.color, borderColor: `${cfg.color}44`, backgroundColor: `${cfg.color}11` }}
    >
      <Icon size={10} className={status === 'connected' ? 'animate-pulse' : ''} />
      {cfg.label}
    </div>
  )
}

function StatChip({ label, value, color = '#5a6380' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-baseline gap-1 text-[10px] font-mono">
      <span style={{ color }} className="tracking-wider">{label}</span>
      <span className="text-terminal-text font-semibold">{value}</span>
    </div>
  )
}

function MetalChip({ label, price, change, color }: { label: string; price: string; change: number | null; color: string }) {
  const isUp = change !== null && change >= 0
  const changeColor = change === null ? '#5a6380' : isUp ? '#22c55e' : '#ef4444'
  const changeStr = change === null ? '' : `${isUp ? '+' : ''}${change.toFixed(2)}%`
  return (
    <div className="flex items-baseline gap-1 text-[10px] font-mono">
      <span style={{ color }} className="tracking-wider">{label}</span>
      <span className="text-terminal-text font-semibold">{price}</span>
      {changeStr && <span style={{ color: changeColor }} className="text-[9px]">{changeStr}</span>}
    </div>
  )
}

interface MetalPrice { price: string; change: number | null }

async function fetchMetals(): Promise<{ gold: MetalPrice; silver: MetalPrice }> {
  const res = await fetch('/api/v1/metals')
  if (!res.ok) return { gold: { price: '---', change: null }, silver: { price: '---', change: null } }
  return res.json()
}

interface Props {
  onSearchOpen: () => void
  onAlertsOpen: () => void
  alertCount:   number
}

export function Header({ onSearchOpen, onAlertsOpen, alertCount }: Props) {
  const { status } = useWebSocket()
  const [clock, setClock] = useState(formatUtcClock())
  const [gold,  setGold]  = useState<MetalPrice>({ price: '···', change: null })
  const [silver, setSilver] = useState<MetalPrice>({ price: '···', change: null })

  useEffect(() => {
    const id = setInterval(() => setClock(formatUtcClock()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const load = async () => {
      const { gold: g, silver: s } = await fetchMetals()
      setGold(g)
      setSilver(s)
    }
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="flex-shrink-0 h-12 bg-terminal-surface border-b border-terminal-border flex items-center px-4 gap-4">
      {/* Branding */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Globe size={14} className="text-terminal-accent" />
        <span className="font-mono font-bold text-sm text-terminal-accent tracking-[0.15em]">
          WORLD<span className="text-terminal-text">STATE</span>
        </span>
        <span className="text-[9px] text-terminal-dim font-mono tracking-widest border border-terminal-muted px-1 py-0.5 rounded">
          OSINT v1
        </span>
      </div>

      <div className="h-6 w-px bg-terminal-border" />

      {/* Stats */}
      <div className="flex items-center gap-4 flex-1 overflow-hidden">
        <StatChip label="UTC" value={clock} />
        <div className="h-4 w-px bg-terminal-border" />
        <MetalChip label="XAU" price={gold.price}   change={gold.change}   color="#f5c842" />
        <MetalChip label="XAG" price={silver.price} change={silver.change} color="#a8b8c8" />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search */}
        <button
          onClick={onSearchOpen}
          className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 text-terminal-dim hover:text-terminal-text border border-terminal-border hover:border-terminal-accent/40 rounded-sm transition-colors group"
          title="Search (Ctrl+K)"
        >
          <Search size={11} className="group-hover:text-terminal-accent transition-colors" />
          <span className="hidden sm:inline">SEARCH</span>
          <kbd className="text-[8px] text-terminal-dim/60 border border-terminal-dim/30 px-1 rounded hidden sm:inline">⌘K</kbd>
        </button>

        {/* Alerts */}
        <button
          onClick={onAlertsOpen}
          className={cn(
            'relative flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 border rounded-sm transition-colors',
            alertCount > 0
              ? 'text-red-400 border-red-500/40 hover:bg-red-500/10'
              : 'text-terminal-dim hover:text-terminal-text border-terminal-border hover:border-terminal-accent/40',
          )}
          title="Alert Watches"
        >
          <Bell size={11} className={alertCount > 0 ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">ALERTS</span>
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>

        <ConnectionIndicator status={status} />
      </div>
    </header>
  )
}
