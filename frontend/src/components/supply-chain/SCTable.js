import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SCTable — filterable, sortable, searchable table view of supply chain edges.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
function riskScore(e) {
    const exp = e.pct_revenue ?? e.pct_cogs ?? 0;
    if (e.sole_source)
        return 100;
    if (exp >= 20)
        return 80;
    if (exp >= 10)
        return 50;
    if (exp > 0)
        return 20;
    return 5;
}
const RISK_LABEL = (e) => {
    const s = riskScore(e);
    if (s >= 80)
        return { label: 'HIGH', color: '#ef4444', bg: 'bg-red-400/10    border-red-400/30' };
    if (s >= 50)
        return { label: 'MED', color: '#f97316', bg: 'bg-orange-400/10 border-orange-400/30' };
    if (s >= 20)
        return { label: 'LOW', color: '#22c55e', bg: 'bg-green-400/10  border-green-400/30' };
    return { label: '—', color: '#5a6380', bg: 'bg-transparent   border-terminal-border' };
};
const DIR_CONFIG = {
    UPSTREAM: { label: '↑ SUPPLIER', color: '#0ea5e9' },
    DOWNSTREAM: { label: '↓ CUSTOMER', color: '#22c55e' },
    COMPETITOR: { label: '↔ COMPETITOR', color: '#9ca3af' },
    SHAREHOLDER: { label: '◆ HOLDER', color: '#eab308' },
    BOARD: { label: '● BOARD', color: '#e879f9' },
    ANALYST: { label: '◈ ANALYST', color: '#a78bfa' },
    INDUSTRY: { label: '▣ INDUSTRY', color: '#06b6d4' },
};
const DISC_ICON = {
    DISCLOSED: '📄', ESTIMATED: '~', INFERRED: '⚡',
};
const DISC_COLOR = {
    DISCLOSED: '#00d4ff', ESTIMATED: '#eab308', INFERRED: '#5a6380',
};
// Mini inline bar
function MiniBar({ value, max, color }) {
    const pct = Math.min(100, (value / max) * 100);
    return (_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "w-14 h-1 bg-terminal-border rounded-full overflow-hidden flex-shrink-0", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${pct}%`, background: color } }) }), _jsxs("span", { style: { color }, className: "text-[9px] font-mono tabular-nums", children: [value.toFixed(1), "%"] })] }));
}
export function SCTable({ edges, onRowClick, onCellClick }) {
    const [direction, setDirection] = useState('ALL');
    const [sortKey, setSortKey] = useState('risk');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');
    const maxExp = useMemo(() => Math.max(1, ...edges.map(e => e.pct_revenue ?? e.pct_cogs ?? 0)), [edges]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = edges.filter(e => {
            if (direction !== 'ALL' && e.direction !== direction)
                return false;
            if (q && !e.entity_name.toLowerCase().includes(q) &&
                !(e.hq_country?.toLowerCase().includes(q)) &&
                !(e.relationship_type?.toLowerCase().includes(q)))
                return false;
            return true;
        });
        rows = [...rows].sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'entity_name')
                cmp = a.entity_name.localeCompare(b.entity_name);
            else if (sortKey === 'pct_revenue')
                cmp = (a.pct_revenue ?? 0) - (b.pct_revenue ?? 0);
            else if (sortKey === 'pct_cogs')
                cmp = (a.pct_cogs ?? 0) - (b.pct_cogs ?? 0);
            else if (sortKey === 'confidence')
                cmp = (a.confidence ?? 0) - (b.confidence ?? 0);
            else if (sortKey === 'tier')
                cmp = (a.tier ?? 1) - (b.tier ?? 1);
            else
                cmp = riskScore(a) - riskScore(b);
            return sortAsc ? cmp : -cmp;
        });
        return rows;
    }, [edges, direction, sortKey, sortAsc, search]);
    function sort(key) {
        if (sortKey === key)
            setSortAsc(v => !v);
        else {
            setSortKey(key);
            setSortAsc(false);
        }
    }
    function SortIcon({ k }) {
        if (sortKey !== k)
            return _jsx(ChevronsUpDown, { size: 8, className: "text-terminal-dim/30" });
        return sortAsc
            ? _jsx(ChevronUp, { size: 8, className: "text-terminal-accent" })
            : _jsx(ChevronDown, { size: 8, className: "text-terminal-accent" });
    }
    const dirCounts = useMemo(() => ({
        ALL: edges.length,
        UPSTREAM: edges.filter(e => e.direction === 'UPSTREAM').length,
        DOWNSTREAM: edges.filter(e => e.direction === 'DOWNSTREAM').length,
        COMPETITOR: edges.filter(e => e.direction === 'COMPETITOR').length,
    }), [edges]);
    return (_jsxs("div", { className: "flex flex-col h-full min-h-0", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 py-2 border-b border-terminal-border bg-terminal-surface/40 flex-shrink-0 flex-wrap", children: [_jsx("div", { className: "flex items-center gap-1", children: ['ALL', 'UPSTREAM', 'DOWNSTREAM', 'COMPETITOR'].map(d => (_jsxs("button", { onClick: () => setDirection(d), className: cn('text-[8px] font-mono tracking-widest px-2 py-1 rounded-sm transition-colors border', direction === d
                                ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                                : 'text-terminal-dim border-transparent hover:text-terminal-text'), children: [d === 'ALL' ? 'ALL' : d === 'UPSTREAM' ? 'SUPPLIERS' : d === 'DOWNSTREAM' ? 'CUSTOMERS' : 'COMPETITORS', ' ', _jsx("span", { className: "opacity-50", children: dirCounts[d] })] }, d))) }), _jsxs("div", { className: "relative ml-auto", children: [_jsx(Search, { size: 10, className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-terminal-dim/50 pointer-events-none" }), _jsx("input", { value: search, onChange: e => setSearch(e.target.value), placeholder: "Search\u2026", className: "pl-7 pr-3 py-1 bg-terminal-bg border border-terminal-border rounded-sm font-mono text-[10px] text-terminal-text placeholder:text-terminal-dim/30 focus:outline-none focus:border-terminal-accent/50 w-36" })] }), _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim/40", children: [filtered.length, " / ", edges.length] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: [_jsxs("table", { className: "w-full text-left border-collapse min-w-[680px]", children: [_jsx("thead", { className: "sticky top-0 bg-terminal-surface z-10", children: _jsxs("tr", { className: "text-[8px] font-mono text-terminal-dim/70 tracking-widest border-b border-terminal-border", children: [_jsx("th", { className: "px-4 py-2 font-normal w-[200px]", children: _jsxs("button", { onClick: () => sort('entity_name'), className: "flex items-center gap-1 hover:text-terminal-text", children: ["ENTITY ", _jsx(SortIcon, { k: "entity_name" })] }) }), _jsx("th", { className: "px-2 py-2 font-normal", children: "DIR" }), _jsx("th", { className: "px-2 py-2 font-normal", children: "TYPE" }), _jsx("th", { className: "px-2 py-2 font-normal", children: _jsxs("button", { onClick: () => sort('tier'), className: "flex items-center gap-1 hover:text-terminal-text", children: ["TIER ", _jsx(SortIcon, { k: "tier" })] }) }), _jsx("th", { className: "px-2 py-2 font-normal", children: "GEO" }), _jsx("th", { className: "px-2 py-2 font-normal w-[110px]", children: _jsxs("button", { onClick: () => sort('pct_revenue'), className: "flex items-center gap-1 hover:text-terminal-text", children: ["EXPOSURE ", _jsx(SortIcon, { k: "pct_revenue" })] }) }), _jsx("th", { className: "px-2 py-2 font-normal", children: _jsxs("button", { onClick: () => sort('risk'), className: "flex items-center gap-1 hover:text-terminal-text", children: ["RISK ", _jsx(SortIcon, { k: "risk" })] }) }), _jsx("th", { className: "px-2 py-2 font-normal w-[90px]", children: _jsxs("button", { onClick: () => sort('confidence'), className: "flex items-center gap-1 hover:text-terminal-text", children: ["CONF ", _jsx(SortIcon, { k: "confidence" })] }) }), _jsx("th", { className: "px-2 py-2 font-normal", children: "SOURCE" })] }) }), _jsx("tbody", { children: filtered.map((e, i) => {
                                    const { label, color, bg } = RISK_LABEL(e);
                                    const exp = e.pct_revenue ?? e.pct_cogs;
                                    const expLabel = e.pct_revenue != null ? 'REV' : e.pct_cogs != null ? 'COG' : null;
                                    const dirCfg = DIR_CONFIG[e.direction] ?? { label: e.direction, color: '#5a6380' };
                                    const conf = (e.confidence ?? 0.75) * 100;
                                    // Cell click helper: stops row-level propagation and emits typed event
                                    const cell = (ev) => (me) => {
                                        me.stopPropagation();
                                        onCellClick?.(ev);
                                    };
                                    return (_jsxs("tr", { onClick: () => onRowClick(e), className: cn('border-b border-terminal-border/20 cursor-pointer transition-colors group', i % 2 === 0 ? 'bg-terminal-bg' : 'bg-terminal-surface/15', 'hover:bg-terminal-accent/5'), children: [_jsx("td", { className: "px-4 py-2 text-[11px] font-mono text-terminal-text cursor-pointer", onClick: cell({ type: 'entity', edge: e }), children: _jsxs("div", { className: "flex items-center gap-1.5 max-w-[200px]", children: [e.sole_source && (_jsx("span", { title: "Sole source", className: "flex items-center", children: _jsx(AlertTriangle, { size: 9, className: "text-red-400 flex-shrink-0" }) })), _jsx("span", { className: "truncate group-hover:text-white transition-colors hover:underline hover:decoration-terminal-accent/40", children: e.entity_name })] }) }), _jsx("td", { className: "px-2 py-2 cursor-pointer", onClick: cell({ type: 'direction', direction: e.direction, edges: edges.filter(x => x.direction === e.direction) }), children: _jsx("span", { className: "text-[8px] font-mono hover:brightness-150 transition-all", style: { color: dirCfg.color }, children: dirCfg.label }) }), _jsx("td", { className: "px-2 py-2 text-[9px] font-mono text-terminal-dim/70 cursor-pointer hover:text-terminal-text transition-colors", onClick: cell({ type: 'edge', edge: e }), children: (e.relationship_type ?? '').replaceAll('_', ' ') }), _jsx("td", { className: "px-2 py-2 text-center cursor-pointer hover:text-terminal-text transition-colors", onClick: cell({ type: 'edge', edge: e }), children: _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim/60", children: ["T", e.tier ?? 1] }) }), _jsx("td", { className: "px-2 py-2 text-[9px] font-mono text-terminal-dim/70 cursor-pointer hover:text-terminal-text hover:underline hover:decoration-terminal-accent/40 transition-colors", onClick: cell(e.hq_country
                                                    ? { type: 'country', country: e.hq_country, edges: edges.filter(x => x.hq_country === e.hq_country) }
                                                    : { type: 'edge', edge: e }), children: e.hq_country ?? '—' }), _jsx("td", { className: "px-2 py-2 cursor-pointer", onClick: cell({ type: 'edge', edge: e }), children: exp != null ? (_jsxs("div", { className: "flex items-center gap-1 hover:brightness-125 transition-all", children: [_jsx(MiniBar, { value: exp, max: maxExp, color: e.pct_revenue != null ? '#22c55e' : '#0ea5e9' }), _jsx("span", { className: "text-[7px] font-mono text-terminal-dim/40", children: expLabel })] })) : (_jsx("span", { className: "text-terminal-dim/25 text-[9px] font-mono", children: "\u2014" })) }), _jsx("td", { className: "px-2 py-2 cursor-pointer", onClick: cell({ type: 'edge', edge: e }), children: _jsx("span", { className: cn('text-[8px] font-mono border px-1.5 py-0.5 rounded-sm hover:brightness-125 transition-all', bg), style: { color }, children: label }) }), _jsx("td", { className: "px-2 py-2 cursor-pointer", onClick: cell({ type: 'edge', edge: e }), children: _jsxs("div", { className: "flex items-center gap-1.5 hover:brightness-125 transition-all", children: [_jsx("div", { className: "w-10 h-1 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full", style: {
                                                                    width: `${conf}%`,
                                                                    background: conf >= 80 ? '#00d4ff' : conf >= 55 ? '#eab308' : '#5a6380',
                                                                } }) }), _jsxs("span", { className: "text-[8px] font-mono text-terminal-dim/50 tabular-nums", children: [conf.toFixed(0), "%"] })] }) }), _jsx("td", { className: "px-2 py-2 cursor-pointer hover:brightness-125 transition-all", onClick: cell({ type: 'edge', edge: e }), children: _jsxs("span", { className: "text-[8px] font-mono", style: { color: DISC_COLOR[e.disclosure_type ?? 'INFERRED'] }, children: [DISC_ICON[e.disclosure_type ?? 'INFERRED'], " ", e.disclosure_type ?? '—'] }) })] }, e.id));
                                }) })] }), filtered.length === 0 && (_jsx("div", { className: "flex items-center justify-center h-20 text-terminal-dim/30 font-mono text-[11px]", children: search ? `No matches for "${search}"` : `No ${direction === 'ALL' ? '' : direction.toLowerCase() + ' '}relationships` }))] })] }));
}
