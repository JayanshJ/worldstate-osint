import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { GitBranch, Globe, LayoutDashboard, Zap } from 'lucide-react';
import { Header } from './Header';
import { StatsBar } from './StatsBar';
import { Ticker } from '@/components/ticker/Ticker';
import { ClusterFeed } from '@/components/clusters/ClusterFeed';
import { LiveFeed } from '@/components/feed/LiveFeed';
import { SearchPanel } from '@/components/search/SearchPanel';
import { ClusterDetailModal } from '@/components/clusters/ClusterDetailModal';
import { AlertPanel } from '@/components/alerts/AlertPanel';
import { WorldMapView } from '@/components/map/WorldMapView';
import { StrategyFeed } from '@/components/strategies/StrategyFeed';
import { SupplyChainView } from '@/components/supply-chain/SupplyChainView';
import { AccountSettings } from '@/components/auth/AccountSettings';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { OnboardingTour, useOnboarding } from '@/components/onboarding/OnboardingTour';
import { useAlerts } from '@/hooks/useAlerts';
import { cn } from '@/lib/utils';
const VIEW_PATHS = {
    dashboard: '/',
    map: '/map',
    alpha: '/alpha',
    splc: '/splc',
};
function pathToView(path) {
    if (path.startsWith('/map'))
        return 'map';
    if (path.startsWith('/alpha'))
        return 'alpha';
    if (path.startsWith('/splc'))
        return 'splc';
    return 'dashboard';
}
export function WarRoom() {
    const [location, navigate] = useLocation();
    const [, clusterParams] = useRoute('/cluster/:id');
    const [, splcParams] = useRoute('/splc/:ticker');
    const [searchOpen, setSearchOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [adminOpen, setAdminOpen] = useState(false);
    const [mobilePanel, setMobilePanel] = useState('clusters');
    const [detailClusterId, setDetailClusterId] = useState(clusterParams?.id ?? null);
    const { unreadCount } = useAlerts();
    const { show: showTour, complete: completeTour } = useOnboarding();
    const viewMode = pathToView(location);
    // Restore cluster modal from /cluster/:id route on first load
    useEffect(() => {
        if (clusterParams?.id) {
            setDetailClusterId(clusterParams.id);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Cmd/Ctrl+K → search
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(v => !v);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    const setViewMode = useCallback((mode) => {
        navigate(VIEW_PATHS[mode]);
    }, [navigate]);
    const openCluster = useCallback((id) => {
        setDetailClusterId(id);
        setSearchOpen(false);
        setAlertsOpen(false);
        navigate(`/cluster/${id}`);
    }, [navigate]);
    const closeCluster = useCallback(() => {
        setDetailClusterId(null);
        // Go back to the view they came from (or dashboard)
        const prev = pathToView(location);
        navigate(prev === 'dashboard' ? '/' : VIEW_PATHS[prev]);
    }, [location, navigate]);
    // Current SPLC ticker from URL (e.g. /splc/AAPL)
    const splcTicker = splcParams?.ticker?.toUpperCase() ?? undefined;
    const handleSplcTickerChange = useCallback((ticker) => {
        navigate(ticker ? `/splc/${ticker.toUpperCase()}` : '/splc');
    }, [navigate]);
    return (_jsxs("div", { className: "flex flex-col h-screen w-screen bg-terminal-bg overflow-hidden", children: [_jsx(Header, { onSearchOpen: () => setSearchOpen(true), onAlertsOpen: () => setAlertsOpen(true), onSettingsOpen: () => setSettingsOpen(true), onAdminOpen: () => setAdminOpen(true), alertCount: unreadCount }), _jsxs("div", { className: "flex items-stretch flex-shrink-0 border-b border-terminal-border", children: [_jsx("div", { className: "hidden lg:flex flex-1", children: _jsx(StatsBar, {}) }), _jsx("div", { className: "flex items-center gap-1 px-3 border-terminal-border bg-terminal-surface flex-1 md:flex-none md:border-l justify-center md:justify-start", children: [
                            { mode: 'dashboard', icon: LayoutDashboard, label: 'FEED' },
                            { mode: 'map', icon: Globe, label: 'MAP' },
                            { mode: 'alpha', icon: Zap, label: 'ALPHA' },
                            { mode: 'splc', icon: GitBranch, label: 'SPLC' },
                        ].map(({ mode, icon: Icon, label }) => (_jsxs("button", { onClick: () => setViewMode(mode), className: cn('flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors', viewMode === mode
                                ? 'bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30'
                                : 'text-terminal-dim hover:text-terminal-text border border-transparent'), children: [_jsx(Icon, { size: 10 }), label] }, mode))) })] }), _jsx("div", { className: "flex flex-1 min-h-0 overflow-hidden", children: _jsx(AnimatePresence, { mode: "wait", children: viewMode === 'dashboard' ? (_jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 }, className: "flex flex-col flex-1 min-w-0", children: [_jsx("div", { className: "flex md:hidden flex-shrink-0 border-b border-terminal-border", children: [
                                    { panel: 'clusters', label: 'CLUSTERS' },
                                    { panel: 'feed', label: 'LIVE FEED' },
                                ].map(({ panel, label }) => (_jsx("button", { onClick: () => setMobilePanel(panel), className: cn('flex-1 py-2 text-[10px] font-mono tracking-widest transition-colors', mobilePanel === panel
                                        ? 'text-terminal-accent border-b-2 border-terminal-accent'
                                        : 'text-terminal-dim'), children: label }, panel))) }), _jsxs("div", { className: "flex flex-1 min-w-0 min-h-0 md:divide-x md:divide-terminal-border", children: [_jsx("div", { className: cn('md:flex-[65] min-w-0 overflow-hidden', mobilePanel === 'clusters' ? 'flex flex-1 flex-col' : 'hidden md:block md:flex-[65]'), children: _jsx(ClusterFeed, { onClusterSelect: openCluster }) }), _jsx("div", { className: cn('md:flex-[35] min-w-0 overflow-hidden', mobilePanel === 'feed' ? 'flex flex-1 flex-col' : 'hidden md:block md:flex-[35]'), children: _jsx(LiveFeed, {}) })] })] }, "dashboard")) : viewMode === 'map' ? (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 }, className: "flex-1 min-w-0", children: _jsx(WorldMapView, { onClusterSelect: openCluster }) }, "map")) : viewMode === 'alpha' ? (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 }, className: "flex-1 min-w-0 overflow-hidden", children: _jsx(StrategyFeed, { onClusterSelect: openCluster }) }, "alpha")) : viewMode === 'splc' ? (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 }, className: "flex-1 min-w-0 overflow-hidden", children: _jsx(SupplyChainView, { initialTicker: splcTicker, onTickerChange: handleSplcTickerChange }) }, "splc")) : null }) }), _jsx(Ticker, {}), _jsx(AnimatePresence, { children: searchOpen && (_jsx(SearchPanel, { onClose: () => setSearchOpen(false), onClusterSelect: openCluster }, "search")) }), _jsx(AnimatePresence, { children: alertsOpen && (_jsx(AlertPanel, { onClose: () => setAlertsOpen(false), onClusterSelect: openCluster }, "alerts")) }), _jsx(AnimatePresence, { children: detailClusterId && (_jsx(ClusterDetailModal, { clusterId: detailClusterId, onClose: closeCluster }, detailClusterId)) }), settingsOpen && (_jsx(AccountSettings, { onClose: () => setSettingsOpen(false) })), adminOpen && (_jsx(AdminPanel, { onClose: () => setAdminOpen(false) })), showTour && _jsx(OnboardingTour, { onComplete: completeTour })] }));
}
