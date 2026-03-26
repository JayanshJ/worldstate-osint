import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, X } from 'lucide-react';
import { api } from '@/lib/api';
import { getVolatilityTier, VOLATILITY_COLORS, getSourceLabel } from '@/types';
import { VolatilityBadge } from '@/components/ui/VolatilityBadge';
import { EntityPills } from '@/components/ui/EntityPills';
import { CredibilityDot } from '@/components/ui/CredibilityDot';
import { cn, formatAbsTime, formatDateTime } from '@/lib/utils';
import { useTimezone } from '@/context/TimezoneContext';
export function ClusterDetailModal({ clusterId, onClose }) {
    const [cluster, setCluster] = useState(null);
    const [loading, setLoading] = useState(true);
    const { timezone } = useTimezone();
    useEffect(() => {
        api.clusters.get(clusterId).then(data => {
            setCluster(data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [clusterId]);
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);
    const tier = cluster ? getVolatilityTier(cluster.volatility) : 'calm';
    const color = cluster ? VOLATILITY_COLORS[tier] : '#5a6380';
    // Sort members by credibility desc, then by distance asc
    const sortedMembers = cluster?.members
        ? [...cluster.members].sort((a, b) => {
            if (b.credibility_score !== a.credibility_score)
                return b.credibility_score - a.credibility_score;
            return (a.distance ?? 1) - (b.distance ?? 1);
        })
        : [];
    return (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "fixed inset-0 z-50 flex items-center justify-center p-4", style: { backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }, onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs(motion.div, { initial: { scale: 0.96, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.96, opacity: 0 }, transition: { duration: 0.18 }, className: "w-full max-w-3xl bg-terminal-surface border rounded-sm shadow-2xl flex flex-col", style: {
                borderColor: `${color}40`,
                borderLeftWidth: '3px',
                borderLeftColor: color,
                maxHeight: '85vh',
            }, children: [_jsxs("div", { className: "flex items-start justify-between px-5 py-4 border-b border-terminal-border flex-shrink-0", children: [_jsxs("div", { className: "flex-1 min-w-0 pr-4", children: [loading ? (_jsx("div", { className: "h-5 w-64 bg-terminal-muted animate-pulse rounded-sm" })) : (_jsx("h2", { className: "font-mono text-base font-bold text-terminal-text leading-snug", children: cluster?.label ?? 'Cluster Detail' })), _jsx("div", { className: "flex items-center gap-3 mt-2 flex-wrap", children: cluster && (_jsxs(_Fragment, { children: [_jsx(VolatilityBadge, { volatility: cluster.volatility, showBar: true, size: "md" }), _jsxs("span", { className: "text-[10px] font-mono text-terminal-dim", children: [cluster.member_count, " sources \u00B7 weight ", cluster.weighted_score.toFixed(2)] }), _jsxs("span", { className: "text-[10px] font-mono text-terminal-dim", children: ["First seen ", formatAbsTime(cluster.first_seen_at, timezone)] })] })) })] }), _jsx("button", { onClick: onClose, className: "flex-shrink-0 p-1.5 text-terminal-dim hover:text-terminal-text transition-colors rounded-sm hover:bg-terminal-muted", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: [loading && (_jsx("div", { className: "p-5 space-y-3", children: Array.from({ length: 5 }).map((_, i) => (_jsx("div", { className: "h-8 bg-terminal-muted animate-pulse rounded-sm" }, i))) })), cluster && (_jsxs("div", { className: "flex flex-col divide-y divide-terminal-border", children: [cluster.bullets && cluster.bullets.length > 0 && (_jsxs("section", { className: "px-5 py-4", children: [_jsx("h3", { className: "text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3", children: "Intelligence Brief" }), _jsx("ul", { className: "space-y-2", children: cluster.bullets.map((b, i) => (_jsxs("li", { className: "flex items-start gap-2.5", children: [_jsx("span", { className: "flex-shrink-0 mt-0.5 font-mono text-xs font-bold", style: { color }, children: i === 0 ? '►' : '·' }), _jsx("span", { className: "font-mono text-[12px] text-terminal-text leading-relaxed", children: b })] }, i))) })] })), cluster.entities && (_jsxs("section", { className: "px-5 py-4", children: [_jsx("h3", { className: "text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3", children: "Key Entities" }), _jsx(EntityPills, { entities: cluster.entities, max: 10 })] })), _jsxs("section", { className: "px-5 py-4", children: [_jsxs("h3", { className: "text-[9px] font-mono font-bold text-terminal-accent tracking-widest uppercase mb-3", children: ["Source Timeline (", sortedMembers.length, ")"] }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: "absolute left-2.5 top-0 bottom-0 w-px", style: { backgroundColor: `${color}30` } }), _jsx("div", { className: "space-y-2", children: sortedMembers.map((member, idx) => (_jsx(SourceTimelineEntry, { member: member, isFirst: idx === 0, color: color }, member.article_id))) })] })] }), _jsx("section", { className: "px-5 py-3 bg-terminal-bg/50", children: _jsx("div", { className: "flex flex-wrap gap-x-6 gap-y-1", children: [
                                            ['Cluster ID', cluster.id.slice(0, 16) + '…'],
                                            ['First Seen', formatDateTime(cluster.first_seen_at, timezone)],
                                            ['Last Update', formatDateTime(cluster.last_updated_at, timezone)],
                                            ['Sentiment', (cluster.sentiment >= 0 ? '+' : '') + cluster.sentiment.toFixed(3)],
                                            ['Status', cluster.is_active ? 'ACTIVE' : 'EXPIRED'],
                                        ].map(([k, v]) => (_jsxs("div", { className: "flex gap-2 text-[10px] font-mono", children: [_jsxs("span", { className: "text-terminal-dim", children: [k, ":"] }), _jsx("span", { className: "text-terminal-text", children: v })] }, k))) }) })] }))] })] }) }));
}
function SourceTimelineEntry({ member, isFirst, color, }) {
    const { timezone } = useTimezone();
    return (_jsxs("div", { className: "flex items-start gap-3 pl-1", children: [_jsx("div", { className: cn('w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 z-10', 'border'), style: {
                    backgroundColor: isFirst ? `${color}30` : 'transparent',
                    borderColor: isFirst ? color : '#2a2a3e',
                }, children: _jsx("div", { className: "w-1.5 h-1.5 rounded-full", style: { backgroundColor: isFirst ? color : '#2a2a3e' } }) }), _jsxs("div", { className: "flex-1 min-w-0 pb-2", children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx("span", { className: "text-[9px] font-mono font-bold", style: { color: isFirst ? color : '#5a6380' }, children: getSourceLabel(member.source_id) }), _jsx(CredibilityDot, { score: member.credibility_score, sourceId: member.source_id }), member.distance !== null && (_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim ml-auto", children: ["dist ", member.distance.toFixed(3)] })), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim", children: formatAbsTime(member.published_at, timezone) })] }), member.url ? (_jsxs("a", { href: member.url, target: "_blank", rel: "noopener noreferrer", className: "flex items-start gap-1 group", children: [_jsx("span", { className: "font-mono text-[11px] text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-snug", children: member.title }), _jsx(ExternalLink, { size: 9, className: "flex-shrink-0 mt-0.5 text-terminal-dim group-hover:text-terminal-accent" })] })) : (_jsx("p", { className: "font-mono text-[11px] text-terminal-text line-clamp-2 leading-snug", children: member.title }))] })] }));
}
