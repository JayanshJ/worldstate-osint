import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { useTimezone } from '@/context/TimezoneContext';
import { formatAbsTime } from '@/lib/utils';
const REFRESH_MS = 15 * 60 * 1000;
function SentimentIcon({ v }) {
    if (v > 0.15)
        return _jsx(TrendingUp, { size: 9, className: "text-green-400" });
    if (v < -0.15)
        return _jsx(TrendingDown, { size: 9, className: "text-red-400" });
    return _jsx(Minus, { size: 9, className: "text-gray-500" });
}
function VolDot({ v }) {
    const color = v > 0.7 ? '#ef4444' : v > 0.5 ? '#f97316' : v > 0.3 ? '#eab308' : '#22c55e';
    return _jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", style: { backgroundColor: color } });
}
export function SmartDigest() {
    const [stories, setStories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [spinning, setSpinning] = useState(false);
    const { timezone } = useTimezone();
    const load = useCallback(async (bust = false) => {
        if (bust)
            setSpinning(true);
        try {
            const data = bust ? await api.digest.refresh() : await api.digest.get();
            setStories(data);
        }
        catch { /* ignore */ }
        finally {
            setLoading(false);
            setSpinning(false);
        }
    }, []);
    useEffect(() => {
        load();
        const t = setInterval(() => load(), REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);
    if (loading) {
        return (_jsx("div", { className: "flex-1 overflow-y-auto p-3 space-y-2", children: Array.from({ length: 3 }).map((_, i) => (_jsx("div", { className: "h-20 bg-terminal-surface animate-pulse rounded-sm" }, i))) }));
    }
    if (!stories.length) {
        return (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsx("span", { className: "text-[10px] font-mono text-terminal-dim tracking-widest", children: "NO DIGEST AVAILABLE YET" }) }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-1.5 border-b border-terminal-border/50 flex-shrink-0", children: [_jsx("span", { className: "text-[8px] font-mono text-terminal-dim tracking-widest", children: "TOP STORIES \u00B7 AUTO-REFRESHES EVERY 15 MIN" }), _jsx("button", { onClick: () => load(true), disabled: spinning, className: "text-terminal-dim hover:text-terminal-accent transition-colors", children: _jsx(RefreshCw, { size: 9, className: spinning ? 'animate-spin' : '' }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto", children: stories.map((story, i) => (_jsxs("div", { className: "px-3 py-2.5 border-b border-terminal-border/40 hover:bg-terminal-muted/20 transition-colors", children: [_jsxs("div", { className: "flex items-start gap-2 mb-1.5", children: [_jsx("span", { className: "text-[9px] font-mono text-terminal-dim flex-shrink-0 mt-px", children: String(i + 1).padStart(2, '0') }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-0.5", children: [_jsx(SentimentIcon, { v: story.sentiment }), _jsx(VolDot, { v: story.volatility }), _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim", children: [story.member_count, " sources"] }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim ml-auto", children: story.last_updated_at ? formatAbsTime(story.last_updated_at, timezone) : '' })] }), _jsx("p", { className: "text-[11px] font-mono text-terminal-text font-semibold leading-snug", children: story.label })] })] }), story.bullets.length > 0 && (_jsx("ul", { className: "pl-5 space-y-0.5", children: story.bullets.map((b, bi) => (_jsx("li", { className: "text-[9.5px] font-mono text-terminal-dim leading-snug list-disc", children: b }, bi))) })), story.entities && (_jsx("div", { className: "flex flex-wrap gap-1 mt-1.5", children: [
                                ...(story.entities.people ?? []).slice(0, 2).map(e => ({ e, t: '👤' })),
                                ...(story.entities.organizations ?? []).slice(0, 2).map(e => ({ e, t: '🏛' })),
                                ...(story.entities.locations ?? []).slice(0, 1).map(e => ({ e, t: '📍' })),
                            ].map(({ e, t }) => (_jsxs("span", { className: "text-[8px] font-mono px-1.5 py-0.5 rounded-sm bg-terminal-surface text-terminal-dim border border-terminal-border/50", children: [t, " ", e] }, e))) }))] }, story.id))) })] }));
}
