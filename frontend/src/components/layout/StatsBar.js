import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Activity, Database, Layers, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { VOLATILITY_COLORS, getVolatilityTier } from '@/types';
import { getSourceLabel } from '@/types';
const POLL_INTERVAL_MS = 30_000;
export function StatsBar() {
    const [stats, setStats] = useState(null);
    useEffect(() => {
        const fetch = () => api.stats.get().then(setStats).catch(() => { });
        fetch();
        const id = setInterval(fetch, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);
    if (!stats)
        return null;
    const { articles, clusters } = stats;
    const clusterTierData = [
        { label: 'CRIT', count: clusters.critical, volt: 0.9 },
        { label: 'HIGH', count: clusters.high, volt: 0.75 },
        { label: 'ELEV', count: clusters.elevated, volt: 0.62 },
        { label: 'MOD', count: clusters.moderate, volt: 0.47 },
        { label: 'CALM', count: clusters.calm, volt: 0.1 },
    ];
    return (_jsxs("div", { className: "flex-shrink-0 h-8 bg-terminal-bg flex items-center px-3 gap-4 overflow-x-auto", children: [_jsx(StatChip, { icon: _jsx(Activity, { size: 9 }), label: "ART/MIN", value: articles.per_minute.toFixed(1), color: "#00d4ff" }), _jsx("div", { className: "h-4 w-px bg-terminal-border flex-shrink-0" }), _jsx(StatChip, { label: "1H", value: String(articles.last_1h), color: "#5a6380" }), _jsx(StatChip, { label: "24H", value: String(articles.last_24h), color: "#5a6380" }), _jsx("div", { className: "h-4 w-px bg-terminal-border flex-shrink-0" }), _jsx(StatChip, { icon: _jsx(Database, { size: 9 }), label: "Q", value: String(articles.queue_depth), color: articles.queue_depth > 50 ? '#f97316' : '#5a6380' }), _jsx("div", { className: "h-4 w-px bg-terminal-border flex-shrink-0" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Layers, { size: 9, className: "text-terminal-dim flex-shrink-0" }), clusterTierData.map(({ label, count, volt }) => {
                        if (count === 0)
                            return null;
                        const color = VOLATILITY_COLORS[getVolatilityTier(volt)];
                        return (_jsxs("span", { className: "text-[9px] font-mono font-bold flex-shrink-0", style: { color }, children: [count, " ", label] }, label));
                    }), _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim flex-shrink-0", children: ["(", clusters.total, " total)"] })] }), _jsx("div", { className: "h-4 w-px bg-terminal-border flex-shrink-0" }), _jsxs("div", { className: "flex items-center gap-2 overflow-hidden", children: [_jsx(TrendingUp, { size: 9, className: "text-terminal-dim flex-shrink-0" }), stats.source_health.slice(0, 5).map(s => (_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim flex-shrink-0 whitespace-nowrap", children: [_jsx("span", { className: "text-terminal-text", children: getSourceLabel(s.source_id) }), _jsxs("span", { className: "text-terminal-dim", children: [" ", s.count_1h] })] }, s.source_id)))] })] }));
}
function StatChip({ icon, label, value, color, }) {
    return (_jsxs("div", { className: "flex items-center gap-1 flex-shrink-0", children: [icon && _jsx("span", { className: "text-terminal-dim", children: icon }), _jsx("span", { className: "text-[9px] font-mono tracking-wider text-terminal-dim", children: label }), _jsx("span", { className: "text-[10px] font-mono font-semibold", style: { color: color ?? '#c8d3e8' }, children: value })] }));
}
