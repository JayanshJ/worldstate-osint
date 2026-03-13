import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, GitBranch, Globe, LayoutDashboard, Zap } from 'lucide-react'
import { Header } from './Header'
import { StatsBar } from './StatsBar'
import { Ticker } from '@/components/ticker/Ticker'
import { ClusterFeed } from '@/components/clusters/ClusterFeed'
import { LiveFeed } from '@/components/feed/LiveFeed'
import { SearchPanel } from '@/components/search/SearchPanel'
import { ClusterDetailModal } from '@/components/clusters/ClusterDetailModal'
import { AlertPanel } from '@/components/alerts/AlertPanel'
import { WorldMapView } from '@/components/map/WorldMapView'
import { StrategyFeed } from '@/components/strategies/StrategyFeed'
import { SupplyChainView } from '@/components/supply-chain/SupplyChainView'
import { CompanyProfileView } from '@/components/company/CompanyProfileView'
import { useAlerts } from '@/hooks/useAlerts'
import { cn } from '@/lib/utils'

type ViewMode = 'dashboard' | 'map' | 'alpha' | 'splc' | 'corp'

/**
 * WarRoom — full Bloomberg-style layout:
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  HEADER  (brand, UTC clock, search, alerts, WS status)   │
 * ├──────────────────────────────────────────────────────────┤
 * │  STATS BAR  (articles/min, cluster tiers, source health) │
 * ├──────────────────────┬───────────────────────────────────┤
 * │                      │                                    │
 * │  CLUSTER FEED (65%)  │  LIVE RAW FEED (35%)               │
 * │                      │                                    │
 * ├──────────────────────┴───────────────────────────────────┤
 * │  TICKER  (scrolling headlines)                            │
 * └──────────────────────────────────────────────────────────┘
 *
 * Overlays (portal-rendered):
 *   SearchPanel         — Cmd+K / Search button
 *   ClusterDetailModal  — click EventCard or search result
 *   AlertPanel          — Alerts button
 */
export function WarRoom() {
  const [searchOpen,      setSearchOpen]      = useState(false)
  const [alertsOpen,      setAlertsOpen]      = useState(false)
  const [detailClusterId, setDetailClusterId] = useState<string | null>(null)
  const [viewMode,        setViewMode]        = useState<ViewMode>('dashboard')

  const { unreadCount } = useAlerts()

  // Cmd/Ctrl+K → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const openCluster = useCallback((id: string) => {
    setDetailClusterId(id)
    setSearchOpen(false)
    setAlertsOpen(false)
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen bg-terminal-bg overflow-hidden">
      {/* Top header */}
      <Header
        onSearchOpen={() => setSearchOpen(true)}
        onAlertsOpen={() => setAlertsOpen(true)}
        alertCount={unreadCount}
      />

      {/* Stats bar + view toggle */}
      <div className="flex items-stretch flex-shrink-0 border-b border-terminal-border">
        <div className="flex-1">
          <StatsBar />
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 px-3 border-l border-terminal-border bg-terminal-surface">
          {([
            { mode: 'dashboard' as ViewMode, icon: LayoutDashboard, label: 'FEED'  },
            { mode: 'map'       as ViewMode, icon: Globe,            label: 'MAP'   },
            { mode: 'alpha'     as ViewMode, icon: Zap,              label: 'ALPHA' },
            { mode: 'splc'      as ViewMode, icon: GitBranch,        label: 'SPLC'  },
            { mode: 'corp'      as ViewMode, icon: Building2,        label: 'CORP'  },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors',
                viewMode === mode
                  ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                  : 'text-terminal-dim hover:text-terminal-text border border-transparent',
              )}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 min-w-0 divide-x divide-terminal-border"
            >
              <div className="flex-[65] min-w-0 overflow-hidden">
                <ClusterFeed onClusterSelect={openCluster} />
              </div>
              <div className="flex-[35] min-w-0 overflow-hidden">
                <LiveFeed />
              </div>
            </motion.div>
          ) : viewMode === 'map' ? (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0"
            >
              <WorldMapView onClusterSelect={openCluster} />
            </motion.div>
          ) : viewMode === 'alpha' ? (
            <motion.div
              key="alpha"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <StrategyFeed onClusterSelect={openCluster} />
            </motion.div>
          ) : viewMode === 'splc' ? (
            <motion.div
              key="splc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <SupplyChainView />
            </motion.div>
          ) : (
            <motion.div
              key="corp"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <CompanyProfileView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom ticker */}
      <Ticker />

      {/* ── Overlays ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <SearchPanel
            key="search"
            onClose={() => setSearchOpen(false)}
            onClusterSelect={openCluster}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {alertsOpen && (
          <AlertPanel
            key="alerts"
            onClose={() => setAlertsOpen(false)}
            onClusterSelect={openCluster}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailClusterId && (
          <ClusterDetailModal
            key={detailClusterId}
            clusterId={detailClusterId}
            onClose={() => setDetailClusterId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
