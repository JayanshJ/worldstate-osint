import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Activity, Bell, Globe, LogOut, Moon, Search, Settings, ShieldCheck, Sun, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatTzClock } from '@/lib/utils';
import { useTimezone } from '@/context/TimezoneContext';
import { CommodityChart } from '@/components/metals/CommodityChart';
function ConnectionIndicator({ status }) {
    const configs = {
        connected: { icon: Wifi, color: '#22c55e', label: 'LIVE' },
        connecting: { icon: Activity, color: '#eab308', label: 'SYNC' },
        disconnected: { icon: WifiOff, color: '#6b7280', label: 'DISC' },
        error: { icon: AlertTriangle, color: '#ef4444', label: 'ERR' },
    };
    const cfg = configs[status];
    const Icon = cfg.icon;
    return (_jsxs("div", { className: "flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest px-2 py-1 rounded-sm border", style: { color: cfg.color, borderColor: `${cfg.color}44`, backgroundColor: `${cfg.color}11` }, children: [_jsx(Icon, { size: 10, className: status === 'connected' ? 'animate-pulse' : '' }), _jsx("span", { className: "hidden sm:inline", children: cfg.label })] }));
}
function StatChip({ label, value, color = '#5a6380' }) {
    return (_jsxs("div", { className: "flex items-baseline gap-1 text-[10px] font-mono", children: [_jsx("span", { style: { color }, className: "tracking-wider", children: label }), _jsx("span", { className: "text-terminal-text font-semibold", children: value })] }));
}
function MetalChip({ label, price, change, color, onClick, }) {
    const isUp = change !== null && change >= 0;
    const changeColor = change === null ? '#5a6380' : isUp ? '#22c55e' : '#ef4444';
    const changeStr = change === null ? '' : `${isUp ? '+' : ''}${change.toFixed(2)}%`;
    return (_jsxs("button", { onClick: onClick, className: "flex items-baseline gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-sm hover:bg-white/5 transition-colors cursor-pointer group", title: `View ${label} chart`, children: [_jsx("span", { style: { color }, className: "tracking-wider group-hover:brightness-125 transition-all", children: label }), _jsx("span", { className: "text-terminal-text font-semibold", children: price }), changeStr && _jsx("span", { style: { color: changeColor }, className: "text-[9px]", children: changeStr })] }));
}
const EMPTY_METALS = {
    gold: { price: '---', change: null },
    silver: { price: '---', change: null },
    platinum: { price: '---', change: null },
    wti: { price: '---', change: null },
};
async function fetchMetals() {
    const t = localStorage.getItem('ws_token');
    const headers = t ? { Authorization: `Bearer ${t}` } : {};
    const res = await fetch('/api/v1/metals', { headers });
    if (!res.ok)
        return EMPTY_METALS;
    return res.json();
}
const COMMODITY_META = {
    gold: { name: 'Gold Spot', color: '#f5c842' },
    silver: { name: 'Silver Spot', color: '#a8b8c8' },
    platinum: { name: 'Platinum Spot', color: '#e2e8f0' },
    wti: { name: 'WTI Crude Oil', color: '#fb923c' },
};
export function Header({ onSearchOpen, onAlertsOpen, onSettingsOpen, onAdminOpen, alertCount }) {
    const { status } = useWebSocket();
    const { user, logout } = useAuth();
    const { timezone } = useTimezone();
    const { theme, toggleTheme } = useTheme();
    const [clock, setClock] = useState(formatTzClock(timezone));
    const [metals, setMetals] = useState(EMPTY_METALS);
    const [menuOpen, setMenuOpen] = useState(false);
    const [chart, setChart] = useState(null);
    const menuRef = useRef(null);
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    useEffect(() => {
        const id = setInterval(() => setClock(formatTzClock(timezone)), 1000);
        return () => clearInterval(id);
    }, [timezone]);
    useEffect(() => {
        const load = async () => setMetals(await fetchMetals());
        load();
        const id = setInterval(load, 60_000);
        return () => clearInterval(id);
    }, []);
    function openChart(key, label, price, change) {
        const meta = COMMODITY_META[key];
        setChart({ key, label, name: meta.name, color: meta.color, price, change });
    }
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "flex-shrink-0 h-12 bg-terminal-surface border-b border-terminal-border flex items-center px-2 md:px-4 gap-2 md:gap-4", children: [_jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [_jsx(Globe, { size: 14, className: "text-terminal-accent" }), _jsxs("span", { className: "font-mono font-bold text-sm text-terminal-accent tracking-[0.15em]", children: ["WORLD", _jsx("span", { className: "text-terminal-text", children: "STATE" })] }), _jsx("span", { className: "text-[9px] text-terminal-dim font-mono tracking-widest border border-terminal-muted px-1 py-0.5 rounded", children: "OSINT v1" })] }), _jsx("div", { className: "h-6 w-px bg-terminal-border" }), _jsxs("div", { className: "hidden lg:flex items-center gap-3 flex-1 overflow-hidden", children: [_jsx(StatChip, { label: timezone === 'UTC' ? 'UTC' : timezone.split('/').pop().replace('_', ' '), value: clock }), _jsx("div", { className: "h-4 w-px bg-terminal-border" }), _jsx(MetalChip, { label: "XAU", price: metals.gold.price, change: metals.gold.change, color: "#f5c842", onClick: () => openChart('gold', 'XAU', metals.gold.price, metals.gold.change) }), _jsx(MetalChip, { label: "XAG", price: metals.silver.price, change: metals.silver.change, color: "#a8b8c8", onClick: () => openChart('silver', 'XAG', metals.silver.price, metals.silver.change) }), _jsx(MetalChip, { label: "XPT", price: metals.platinum.price, change: metals.platinum.change, color: "#e2e8f0", onClick: () => openChart('platinum', 'XPT', metals.platinum.price, metals.platinum.change) }), _jsx(MetalChip, { label: "WTI", price: metals.wti.price, change: metals.wti.change, color: "#fb923c", onClick: () => openChart('wti', 'WTI', metals.wti.price, metals.wti.change) })] }), _jsx("div", { className: "flex-1 lg:hidden" }), _jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [_jsxs("button", { onClick: onSearchOpen, className: "flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 text-terminal-dim hover:text-terminal-text border border-terminal-border hover:border-terminal-accent/40 rounded-sm transition-colors group", title: "Search (Ctrl+K)", children: [_jsx(Search, { size: 11, className: "group-hover:text-terminal-accent transition-colors" }), _jsx("span", { className: "hidden sm:inline", children: "SEARCH" }), _jsx("kbd", { className: "text-[8px] text-terminal-dim/60 border border-terminal-dim/30 px-1 rounded hidden sm:inline", children: "\u2318K" })] }), _jsxs("button", { onClick: onAlertsOpen, className: cn('relative flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 border rounded-sm transition-colors', alertCount > 0
                                    ? 'text-red-400 border-red-500/40 hover:bg-red-500/10'
                                    : 'text-terminal-dim hover:text-terminal-text border-terminal-border hover:border-terminal-accent/40'), title: "Alert Watches", children: [_jsx(Bell, { size: 11, className: alertCount > 0 ? 'animate-pulse' : '' }), _jsx("span", { className: "hidden sm:inline", children: "ALERTS" }), alertCount > 0 && (_jsx("span", { className: "absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center", children: alertCount > 9 ? '9+' : alertCount }))] }), _jsx("button", { onClick: toggleTheme, className: "flex items-center justify-center w-7 h-7 text-terminal-dim hover:text-terminal-text border border-terminal-border hover:border-terminal-accent/40 rounded-sm transition-colors", title: theme === 'dark' ? 'Light mode' : 'Dark mode', children: theme === 'dark' ? _jsx(Sun, { size: 12 }) : _jsx(Moon, { size: 12 }) }), _jsx(ConnectionIndicator, { status: status }), _jsxs("div", { ref: menuRef, className: "relative", children: [_jsx("button", { onClick: () => setMenuOpen(v => !v), className: "flex items-center justify-center w-7 h-7 rounded-sm bg-terminal-accent/20 border border-terminal-accent/40 text-terminal-accent font-mono font-bold text-[11px] hover:bg-terminal-accent/30 transition-colors", title: user?.email ?? 'Account', children: user?.email?.[0]?.toUpperCase() ?? '?' }), menuOpen && (_jsxs("div", { className: "absolute right-0 top-full mt-1 w-56 bg-gray-950 border border-gray-800 rounded shadow-xl z-50 py-1 font-mono text-xs", children: [_jsxs("div", { className: "px-3 py-2 border-b border-gray-800", children: [_jsx("p", { className: "text-gray-400 text-[10px] uppercase tracking-widest", children: "Signed in as" }), _jsx("p", { className: "text-white truncate mt-0.5", children: user?.email }), user?.is_admin && (_jsxs("span", { className: "inline-flex items-center gap-1 mt-1 text-[9px] text-red-400 border border-red-800 px-1.5 py-0.5 rounded", children: [_jsx(ShieldCheck, { size: 8 }), " ADMIN"] }))] }), _jsxs("button", { onClick: () => { setMenuOpen(false); onSettingsOpen(); }, className: "w-full flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:bg-gray-900 hover:text-white transition-colors", children: [_jsx(Settings, { size: 12 }), " Account Settings"] }), user?.is_admin && (_jsxs("button", { onClick: () => { setMenuOpen(false); onAdminOpen(); }, className: "w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-gray-900 hover:text-red-300 transition-colors", children: [_jsx(ShieldCheck, { size: 12 }), " Admin Panel"] })), _jsx("div", { className: "border-t border-gray-800 mt-1" }), _jsxs("button", { onClick: () => { setMenuOpen(false); logout(); }, className: "w-full flex items-center gap-2.5 px-3 py-2 text-gray-500 hover:bg-gray-900 hover:text-gray-300 transition-colors", children: [_jsx(LogOut, { size: 12 }), " Sign Out"] })] }))] })] })] }), chart && (_jsx(CommodityChart, { commodity: chart, onClose: () => setChart(null) }))] }));
}
