import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Radio, Star, X } from 'lucide-react';
import { useLiveFeed } from '@/hooks/useLiveFeed';
import { CredibilityDot } from '@/components/ui/CredibilityDot';
import { getSourceLabel } from '@/types';
import { cn, formatAbsTime } from '@/lib/utils';
import { useTimezone } from '@/context/TimezoneContext';
import { SmartDigest } from './SmartDigest';
import { api } from '@/lib/api';
// ─── Constants ─────────────────────────────────────────────────────────────
const SOURCE_TYPE_COLORS = {
    rss: '#00d4ff',
    reddit: '#ff6314',
    playwright: '#a78bfa',
    twitter: '#1d9bf0',
    live: '#22c55e',
};
// ─── Sentiment chip ────────────────────────────────────────────────────────
function SentimentChip({ v }) {
    if (v == null)
        return null;
    if (v > 0.15)
        return _jsx("span", { className: "text-[7.5px] font-mono px-1 py-px rounded-sm bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0", children: "BULL" });
    if (v < -0.15)
        return _jsx("span", { className: "text-[7.5px] font-mono px-1 py-px rounded-sm bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0", children: "BEAR" });
    return null; // skip neutral to reduce noise
}
function groupByCluster(articles) {
    const groups = [];
    const seen = new Map();
    for (const a of articles) {
        const cid = a.cluster_id ?? null;
        if (cid && seen.has(cid)) {
            seen.get(cid).extras.push(a);
        }
        else {
            const g = { primary: a, extras: [] };
            groups.push(g);
            if (cid)
                seen.set(cid, g);
        }
    }
    return groups;
}
// ─── Watchlist panel ───────────────────────────────────────────────────────
const ENTITY_TYPES = [
    { value: 'person', label: 'Person' },
    { value: 'org', label: 'Org' },
    { value: 'location', label: 'Location' },
    { value: 'keyword', label: 'Keyword' },
];
function WatchlistPanel({ items, onAdd, onRemove, onClose, }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('keyword');
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const submit = () => {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        onAdd({ name: trimmed, type });
        setName('');
    };
    return (_jsxs("div", { className: "border-b border-terminal-border bg-[#07080f] px-3 py-2.5 flex-shrink-0", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "text-[9px] font-mono text-terminal-accent tracking-widest", children: "\u2605 WATCHLIST" }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text", children: _jsx(X, { size: 10 }) })] }), _jsxs("div", { className: "flex items-center gap-1.5 mb-2", children: [_jsx("select", { value: type, onChange: e => setType(e.target.value), className: "text-[9px] font-mono bg-terminal-surface border border-terminal-border text-terminal-dim px-1 py-0.5 rounded-sm flex-shrink-0", children: ENTITY_TYPES.map(t => (_jsx("option", { value: t.value, children: t.label }, t.value))) }), _jsx("input", { ref: inputRef, value: name, onChange: e => setName(e.target.value), onKeyDown: e => e.key === 'Enter' && submit(), placeholder: "e.g. Jerome Powell", className: "flex-1 text-[9px] font-mono bg-terminal-surface border border-terminal-border text-terminal-text px-2 py-0.5 rounded-sm placeholder-terminal-dim/50 outline-none focus:border-terminal-accent/50" }), _jsx("button", { onClick: submit, disabled: !name.trim(), className: "text-[8px] font-mono px-2 py-0.5 rounded-sm bg-terminal-accent/10 text-terminal-accent border border-terminal-accent/30 hover:bg-terminal-accent/20 transition-colors disabled:opacity-30", children: "ADD" })] }), items.length === 0 ? (_jsx("p", { className: "text-[8px] font-mono text-terminal-dim/50 tracking-wider", children: "No entities watched \u2014 add one above" })) : (_jsx("div", { className: "flex flex-wrap gap-1", children: items.map(item => (_jsxs("span", { className: "flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded-sm bg-terminal-surface border border-terminal-border text-terminal-dim", children: [item.name, _jsx("button", { onClick: () => onRemove(item.name), className: "hover:text-red-400 transition-colors", children: _jsx(X, { size: 7 }) })] }, item.name))) }))] }));
}
// ─── Single article row ────────────────────────────────────────────────────
function ArticleRow({ article, isFirst, isWatched, timezone, }) {
    const srcColor = SOURCE_TYPE_COLORS[article.source_type] ?? '#6b7280';
    const stripColor = isWatched ? '#f59e0b' : srcColor;
    return (_jsxs("div", { className: cn('group flex items-start gap-2 px-3 py-2 border-b border-terminal-border/50', 'hover:bg-terminal-muted/30 transition-colors', isFirst && !isWatched && 'bg-terminal-muted/20 animate-fade-in', isWatched && 'bg-amber-500/5'), children: [_jsx("div", { className: "w-0.5 rounded-full flex-shrink-0 self-stretch mt-1", style: { backgroundColor: stripColor } }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-0.5", children: [_jsx("span", { className: "text-[9px] font-mono font-bold tracking-wider flex-shrink-0", style: { color: srcColor }, children: getSourceLabel(article.source_id) }), _jsx(CredibilityDot, { score: article.credibility_score, sourceId: article.source_id }), _jsx(SentimentChip, { v: article.sentiment }), _jsx("span", { className: "text-[9px] text-terminal-dim font-mono ml-auto flex-shrink-0", children: formatAbsTime(article.ingested_at, timezone) })] }), article.url ? (_jsx("a", { href: article.url, target: "_blank", rel: "noopener noreferrer", className: "text-[11px] font-mono text-terminal-text hover:text-terminal-accent transition-colors leading-snug line-clamp-2 block", children: article.title })) : (_jsx("p", { className: "text-[11px] font-mono text-terminal-text leading-snug line-clamp-2", children: article.title })), article.cluster_label && (_jsxs("span", { className: "text-[8px] font-mono text-terminal-dim/60 line-clamp-1 mt-0.5", children: ["\u21B3 ", article.cluster_label] }))] })] }));
}
// ─── Article group (with collapse) ────────────────────────────────────────
function ArticleGroupRow({ group, isFirst, watchlist, timezone, }) {
    const [expanded, setExpanded] = useState(false);
    const isWatched = (a) => watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()));
    const primaryWatched = isWatched(group.primary);
    return (_jsxs(_Fragment, { children: [_jsx(ArticleRow, { article: group.primary, isFirst: isFirst, isWatched: primaryWatched, timezone: timezone }), group.extras.length > 0 && !expanded && (_jsxs("button", { onClick: () => setExpanded(true), className: "w-full flex items-center gap-1.5 px-4 py-1 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors text-left", children: [_jsx(ChevronRight, { size: 8, className: "text-terminal-dim" }), _jsxs("span", { className: "text-[8.5px] font-mono text-terminal-dim", children: ["+", group.extras.length, " more source", group.extras.length > 1 ? 's' : '', " on this story"] })] })), expanded && (_jsxs(_Fragment, { children: [group.extras.map(a => (_jsx(ArticleRow, { article: a, isFirst: false, isWatched: isWatched(a), timezone: timezone }, a.id))), _jsxs("button", { onClick: () => setExpanded(false), className: "w-full flex items-center gap-1.5 px-4 py-1 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors", children: [_jsx(ChevronDown, { size: 8, className: "text-terminal-dim" }), _jsx("span", { className: "text-[8.5px] font-mono text-terminal-dim", children: "Collapse" })] })] }))] }));
}
// ─── Main LiveFeed ─────────────────────────────────────────────────────────
export function LiveFeed() {
    const { articles, loading } = useLiveFeed();
    const { timezone } = useTimezone();
    const [tab, setTab] = useState('live');
    const [watchlistOpen, setWatchlistOpen] = useState(false);
    const [watchlist, setWatchlist] = useState([]);
    // Load watchlist on mount
    useEffect(() => {
        api.watchlist.get().then(setWatchlist).catch(() => { });
    }, []);
    const addEntity = async (item) => {
        try {
            const updated = await api.watchlist.add(item);
            setWatchlist(updated);
        }
        catch { /* ignore */ }
    };
    const removeEntity = async (name) => {
        try {
            await api.watchlist.remove(name);
            const updated = await api.watchlist.get();
            setWatchlist(updated);
        }
        catch { /* ignore */ }
    };
    // Sort watched articles to top when watchlist is active
    const sortedArticles = watchlist.length > 0
        ? [...articles].sort((a, b) => {
            const aW = watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()));
            const bW = watchlist.some(w => b.title.toLowerCase().includes(w.name.toLowerCase()));
            return (bW ? 1 : 0) - (aW ? 1 : 0);
        })
        : articles;
    const groups = groupByCluster(sortedArticles);
    const watchedCount = watchlist.length > 0
        ? articles.filter(a => watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()))).length
        : 0;
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-terminal-border flex-shrink-0", children: [_jsx(Radio, { size: 11, className: "text-green-400 animate-pulse" }), _jsx("button", { onClick: () => setTab('live'), className: cn('text-[10px] font-mono font-semibold tracking-widest transition-colors', tab === 'live' ? 'text-green-400' : 'text-terminal-dim hover:text-terminal-text'), children: "LIVE" }), _jsx("span", { className: "text-terminal-dim/40 text-[10px]", children: "|" }), _jsx("button", { onClick: () => setTab('digest'), className: cn('text-[10px] font-mono font-semibold tracking-widest transition-colors', tab === 'digest' ? 'text-terminal-accent' : 'text-terminal-dim hover:text-terminal-text'), children: "DIGEST" }), tab === 'live' && (_jsx("span", { className: "text-[10px] font-mono bg-terminal-muted px-1.5 py-0.5 rounded text-terminal-dim", children: articles.length })), _jsx("span", { className: "flex-1" }), tab === 'live' && (_jsxs("button", { onClick: () => setWatchlistOpen(v => !v), className: cn('flex items-center gap-1 text-[8.5px] font-mono tracking-wider transition-colors px-1.5 py-0.5 rounded-sm', watchlistOpen
                            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                            : watchedCount > 0
                                ? 'text-amber-400'
                                : 'text-terminal-dim hover:text-terminal-text'), children: [_jsx(Star, { size: 9, fill: watchlistOpen || watchedCount > 0 ? 'currentColor' : 'none' }), watchedCount > 0 && _jsx("span", { children: watchedCount })] }))] }), tab === 'live' && watchlistOpen && (_jsx(WatchlistPanel, { items: watchlist, onAdd: addEntity, onRemove: removeEntity, onClose: () => setWatchlistOpen(false) })), tab === 'digest' ? (_jsx(SmartDigest, {})) : (_jsxs("div", { className: "flex-1 overflow-y-auto", children: [loading && (_jsx("div", { className: "space-y-px", children: Array.from({ length: 12 }).map((_, i) => (_jsx("div", { className: "h-10 bg-terminal-surface animate-pulse mx-2 my-1 rounded-sm" }, i))) })), !loading && groups.map((group, idx) => (_jsx(ArticleGroupRow, { group: group, isFirst: idx === 0, watchlist: watchlist, timezone: timezone }, group.primary.id))), !loading && articles.length === 0 && (_jsx("div", { className: "text-center py-8 text-terminal-dim font-mono text-xs", children: "Waiting for data\u2026" }))] }))] }));
}
