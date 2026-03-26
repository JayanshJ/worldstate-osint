import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, TrendingUp, Loader2, Zap, BarChart3, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ASSET_CLASS_COLORS } from '@/types';
import { useWebSocket } from '@/context/WebSocketContext';
import { StrategyCard } from './StrategyCard';
import { cn } from '@/lib/utils';
const FILTER_TABS = ['ALL', 'COMMODITY', 'EQUITY', 'FOREX', 'CRYPTO', 'BONDS', 'VOLATILITY'];
const FILTER_LABELS = {
    ALL: 'All',
    COMMODITY: 'Commodities',
    EQUITY: 'Equities',
    FOREX: 'Forex',
    CRYPTO: 'Crypto',
    BONDS: 'Bonds',
    VOLATILITY: 'Volatility',
};
// ─── Market sentiment header ──────────────────────────────────────────────────
function SentimentGauge({ label, value, min = -1, max = 1, isVol = false }) {
    const pct = ((value - min) / (max - min)) * 100;
    const color = isVol
        ? value >= 0.7 ? '#ef4444' : value >= 0.4 ? '#f97316' : '#22c55e'
        : value <= -0.3 ? '#ef4444' : value >= 0.3 ? '#22c55e' : '#eab308';
    return (_jsxs("div", { className: "flex flex-col gap-1 min-w-[90px]", children: [_jsx("span", { className: "font-mono text-[9px] text-terminal-dim tracking-widest uppercase", children: label }), _jsx("div", { className: "h-1 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all", style: { width: `${Math.max(4, pct)}%`, background: color } }) }), _jsx("span", { className: "font-mono text-[11px] font-bold tabular-nums", style: { color }, children: isVol ? value.toFixed(2) : (value >= 0 ? '+' : '') + value.toFixed(2) })] }));
}
export function StrategyFeed({ onClusterSelect }) {
    const [strategies, setStrategies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [disclaimerDismissed, setDisclaimerDismissed] = useState(() => sessionStorage.getItem('strategy_disclaimer_dismissed') === '1');
    const { lastStrategyUpdate } = useWebSocket();
    // ── Initial fetch ──────────────────────────────────────────────────────────
    useEffect(() => {
        api.strategies.list()
            .then(data => {
            setStrategies(data);
            if (data.length)
                setLastUpdated(new Date());
        })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    // ── Real-time WebSocket updates ────────────────────────────────────────────
    useEffect(() => {
        if (!lastStrategyUpdate?.length)
            return;
        setStrategies(lastStrategyUpdate);
        setLastUpdated(new Date());
    }, [lastStrategyUpdate]);
    // ── Manual refresh ─────────────────────────────────────────────────────────
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await api.strategies.refresh();
            // The WS broadcast will deliver the new strategies; also poll as fallback
            const updated = await api.strategies.list();
            setStrategies(updated);
            setLastUpdated(new Date());
        }
        catch {
            // silent fail
        }
        finally {
            setRefreshing(false);
        }
    }, []);
    // ── Derived state ──────────────────────────────────────────────────────────
    const filtered = activeFilter === 'ALL'
        ? strategies
        : strategies.filter(s => s.asset_class === activeFilter);
    const avgVol = strategies.length ? strategies.reduce((a, s) => a + s.volatility_context, 0) / strategies.length : 0;
    const avgSent = strategies.length ? strategies.reduce((a, s) => a + s.sentiment_context, 0) / strategies.length : 0;
    const longCount = strategies.filter(s => s.direction === 'LONG').length;
    const shortCount = strategies.filter(s => s.direction === 'SHORT').length;
    const dismissDisclaimer = useCallback(() => {
        sessionStorage.setItem('strategy_disclaimer_dismissed', '1');
        setDisclaimerDismissed(true);
    }, []);
    // ── Render ─────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "flex flex-col h-full bg-terminal-bg overflow-hidden", children: [!disclaimerDismissed && (_jsxs("div", { className: "flex-shrink-0 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-start gap-3", children: [_jsx(AlertTriangle, { size: 14, className: "text-amber-400 flex-shrink-0 mt-0.5" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-[11px] font-bold text-amber-400 tracking-wider mb-0.5", children: "IMPORTANT \u2014 NOT FINANCIAL ADVICE" }), _jsx("p", { className: "font-mono text-[10px] text-amber-400/70 leading-relaxed", children: "These signals are AI-generated research summaries based on news clustering. They have NOT been backtested, do not represent investment advice, and must not be used as the sole basis for any trading decision. Past signal accuracy does not predict future performance. Consult a qualified financial adviser before investing." })] }), _jsx("button", { onClick: dismissDisclaimer, className: "flex-shrink-0 text-amber-400/50 hover:text-amber-400 transition-colors", title: "Dismiss (this session only)", children: _jsx(X, { size: 13 }) })] })), _jsxs("div", { className: "flex-shrink-0 border-b border-terminal-border bg-terminal-surface", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Zap, { size: 13, className: "text-terminal-accent" }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-accent tracking-[0.12em]", children: "ALPHA" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm", children: "STRATEGIES" }), strategies.length > 0 && (_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm", children: [strategies.length, " ACTIVE"] }))] }), _jsxs("div", { className: "flex items-center gap-3", children: [lastUpdated && (_jsxs("span", { className: "font-mono text-[9px] text-terminal-dim/60", children: ["Updated ", lastUpdated.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })] })), _jsxs("button", { onClick: handleRefresh, disabled: refreshing, className: "flex items-center gap-1.5 font-mono text-[9px] text-terminal-dim hover:text-terminal-accent border border-terminal-border hover:border-terminal-accent/40 px-2 py-1 rounded-sm transition-colors disabled:opacity-50", children: [_jsx(RefreshCw, { size: 9, className: refreshing ? 'animate-spin' : '' }), "REFRESH"] })] })] }), strategies.length > 0 && (_jsxs("div", { className: "flex items-center gap-6 px-4 pb-3", children: [_jsx(SentimentGauge, { label: "Market Fear", value: avgVol, min: 0, max: 1, isVol: true }), _jsx(SentimentGauge, { label: "Sentiment", value: avgSent, min: -1, max: 1 }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "font-mono text-[9px] text-terminal-dim tracking-widest uppercase", children: "Bias" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "font-mono text-[11px] font-bold", style: { color: '#22c55e' }, children: ["\u25B2 ", longCount, "L"] }), _jsxs("span", { className: "font-mono text-[11px] font-bold", style: { color: '#ef4444' }, children: ["\u25BC ", shortCount, "S"] })] })] })] })), _jsx("div", { className: "flex items-center gap-0 px-4 pb-0 overflow-x-auto scrollbar-none", children: FILTER_TABS.map(tab => {
                            const color = tab === 'ALL' ? '#00d4ff' : ASSET_CLASS_COLORS[tab];
                            const count = tab === 'ALL' ? strategies.length : strategies.filter(s => s.asset_class === tab).length;
                            const active = activeFilter === tab;
                            return (_jsxs("button", { onClick: () => setActiveFilter(tab), className: cn('flex items-center gap-1.5 font-mono text-[10px] tracking-wider px-3 py-2 border-b-2 transition-colors whitespace-nowrap', active
                                    ? 'border-b-current text-terminal-text'
                                    : 'border-transparent text-terminal-dim hover:text-terminal-text'), style: active ? { color, borderBottomColor: color } : {}, children: [FILTER_LABELS[tab], count > 0 && (_jsx("span", { className: "text-[8px] px-1 rounded-sm", style: active
                                            ? { color, background: `${color}20` }
                                            : { color: 'inherit', opacity: 0.6 }, children: count }))] }, tab));
                        }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: loading ? (_jsxs("div", { className: "flex items-center justify-center h-48 gap-2 text-terminal-dim font-mono text-xs", children: [_jsx(Loader2, { size: 14, className: "animate-spin text-terminal-accent" }), "Loading strategies..."] })) : filtered.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-64 gap-3 text-terminal-dim/50 font-mono text-xs px-8 text-center", children: [_jsx(BarChart3, { size: 32, className: "text-terminal-dim/20" }), strategies.length === 0 ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm", children: "Generating alpha..." }), _jsx("p", { className: "text-[10px] leading-relaxed", children: "The strategy engine runs every 15 minutes once enough intelligence clusters accumulate. Click REFRESH to trigger generation now." }), _jsxs("button", { onClick: handleRefresh, disabled: refreshing, className: "mt-2 flex items-center gap-1.5 font-mono text-[10px] text-terminal-accent border border-terminal-accent/30 px-3 py-1.5 rounded-sm hover:bg-terminal-accent/10 transition-colors disabled:opacity-50", children: [_jsx(TrendingUp, { size: 11 }), "Generate Now"] })] })) : (_jsxs("p", { children: ["No ", activeFilter.toLowerCase(), " strategies in current cycle."] }))] })) : (_jsx(AnimatePresence, { initial: false, children: _jsx("div", { className: "divide-y divide-terminal-border/30", children: filtered.map((strategy, idx) => (_jsx(motion.div, { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2, delay: idx * 0.04 }, children: _jsx(StrategyCard, { strategy: strategy, onClusterSelect: onClusterSelect }) }, strategy.id))) }) })) }), filtered.length > 0 && (_jsxs("div", { className: "flex-shrink-0 border-t border-terminal-border px-4 py-2 bg-terminal-surface/30 flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 9, className: "text-amber-500/60 flex-shrink-0" }), _jsx("p", { className: "font-mono text-[9px] text-terminal-dim/60", children: "AI research only \u00B7 Not financial advice \u00B7 Not backtested \u00B7 Refreshes every 15 min" })] }))] }));
}
