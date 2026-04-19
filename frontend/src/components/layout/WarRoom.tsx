import { useCallback, useEffect, useState } from 'react'
import { useLocation, useRoute } from 'wouter'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, GitBranch, Globe, LayoutDashboard, Zap, Cpu } from 'lucide-react'
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
import { SignalsPanel } from '@/components/signals/SignalsPanel'
import { TechValleyView } from '@/components/techvalley/TechValleyView'
import { AccountSettings } from '@/components/auth/AccountSettings'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { OnboardingTour, useOnboarding } from '@/components/onboarding/OnboardingTour'
import { useAlerts } from '@/hooks/useAlerts'
import { cn } from '@/lib/utils'

type ViewMode    = 'dashboard' | 'map' | 'alpha' | 'splc' | 'signals' | 'techvalley'
type MobilePanel = 'clusters' | 'feed'

const VIEW_PATHS: Record<ViewMode, string> = {
  dashboard:  '/',
  map:        '/map',
  alpha:      '/alpha',
  splc:       '/splc',
  signals:    '/signals',
  techvalley: '/techvalley',
}

function pathToView(path: string): ViewMode {
  if (path.startsWith('/map'))        return 'map'
  if (path.startsWith('/alpha'))      return 'alpha'
  if (path.startsWith('/splc'))       return 'splc'
  if (path.startsWith('/signals'))    return 'signals'
  if (path.startsWith('/techvalley')) return 'techvalley'
  return 'dashboard'
}

export function WarRoom() {
  const [location, navigate]  = useLocation()
  const [, clusterParams]     = useRoute('/cluster/:id')
  const [, splcParams]        = useRoute('/splc/:ticker')

  const [searchOpen,      setSearchOpen]      = useState(false)
  const [alertsOpen,      setAlertsOpen]      = useState(false)
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [adminOpen,       setAdminOpen]       = useState(false)
  const [mobilePanel,     setMobilePanel]     = useState<MobilePanel>('clusters')
  const [detailClusterId, setDetailClusterId] = useState<string | null>(
    clusterParams?.id ?? null,
  )

  const { unreadCount } = useAlerts()
  const { show: showTour, complete: completeTour } = useOnboarding()

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
        onSearchOpen={()  => setSearchOpen(true)}
        onAlertsOpen={()  => setAlertsOpen(true)}
        onSettingsOpen={() => setSettingsOpen(true)}
        onAdminOpen={()   => setAdminOpen(true)}
        alertCount={unreadCount}
      />

      {/* Stats bar + view toggle */}
      <div className="flex items-stretch flex-shrink-0 border-b border-terminal-border">
        {/* Stats — hidden on mobile/tablet, show on desktop */}
        <div className="hidden lg:flex flex-1">
          <StatsBar />
        </div>
        {/* View toggle — full width on mobile, border-left on desktop */}
        <div className="flex items-center gap-1 px-3 border-terminal-border bg-terminal-surface flex-1 md:flex-none md:border-l justify-center md:justify-start">
          {([
            { mode: 'dashboard'  as ViewMode, icon: LayoutDashboard, label: 'FEED'     },
            { mode: 'map'        as ViewMode, icon: Globe,            label: 'MAP'      },
            { mode: 'alpha'      as ViewMode, icon: Zap,              label: 'ALPHA'    },
            { mode: 'signals'    as ViewMode, icon: Activity,         label: 'SIGNALS'  },
            { mode: 'splc'       as ViewMode, icon: GitBranch,        label: 'SPLC'     },
            { mode: 'techvalley' as ViewMode, icon: Cpu,              label: 'SV'       },
          ] as const).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 transition-colors border',
                viewMode === mode
                  ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                  : 'text-terminal-dim hover:text-terminal-text border-transparent',
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
              className="flex flex-col flex-1 min-w-0"
            >
              {/* Mobile panel tab switcher — hidden at md+ (side-by-side) */}
              <div className="flex md:hidden flex-shrink-0 border-b border-terminal-border">
                {([
                  { panel: 'clusters' as MobilePanel, label: 'CLUSTERS' },
                  { panel: 'feed'     as MobilePanel, label: 'LIVE FEED' },
                ] as const).map(({ panel, label }) => (
                  <button
                    key={panel}
                    onClick={() => setMobilePanel(panel)}
                    className={cn(
                      'flex-1 py-2 text-[10px] font-mono tracking-widest transition-colors',
                      mobilePanel === panel
                        ? 'text-terminal-accent border-b-2 border-terminal-accent'
                        : 'text-terminal-dim',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Content panels */}
              <div className="flex flex-1 min-w-0 min-h-0 md:divide-x md:divide-terminal-border">
                <div className={cn(
                  'md:flex-[65] min-w-0 overflow-hidden',
                  mobilePanel === 'clusters' ? 'flex flex-1 flex-col' : 'hidden md:block md:flex-[65]',
                )}>
                  <ClusterFeed onClusterSelect={openCluster} />
                </div>
                <div className={cn(
                  'md:flex-[35] min-w-0 overflow-hidden',
                  mobilePanel === 'feed' ? 'flex flex-1 flex-col' : 'hidden md:block md:flex-[35]',
                )}>
                  <LiveFeed />
                </div>
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
          ) : viewMode === 'signals' ? (
            <motion.div
              key="signals"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <SignalsPanel />
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
          ) : viewMode === 'techvalley' ? (
            <motion.div
              key="techvalley"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0 overflow-hidden"
            >
              <TechValleyView onClusterSelect={openCluster} />
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

      {settingsOpen && (
        <AccountSettings onClose={() => setSettingsOpen(false)} />
      )}

      {adminOpen && (
        <AdminPanel onClose={() => setAdminOpen(false)} />
      )}

      {showTour && <OnboardingTour onComplete={completeTour} />}
    </div>
  )
}
