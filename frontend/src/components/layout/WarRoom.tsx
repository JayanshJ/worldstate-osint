import { useCallback, useEffect, useState } from 'react'
import { useLocation, useRoute } from 'wouter'
import { AnimatePresence, motion } from 'framer-motion'
import { GitBranch, Globe, LayoutDashboard, Zap } from 'lucide-react'
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
import { useAlerts } from '@/hooks/useAlerts'
import { cn } from '@/lib/utils'

type ViewMode = 'dashboard' | 'map' | 'alpha' | 'splc'

const VIEW_PATHS: Record<ViewMode, string> = {
  dashboard: '/',
  map:       '/map',
  alpha:     '/alpha',
  splc:      '/splc',
}

function pathToView(path: string): ViewMode {
  if (path.startsWith('/map'))   return 'map'
  if (path.startsWith('/alpha')) return 'alpha'
  if (path.startsWith('/splc'))  return 'splc'
  return 'dashboard'
}

export function WarRoom() {
  const [location, navigate]  = useLocation()
  const [, clusterParams]     = useRoute('/cluster/:id')
  const [, splcParams]        = useRoute('/splc/:ticker')

  const [searchOpen,      setSearchOpen]      = useState(false)
  const [alertsOpen,      setAlertsOpen]      = useState(false)
  const [detailClusterId, setDetailClusterId] = useState<string | null>(
    clusterParams?.id ?? null,
  )

  const { unreadCount } = useAlerts()

  const viewMode = pathToView(location)

  // Restore cluster modal from /cluster/:id route on first load
  useEffect(() => {
    if (clusterParams?.id) {
      setDetailClusterId(clusterParams.id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd/Ctrl+K → search
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

  const setViewMode = useCallback((mode: ViewMode) => {
    navigate(VIEW_PATHS[mode])
  }, [navigate])

  const openCluster = useCallback((id: string) => {
    setDetailClusterId(id)
    setSearchOpen(false)
    setAlertsOpen(false)
    navigate(`/cluster/${id}`)
  }, [navigate])

  const closeCluster = useCallback(() => {
    setDetailClusterId(null)
    // Go back to the view they came from (or dashboard)
    const prev = pathToView(location)
    navigate(prev === 'dashboard' ? '/' : VIEW_PATHS[prev])
  }, [location, navigate])

  // Current SPLC ticker from URL (e.g. /splc/AAPL)
  const splcTicker = splcParams?.ticker?.toUpperCase() ?? undefined

  const handleSplcTickerChange = useCallback((ticker: string | null) => {
    navigate(ticker ? `/splc/${ticker.toUpperCase()}` : '/splc')
  }, [navigate])

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
        <div className="flex items-center gap-1 px-3 border-l border-terminal-border bg-terminal-surface">
          {([
            { mode: 'dashboard' as ViewMode, icon: LayoutDashboard, label: 'FEED'  },
            { mode: 'map'       as ViewMode, icon: Globe,            label: 'MAP'   },
            { mode: 'alpha'     as ViewMode, icon: Zap,              label: 'ALPHA' },
            { mode: 'splc'      as ViewMode, icon: GitBranch,        label: 'SPLC'  },
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
              <SupplyChainView
                initialTicker={splcTicker}
                onTickerChange={handleSplcTickerChange}
              />
            </motion.div>
          ) : null}
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
            onClose={closeCluster}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
