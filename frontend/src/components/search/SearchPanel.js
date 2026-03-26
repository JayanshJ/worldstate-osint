import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { VolatilityBadge } from '@/components/ui/VolatilityBadge';
import { CredibilityDot } from '@/components/ui/CredibilityDot';
import { cn, timeAgo } from '@/lib/utils';
import { getSourceLabel } from '@/types';
export function SearchPanel({ onClose, onClusterSelect }) {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('keyword');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);
    const debounceRef = useRef();
    useEffect(() => { inputRef.current?.focus(); }, []);
    // Keyboard: Escape to close
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape')
            onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);
    const runSearch = useCallback(async (q, m) => {
        if (q.trim().length < 2) {
            setResult(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await api.search.query(q.trim(), m, 15);
            setResult(data);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    }, []);
    const handleInput = (val) => {
        setQuery(val);
        clearTimeout(debounceRef.current);
        // Semantic search is expensive — longer debounce
        debounceRef.current = setTimeout(() => runSearch(val, mode), mode === 'semantic' ? 800 : 300);
    };
    const handleModeChange = (m) => {
        setMode(m);
        if (query.trim().length >= 2)
            runSearch(query, m);
    };
    const hasResults = result && result.total > 0;
    return (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "fixed inset-0 z-50 flex items-start justify-center pt-16 px-4", style: { backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }, onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs(motion.div, { initial: { y: -20, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -20, opacity: 0 }, className: "w-full max-w-2xl bg-terminal-surface border border-terminal-border rounded-sm shadow-2xl", style: { maxHeight: 'calc(100vh - 8rem)' }, children: [_jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-terminal-border", children: [loading
                            ? _jsx(Loader2, { size: 14, className: "text-terminal-accent animate-spin flex-shrink-0" })
                            : _jsx(Search, { size: 14, className: "text-terminal-dim flex-shrink-0" }), _jsx("input", { ref: inputRef, value: query, onChange: e => handleInput(e.target.value), placeholder: "Search events, entities, locations\u2026", className: cn('flex-1 bg-transparent font-mono text-sm text-terminal-text', 'placeholder-terminal-dim outline-none') }), query && (_jsx("button", { onClick: () => { setQuery(''); setResult(null); }, children: _jsx(X, { size: 12, className: "text-terminal-dim hover:text-terminal-text" }) })), _jsx("div", { className: "flex items-center gap-1 border border-terminal-border rounded-sm p-0.5 flex-shrink-0", children: ['keyword', 'semantic'].map(m => (_jsx("button", { onClick: () => handleModeChange(m), className: cn('text-[9px] font-mono px-2 py-0.5 rounded-sm transition-colors tracking-widest', mode === m
                                    ? 'bg-terminal-accent/20 text-terminal-accent'
                                    : 'text-terminal-dim hover:text-terminal-text'), children: m === 'semantic' ? '⚡ AI' : 'TXT' }, m))) }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text ml-1", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "overflow-y-auto scrollbar-thin", style: { maxHeight: 'calc(100vh - 16rem)' }, children: [error && (_jsxs("div", { className: "px-4 py-3 text-xs text-red-400 font-mono", children: ["\u26A0 ", error] })), !loading && query.length >= 2 && !hasResults && (_jsxs("div", { className: "px-4 py-8 text-center text-terminal-dim font-mono text-xs", children: ["No results for \"", query, "\""] })), hasResults && (_jsxs(_Fragment, { children: [result.cluster_hits.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border uppercase bg-terminal-bg/50", children: ["Event Clusters (", result.cluster_hits.length, ")"] }), result.cluster_hits.map(hit => (_jsx(ClusterResultRow, { hit: hit, onSelect: () => { onClusterSelect?.(hit.cluster_id); onClose(); } }, hit.cluster_id)))] })), result.article_hits.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border uppercase bg-terminal-bg/50", children: ["Articles (", result.article_hits.length, ")"] }), result.article_hits.map(hit => (_jsx(ArticleResultRow, { hit: hit }, hit.article_id)))] }))] })), !query && (_jsxs("div", { className: "px-4 py-6 text-center text-terminal-dim font-mono text-xs space-y-1", children: [_jsx("p", { children: "TXT mode: trigram keyword matching" }), _jsx("p", { children: "\u26A1 AI mode: semantic meaning search (slower)" })] }))] }), hasResults && (_jsxs("div", { className: "px-4 py-2 border-t border-terminal-border flex items-center justify-between", children: [_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim", children: [result.total, " results \u00B7 ", mode, " \u00B7 \"", result.query, "\""] }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim", children: "ESC to close" })] }))] }) }));
}
function ClusterResultRow({ hit, onSelect }) {
    return (_jsxs("button", { onClick: onSelect, className: "w-full flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50 hover:bg-terminal-muted/30 transition-colors text-left group", children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx(VolatilityBadge, { volatility: hit.volatility, size: "sm" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-xs text-terminal-text group-hover:text-terminal-accent transition-colors truncate", children: hit.label ?? 'Unnamed cluster' }), hit.bullets?.[0] && (_jsx("p", { className: "font-mono text-[10px] text-terminal-dim mt-0.5 line-clamp-1", children: hit.bullets[0] }))] }), _jsxs("div", { className: "flex-shrink-0 text-right", children: [_jsxs("div", { className: "text-[10px] font-mono text-terminal-dim", children: [hit.member_count, " src"] }), _jsxs("div", { className: "text-[9px] font-mono text-terminal-accent/60", children: [(hit.score * 100).toFixed(0), "%"] })] })] }));
}
function ArticleResultRow({ hit }) {
    const content = (_jsxs("div", { className: "flex items-start gap-3 px-4 py-2.5 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors", children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx(CredibilityDot, { score: hit.credibility_score, sourceId: hit.source_id }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-[11px] text-terminal-text line-clamp-1", children: hit.title }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [_jsx("span", { className: "text-[9px] text-terminal-dim font-mono", children: getSourceLabel(hit.source_id) }), hit.cluster_label && (_jsxs("span", { className: "text-[9px] text-terminal-accent font-mono truncate max-w-[180px]", children: ["\u21B3 ", hit.cluster_label] })), _jsx("span", { className: "text-[9px] text-terminal-dim font-mono ml-auto", children: timeAgo(hit.published_at) })] })] })] }));
    return hit.url
        ? _jsx("a", { href: hit.url, target: "_blank", rel: "noopener noreferrer", children: content })
        : _jsx("div", { children: content });
}
