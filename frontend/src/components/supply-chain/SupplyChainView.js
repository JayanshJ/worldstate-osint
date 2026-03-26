import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * SupplyChainView — Bloomberg SPLC-inspired supply chain analysis.
 *
 * Data source: SEC EDGAR (100% free, no API key).
 * LLM extraction uses the existing OpenAI key already in the stack.
 *
 * Flow:
 *   1. User types a ticker (e.g. AAPL) and hits Analyse
 *   2. POST /api/v1/splc/{ticker} triggers EDGAR download + LLM extraction (~15-30s)
 *   3. Results cached in PostgreSQL; subsequent loads are instant
 *   4. Toggle between GRAPH view and TABLE view
 *   5. Click any node / row → evidence drawer slides in from right
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, AlertTriangle, X, GitBranch, Table2, Trash2, RefreshCw, BarChart2, } from 'lucide-react';
import { api } from '@/lib/api';
import { SCGraph } from './SCGraph';
import { SCTable } from './SCTable';
import { SCIntel } from './SCIntel';
import { cn } from '@/lib/utils';
// ─── Formatting helpers ───────────────────────────────────────────────────
function fmtMarketCap(v) {
    if (v == null)
        return '—';
    if (v >= 1e12)
        return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9)
        return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6)
        return `$${(v / 1e6).toFixed(1)}M`;
    return `$${v.toLocaleString()}`;
}
function fmtPrice(v) {
    if (v == null)
        return '—';
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNumber(v) {
    if (v == null)
        return '—';
    return v.toLocaleString();
}
function fmtPct(v, suffix = '%') {
    if (v == null)
        return '—';
    return `${v.toFixed(2)}${suffix}`;
}
// ─── Profile fetch hook ───────────────────────────────────────────────────
function useNodeProfile(ticker) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!ticker) {
            setProfile(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        api.company.get(ticker).then(p => {
            if (!cancelled) {
                setProfile(p);
                setLoading(false);
            }
        }).catch(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [ticker]);
    return { profile, loading };
}
// ─── Events fetch hook ────────────────────────────────────────────────────
function useNodeEvents(query) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!query) {
            setEvents([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        api.search.query(query, 'keyword', 10).then(res => {
            if (!cancelled) {
                setEvents(res.cluster_hits);
                setLoading(false);
            }
        }).catch(() => { if (!cancelled)
            setLoading(false); });
        return () => { cancelled = true; };
    }, [query]);
    return { events, loading };
}
// ─── Live Entity Research hook ────────────────────────────────────────────
function useLiveResearch(name, type) {
    const [research, setResearch] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!name) {
            setResearch(null);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        api.research.entity(name, type ?? undefined)
            .then(res => {
            if (!cancelled) {
                setResearch(res);
                setLoading(false);
            }
        })
            .catch(err => {
            if (!cancelled) {
                setError(err.message);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [name, type]);
    return { research, loading, error };
}
// ─── Event Deep Dive hook ─────────────────────────────────────────────────
function useEventDeepDive(id) {
    const [cluster, setCluster] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!id) {
            setCluster(null);
            setAnalysis(null);
            setError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([
            api.clusters.get(id),
            api.clusters.deepdive(id).catch(err => {
                console.error("Deep dive failed:", err);
                return { analysis: "Analysis generation failed. Please try again later." };
            })
        ]).then(([cRes, aRes]) => {
            if (!cancelled) {
                setCluster(cRes);
                setAnalysis(aRes.analysis);
                setLoading(false);
            }
        }).catch(err => {
            if (!cancelled) {
                setError(err.message);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [id]);
    return { cluster, analysis, loading, error };
}
// ─── Corporate meta nodes ─────────────────────────────────────────────────
function buildMetaNodes(profile) {
    const shareholders = [
        ...profile.shareholders.institutions.slice(0, 6),
        ...profile.shareholders.mutual_funds.slice(0, 4),
    ].map((sh, i) => ({
        id: `sh-${i}-${sh.name}`,
        entity_name: sh.name,
        entity_ticker: null,
        direction: 'SHAREHOLDER',
        relationship_type: sh.type,
        tier: null,
        pct_revenue: sh.pct_held,
        pct_cogs: null,
        sole_source: false,
        disclosure_type: 'DISCLOSED',
        confidence: 1,
        evidence: null,
        hq_country: null,
        as_of_date: sh.date_reported ?? null,
    }));
    const board = profile.board.slice(0, 10).map((m, i) => ({
        id: `bd-${i}-${m.name}`,
        entity_name: m.name,
        entity_ticker: null,
        direction: 'BOARD',
        relationship_type: m.title,
        tier: null,
        pct_revenue: null,
        pct_cogs: null,
        sole_source: false,
        disclosure_type: 'DISCLOSED',
        confidence: 1,
        evidence: m.bio ?? null,
        hq_country: null,
        as_of_date: null,
    }));
    // Deduplicate analysts by firm, keep most recent rating
    const firmMap = new Map();
    for (const r of profile.analysts.recent) {
        if (!firmMap.has(r.firm) || r.date > firmMap.get(r.firm).date)
            firmMap.set(r.firm, r);
    }
    const analysts = Array.from(firmMap.values()).slice(0, 10).map((r, i) => ({
        id: `an-${i}-${r.firm}`,
        entity_name: r.firm,
        entity_ticker: null,
        direction: 'ANALYST',
        relationship_type: r.rating, // 'BUY' | 'HOLD' | 'SELL'
        tier: null,
        pct_revenue: null,
        pct_cogs: null,
        sole_source: false,
        disclosure_type: 'DISCLOSED',
        confidence: 1,
        evidence: `${r.action}: ${r.from_grade} → ${r.to_grade}`,
        hq_country: null,
        as_of_date: r.date,
    }));
    const industries = profile.industries.map((ind, i) => ({
        id: `ind-${i}-${ind.label}`,
        entity_name: ind.label,
        entity_ticker: null,
        direction: 'INDUSTRY',
        relationship_type: ind.type,
        tier: null,
        pct_revenue: null,
        pct_cogs: null,
        sole_source: false,
        disclosure_type: 'DISCLOSED',
        confidence: 1,
        evidence: null,
        hq_country: null,
        as_of_date: null,
    }));
    return [...shareholders, ...board, ...analysts, ...industries];
}
// ─── Colour map (mirrors SCGraph) ─────────────────────────────────────────
const DIR_COLOR = {
    UPSTREAM: '#00c896', DOWNSTREAM: '#f59e0b', COMPETITOR: '#818cf8',
    SHAREHOLDER: '#eab308', BOARD: '#e879f9', ANALYST: '#a78bfa',
    INDUSTRY: '#06b6d4',
};
// ─── Dedup helper ─────────────────────────────────────────────────────────
// Collapses duplicate names within a direction group.
// BOARD uses first+last name key so 'Tim Cook' == 'Timothy D. Cook'.
function dedupNodes(nodes, dir) {
    const norm = (s) => s.toLowerCase().replace(/[,\.;:'"()]/g, '').replace(/\s+/g, ' ').trim();
    const personKey = (s) => {
        const parts = norm(s).split(' ').filter(p => p.length > 1 && !p.endsWith('.'));
        return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : norm(s);
    };
    const seen = new Map();
    for (const n of nodes) {
        const k = dir === 'BOARD' ? personKey(n.entity_name) : norm(n.entity_name);
        const prev = seen.get(k);
        if (!prev || (n.confidence ?? 0) > (prev.confidence ?? 0))
            seen.set(k, n);
    }
    return Array.from(seen.values());
}
// ─── Hub / category drawer ────────────────────────────────────────────────
function HubDrawer({ dir, label, nodes, onClose, onNodeClick }) {
    const color = DIR_COLOR[dir] ?? '#00d4ff';
    const isMeta = ['SHAREHOLDER', 'BOARD', 'ANALYST', 'INDUSTRY'].includes(dir);
    const dedupedNodes = dedupNodes(nodes, dir);
    return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: color } }), _jsx("span", { className: "font-mono font-bold text-sm", style: { color }, children: label }), _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim", children: ["(", dedupedNodes.length, ")"] })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1", children: dedupedNodes.map(n => {
                    const sub = n.relationship_type?.replace(/_/g, ' ') ?? '';
                    const pct = n.pct_revenue ?? n.pct_cogs ?? 0;
                    return (_jsxs("button", { onClick: () => onNodeClick?.(n), className: "w-full flex items-center justify-between px-3 py-2 rounded-sm text-left hover:brightness-125 transition-all cursor-pointer", style: { background: '#ffffff06', border: `0.5px solid ${color}30` }, children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[10px] font-mono font-bold text-terminal-text truncate", style: { color: color + 'dd' }, children: n.entity_name }), sub && (_jsx("div", { className: "text-[8px] font-mono text-terminal-dim/60 truncate mt-0.5", children: sub }))] }), _jsxs("div", { className: "flex items-center gap-1 flex-shrink-0 ml-2", children: [pct > 0 && (_jsxs("span", { className: "text-[9px] font-mono", style: { color }, children: [pct.toFixed(1), "%"] })), n.hq_country && (_jsx("span", { className: "text-[8px] font-mono text-terminal-dim/50", children: n.hq_country })), !isMeta && n.tier === 2 && (_jsx("span", { className: "text-[7px] font-mono text-terminal-dim/40", children: "T2" })), _jsx("span", { className: "text-[8px] text-terminal-dim/30 ml-1", children: "\u2192" })] })] }, n.id));
                }) })] }));
}
// ─── Focal / company drawer ───────────────────────────────────────────────
function FocalDrawer({ company, edges, onClose }) {
    const { profile, loading: profileLoading } = useNodeProfile(company.ticker);
    const upstream = edges.filter(e => e.direction === 'UPSTREAM').length;
    const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length;
    const competitor = edges.filter(e => e.direction === 'COMPETITOR').length;
    const shareholder = edges.filter(e => e.direction === 'SHAREHOLDER').length;
    const board = edges.filter(e => e.direction === 'BOARD').length;
    const analyst = edges.filter(e => e.direction === 'ANALYST').length;
    const industry = edges.filter(e => e.direction === 'INDUSTRY').length;
    return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-[#00d4ff]" }), _jsx("span", { className: "font-mono font-bold text-sm text-[#00d4ff]", children: company.ticker }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim truncate max-w-[180px]", children: company.legal_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            { label: 'TICKER', value: company.ticker },
                            { label: 'EXCHANGE', value: profile?.exchange ?? '—' },
                            { label: 'SECTOR', value: company.sector ?? '—' },
                            { label: 'SIC CODE', value: company.sic_code ? `SIC ${company.sic_code}` : '—' },
                        ].map(({ label, value }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text", children: value })] }, label))) }), profileLoading && (_jsxs("div", { className: "flex items-center gap-2 py-2", children: [_jsx(Loader2, { size: 10, className: "animate-spin text-terminal-accent" }), _jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: "Loading market data\u2026" })] })), profile && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-2", children: "MARKET DATA" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                                            { label: 'MARKET CAP', value: fmtMarketCap(profile.market_cap), style: { color: '#00d4ff' } },
                                            { label: 'PRICE', value: fmtPrice(profile.current_price), style: { color: '#22c55e' } },
                                            { label: 'P/E RATIO', value: profile.pe_ratio?.toFixed(1) ?? '—' },
                                            { label: 'FORWARD P/E', value: profile.forward_pe?.toFixed(1) ?? '—' },
                                            { label: 'BETA', value: profile.beta?.toFixed(2) ?? '—' },
                                            { label: 'EMPLOYEES', value: fmtNumber(profile.employees) },
                                            { label: 'DIV YIELD', value: profile.dividend_yield > 0 ? fmtPct(profile.dividend_yield) : '—' },
                                            { label: 'COUNTRY', value: profile.country || '—' },
                                        ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text", style: style, children: value })] }, label))) })] }), profile.fifty_two_week_low != null && profile.fifty_two_week_high != null && profile.current_price != null && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: "52-WEEK RANGE" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: fmtPrice(profile.fifty_two_week_low) }), _jsxs("div", { className: "flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden relative", children: [_jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400", style: { width: '100%', opacity: 0.3 } }), _jsx("div", { className: "absolute top-0 h-full w-1 bg-[#00d4ff] rounded-full", style: { left: `${Math.min(100, Math.max(0, ((profile.current_price - profile.fifty_two_week_low) / (profile.fifty_two_week_high - profile.fifty_two_week_low)) * 100))}%` } })] }), _jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: fmtPrice(profile.fifty_two_week_high) })] })] })), profile.description && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: "DESCRIPTION" }), _jsxs("p", { className: "text-[9px] font-mono text-terminal-dim/70 leading-relaxed", children: [profile.description.slice(0, 300), profile.description.length > 300 ? '…' : ''] })] }))] })), _jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-2", children: "RELATIONSHIPS MAPPED" }), _jsx("div", { className: "grid grid-cols-2 gap-1.5", children: [
                                    { label: 'Suppliers', count: upstream, color: '#00c896' },
                                    { label: 'Customers', count: downstream, color: '#f59e0b' },
                                    { label: 'Peers', count: competitor, color: '#818cf8' },
                                    { label: 'Shareholders', count: shareholder, color: '#eab308' },
                                    { label: 'Board', count: board, color: '#e879f9' },
                                    { label: 'Analysts', count: analyst, color: '#a78bfa' },
                                    { label: 'Industries', count: industry, color: '#06b6d4' },
                                ].filter(r => r.count > 0).map(({ label, count, color }) => (_jsxs("div", { className: "flex items-center justify-between px-3 py-1.5 rounded-sm", style: { background: color + '0d', border: `0.5px solid ${color}30` }, children: [_jsx("span", { className: "text-[9px] font-mono", style: { color: color + 'cc' }, children: label }), _jsx("span", { className: "text-[11px] font-mono font-bold", style: { color }, children: count })] }, label))) })] })] })] }));
}
// ─── Risk helpers ─────────────────────────────────────────────────────────
function riskLevel(e) {
    const exp = e.pct_revenue ?? e.pct_cogs ?? 0;
    if (e.sole_source || exp >= 20)
        return { level: 'HIGH', color: '#ef4444' };
    if (exp >= 10)
        return { level: 'MEDIUM', color: '#f97316' };
    if (exp > 0)
        return { level: 'LOW', color: '#22c55e' };
    return { level: 'NONE', color: '#5a6380' };
}
// ─── Evidence drawer ─────────────────────────────────────────────────────
function EvidenceDrawer({ edge, onClose }) {
    const isShareholder = edge.direction === 'SHAREHOLDER';
    const isBoard = edge.direction === 'BOARD';
    const isMeta = isShareholder || isBoard;
    const metaColor = isShareholder ? '#eab308' : isBoard ? '#e879f9' : undefined;
    const { level, color } = isMeta ? { level: '—', color: metaColor } : riskLevel(edge);
    // Shareholder drawer
    if (isShareholder) {
        const pct = edge.pct_revenue ?? 0;
        const holderType = edge.relationship_type === 'MUTUAL_FUND' ? 'Mutual Fund' : 'Institution';
        return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: color } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]", children: edge.entity_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                                { label: 'TYPE', value: holderType },
                                { label: 'OWNERSHIP', value: pct > 0 ? `${pct.toFixed(2)}%` : '—', style: { color: '#eab308' } },
                            ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", style: style, children: value })] }, label))) }), pct > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: "OWNERSHIP STAKE" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full", style: { width: `${Math.min(pct * 5, 100)}%`, background: '#eab308' } }) }), _jsxs("span", { className: "text-[10px] font-mono text-terminal-dim", children: [pct.toFixed(2), "%"] })] })] }))] })] }));
    }
    // Board member drawer
    if (isBoard) {
        const title = (edge.relationship_type ?? '').replace(/_/g, ' ');
        return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: color } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]", children: edge.entity_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                                { label: 'ROLE', value: title || '—' },
                                { label: 'BOARD', value: 'Member' },
                            ].map(({ label, value }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", children: value })] }, label))) }), edge.evidence && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1.5", children: "BIO" }), _jsx("p", { className: "text-[10px] font-mono text-terminal-dim leading-relaxed", children: edge.evidence })] }))] })] }));
    }
    // Analyst drawer
    if (edge.direction === 'ANALYST') {
        const ratingColor = { BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#ef4444' }[edge.relationship_type ?? ''] ?? '#a78bfa';
        return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: ratingColor } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]", children: edge.entity_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            { label: 'FIRM', value: edge.entity_name },
                            { label: 'RATING', value: edge.relationship_type ?? '—', style: { color: ratingColor } },
                            { label: 'DATE', value: edge.as_of_date ?? '—' },
                            ...(edge.evidence ? [{ label: 'ACTION', value: edge.evidence }] : []),
                        ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", style: style, children: value })] }, label))) }) })] }));
    }
    // Industry drawer
    if (edge.direction === 'INDUSTRY') {
        return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: '#06b6d4' } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]", children: edge.entity_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            { label: 'CLASSIFICATION', value: (edge.relationship_type ?? '').replace('GICS_', '').replace(/_/g, ' ') || '—' },
                            { label: 'LABEL', value: edge.entity_name },
                        ].map(({ label, value }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", children: value })] }, label))) }) })] }));
    }
    // Standard supply chain drawer
    return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: color } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[240px]", children: edge.entity_name })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4", children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            { label: 'DIRECTION', value: edge.direction },
                            { label: 'TYPE', value: (edge.relationship_type ?? '—').replace('_', ' ') },
                            { label: 'RISK LEVEL', value: level, style: { color } },
                            { label: 'TIER', value: `Tier ${edge.tier ?? 1}` },
                            { label: 'COUNTRY', value: edge.hq_country ?? '—' },
                            { label: 'SOLE SOURCE', value: edge.sole_source ? 'YES ⚠' : 'No',
                                style: edge.sole_source ? { color: '#ef4444' } : undefined },
                            ...(edge.pct_revenue != null ? [{ label: 'REV EXPOSURE', value: `${edge.pct_revenue.toFixed(1)}%`, style: { color: '#22c55e' } }] : []),
                            ...(edge.pct_cogs != null ? [{ label: 'COGS EXPOSURE', value: `${edge.pct_cogs.toFixed(1)}%`, style: { color: '#0ea5e9' } }] : []),
                        ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", style: style, children: value })] }, label))) }), _jsxs("div", { children: [_jsxs("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: ["CONFIDENCE \u00B7 ", edge.disclosure_type ?? '—'] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all", style: {
                                                width: `${((edge.confidence ?? 1) * 100).toFixed(0)}%`,
                                                background: color,
                                            } }) }), _jsxs("span", { className: "text-[10px] font-mono text-terminal-dim", children: [((edge.confidence ?? 1) * 100).toFixed(0), "%"] })] })] }), edge.evidence && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1.5", children: "EVIDENCE FROM FILING" }), _jsxs("blockquote", { className: "border-l-2 border-terminal-accent/40 pl-3 text-[10px] font-mono text-terminal-dim leading-relaxed italic", children: ["\"", edge.evidence, "\""] })] })), edge.as_of_date && (_jsxs("div", { className: "text-[9px] font-mono text-terminal-dim/50", children: ["As of ", edge.as_of_date] }))] })] }));
}
// ─── Country drawer ───────────────────────────────────────────────────────
const ALPHA3_TO_2 = {
    TWN: 'TW', CHN: 'CN', USA: 'US', KOR: 'KR', JPN: 'JP',
    DEU: 'DE', GBR: 'GB', IND: 'IN', NLD: 'NL', IRL: 'IE',
    SGP: 'SG', MYS: 'MY', VNM: 'VN', THA: 'TH', PHL: 'PH',
    MEX: 'MX', BRA: 'BR', CAN: 'CA', AUS: 'AU', FRA: 'FR',
    ITA: 'IT', CHE: 'CH', SWE: 'SE', ISR: 'IL', NOR: 'NO',
    FIN: 'FI', DNK: 'DK', AUT: 'AT', BEL: 'BE', HKG: 'HK',
};
const HIGH_GEO_RISK = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN']);
const MED_GEO_RISK = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE']);
function flagEmoji(alpha3) {
    const a2 = ALPHA3_TO_2[alpha3];
    if (!a2)
        return '🌐';
    return a2.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}
function CountryDrawer({ country, edges, onClose, onNodeClick }) {
    const geoRisk = HIGH_GEO_RISK.has(country) ? 'HIGH' : MED_GEO_RISK.has(country) ? 'MEDIUM' : 'LOW';
    const geoColor = geoRisk === 'HIGH' ? '#ef4444' : geoRisk === 'MEDIUM' ? '#f97316' : '#22c55e';
    const groups = [
        { label: 'SUPPLIERS', dir: 'UPSTREAM', color: '#00c896', items: edges.filter(e => e.direction === 'UPSTREAM') },
        { label: 'CUSTOMERS', dir: 'DOWNSTREAM', color: '#f59e0b', items: edges.filter(e => e.direction === 'DOWNSTREAM') },
        { label: 'COMPETITORS', dir: 'COMPETITOR', color: '#818cf8', items: edges.filter(e => e.direction === 'COMPETITOR') },
        { label: 'SHAREHOLDERS', dir: 'SHAREHOLDER', color: '#eab308', items: edges.filter(e => e.direction === 'SHAREHOLDER') },
        { label: 'OTHER', dir: 'OTHER', color: '#5a6380', items: edges.filter(e => !['UPSTREAM', 'DOWNSTREAM', 'COMPETITOR', 'SHAREHOLDER'].includes(e.direction)) },
    ].filter(g => g.items.length > 0);
    return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base leading-none", children: flagEmoji(country) }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text", children: country }), _jsxs("span", { className: `text-[8px] font-mono tracking-widest`, style: { color: geoColor }, children: ["GEO RISK: ", geoRisk] })] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: "COUNTRY" }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text", children: country })] }), _jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: "ENTITIES" }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text", children: edges.length })] })] }), groups.map(g => (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-1.5 mb-1.5", children: [_jsx("div", { className: "w-1.5 h-1.5 rounded-full", style: { background: g.color } }), _jsxs("span", { className: "text-[8px] font-mono tracking-widest", style: { color: g.color }, children: [g.label, " (", g.items.length, ")"] })] }), _jsx("div", { className: "space-y-1", children: g.items.map(n => {
                                    const pct = n.pct_revenue ?? n.pct_cogs ?? 0;
                                    return (_jsxs("button", { onClick: () => onNodeClick?.(n), className: "w-full flex items-center justify-between px-3 py-2 rounded-sm text-left hover:brightness-125 transition-all cursor-pointer", style: { background: '#ffffff06', border: `0.5px solid ${g.color}30` }, children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[10px] font-mono font-bold text-terminal-text truncate", style: { color: g.color + 'dd' }, children: n.entity_name }), n.relationship_type && (_jsx("div", { className: "text-[8px] font-mono text-terminal-dim/60 truncate mt-0.5", children: n.relationship_type.replace(/_/g, ' ') }))] }), _jsxs("div", { className: "flex items-center gap-1 flex-shrink-0 ml-2", children: [pct > 0 && (_jsxs("span", { className: "text-[9px] font-mono", style: { color: g.color }, children: [pct.toFixed(1), "%"] })), _jsx("span", { className: "text-[8px] text-terminal-dim/30 ml-1", children: "\u2192" })] })] }, n.id));
                                }) })] }, g.dir)))] })] }));
}
// ─── Event Detail View ────────────────────────────────────────────────────
function EventDetailView({ eventId, onBack }) {
    const { cluster, analysis, loading, error } = useEventDeepDive(eventId);
    return (_jsxs("div", { className: "flex flex-col h-full bg-terminal-surface relative", children: [_jsxs("div", { className: "p-3 border-b border-terminal-border bg-terminal-accent/5 sticky top-0 z-10 backdrop-blur flex items-center gap-2", children: [_jsx("button", { onClick: onBack, className: "text-terminal-dim hover:text-terminal-text transition-colors p-1", children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "m15 18-6-6 6-6" }) }) }), _jsx("span", { className: "text-[10px] font-mono tracking-widest text-terminal-accent font-bold", children: "EVENT DEEP DIVE" })] }), _jsxs("div", { className: "p-4 overflow-y-auto space-y-6", children: [loading && !cluster && (_jsxs("div", { className: "flex flex-col gap-3 py-6 items-center flex-1 justify-center", children: [_jsx("div", { className: "w-full h-1 bg-terminal-accent/20 rounded overflow-hidden relative", children: _jsx("div", { className: "absolute top-0 left-0 h-full w-1/3 bg-terminal-accent animate-[scan_1.5s_ease-in-out_infinite] shadow-[0_0_8px_rgba(0,212,255,0.8)]" }) }), _jsx("span", { className: "text-[10px] font-mono animate-pulse text-terminal-accent tracking-widest", children: "ANALYZING SOURCES" })] })), error && (_jsx("div", { className: "text-[10px] font-mono text-red-500 bg-red-500/10 p-3 rounded border border-red-500/20", children: error })), cluster && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("h3", { className: "font-mono text-[13px] font-bold text-terminal-text mb-2 leading-snug", children: cluster.label }), _jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsxs("div", { className: cn("px-1.5 py-0.5 rounded font-mono text-[8px] font-bold tracking-widest"), style: { backgroundColor: `${cluster.sentiment > 0 ? '#10b981' : cluster.sentiment < 0 ? '#ef4444' : '#6b7280'}20`, color: cluster.sentiment > 0 ? '#10b981' : cluster.sentiment < 0 ? '#ef4444' : '#6b7280' }, children: ["SENTIMENT: ", cluster.sentiment.toFixed(2)] }), _jsxs("div", { className: "px-1.5 py-0.5 rounded bg-terminal-border font-mono text-[8px] tracking-widest text-terminal-dim", children: ["VOL: ", Math.round(cluster.volatility * 100), "%"] })] }), cluster.bullets && cluster.bullets.length > 0 && (_jsx("ul", { className: "space-y-1 mb-4", children: cluster.bullets.map((b, i) => (_jsxs("li", { className: "text-[10px] font-mono text-terminal-dim/90 flex gap-2 leading-relaxed", children: [_jsx("span", { className: "text-terminal-accent mt-0.5 opacity-70", children: "\u25BA" }), " ", b] }, i))) }))] }), _jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono tracking-widest text-terminal-accent mb-2 border-b border-terminal-accent/20 pb-1", children: "AI DETAILED SUMMARY" }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text leading-[1.6] space-y-3 whitespace-pre-wrap", children: analysis ? analysis : loading ? (_jsxs("div", { className: "space-y-2 py-2", children: [_jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-full" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-11/12" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-5/6" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-full mt-4" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-4/6" })] })) : (_jsx("span", { className: "italic text-terminal-dim/50", children: "Analysis unavailable." })) })] }), _jsxs("div", { children: [_jsxs("div", { className: "text-[9px] font-mono tracking-widest text-terminal-dim mb-2 border-b border-terminal-border/50 pb-1", children: ["SOURCE ARTICLES (", cluster.members.length, ")"] }), _jsx("div", { className: "flex flex-col gap-2", children: cluster.members.map((m) => (_jsxs("a", { href: m.url, target: "_blank", rel: "noopener noreferrer", className: "block p-2 bg-terminal-bg border border-terminal-border hover:border-terminal-accent/50 rounded transition-colors group", children: [_jsx("div", { className: "text-[10px] font-mono font-bold text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-snug mb-1", children: m.title }), _jsxs("div", { className: "flex justify-between items-center text-[8px] font-mono text-terminal-dim", children: [_jsx("span", { children: m.source_id.toUpperCase().replace('_', ' ') }), m.published_at && _jsx("span", { children: new Date(m.published_at).toLocaleDateString() })] })] }, m.article_id))) })] })] }))] })] }));
}
// ─── Entity detail drawer ─────────────────────────────────────────────────
function EntityDetailDrawer({ edge, onClose }) {
    const [drawerTab, setDrawerTab] = useState('profile');
    const [selectedEventId, setSelectedEventId] = useState(null);
    const { profile, loading: profileLoading } = useNodeProfile(edge.entity_ticker);
    // Only query events and live research when the tab is explicitly opened to save API costs
    const { events, loading: eventsLoading } = useNodeEvents(drawerTab === 'events' ? edge.entity_name : null);
    const { research, loading: researchLoading, error: researchError } = useLiveResearch(drawerTab === 'events' ? edge.entity_name : null, edge.relationship_type);
    const { level, color } = riskLevel(edge);
    return (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-full md:w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex flex-col border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full", style: { background: color } }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text truncate max-w-[180px]", title: edge.entity_name, children: edge.entity_name }), edge.entity_ticker && (_jsx("span", { className: "text-[9px] font-mono text-terminal-accent", children: edge.entity_ticker }))] }), _jsx("button", { onClick: onClose, className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "flex px-4 pb-2 gap-4", children: [_jsx("button", { onClick: () => setDrawerTab('profile'), className: cn("text-[10px] font-mono tracking-widest pb-1 border-b-2 transition-colors", drawerTab === 'profile' ? "border-terminal-accent text-terminal-accent" : "border-transparent text-terminal-dim hover:text-terminal-text"), children: "PROFILE" }), _jsx("button", { onClick: () => setDrawerTab('events'), className: cn("text-[10px] font-mono tracking-widest pb-1 border-b-2 transition-colors", drawerTab === 'events' ? "border-terminal-accent text-terminal-accent" : "border-transparent text-terminal-dim hover:text-terminal-text"), children: "EVENTS & NEWS" })] })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4 relative", children: selectedEventId ? (_jsx("div", { className: "absolute inset-0 z-20 bg-terminal-surface", children: _jsx(EventDetailView, { eventId: selectedEventId, onBack: () => setSelectedEventId(null) }) })) : (_jsx(_Fragment, { children: drawerTab === 'profile' ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                                    { label: 'DIRECTION', value: edge.direction },
                                    { label: 'TYPE', value: (edge.relationship_type ?? '—').replace(/_/g, ' ') },
                                    { label: 'RISK LEVEL', value: level, style: { color } },
                                    { label: 'TIER', value: `Tier ${edge.tier ?? 1}` },
                                    { label: 'COUNTRY', value: edge.hq_country ?? '—' },
                                    { label: 'SOLE SOURCE', value: edge.sole_source ? 'YES ⚠' : 'No',
                                        style: edge.sole_source ? { color: '#ef4444' } : undefined },
                                    ...(edge.pct_revenue != null ? [{ label: 'REV EXPOSURE', value: `${edge.pct_revenue.toFixed(1)}%`, style: { color: '#22c55e' } }] : []),
                                    ...(edge.pct_cogs != null ? [{ label: 'COGS EXPOSURE', value: `${edge.pct_cogs.toFixed(1)}%`, style: { color: '#0ea5e9' } }] : []),
                                ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[11px] font-mono text-terminal-text", style: style, children: value })] }, label))) }), profileLoading && (_jsxs("div", { className: "flex items-center gap-2 py-2", children: [_jsx(Loader2, { size: 10, className: "animate-spin text-terminal-accent" }), _jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: "Loading company data\u2026" })] })), profile && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-2", children: "MARKET DATA" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                                                    { label: 'MARKET CAP', value: fmtMarketCap(profile.market_cap), style: { color: '#00d4ff' } },
                                                    { label: 'PRICE', value: fmtPrice(profile.current_price), style: { color: '#22c55e' } },
                                                    { label: 'P/E RATIO', value: profile.pe_ratio?.toFixed(1) ?? '—' },
                                                    { label: 'FORWARD P/E', value: profile.forward_pe?.toFixed(1) ?? '—' },
                                                    { label: 'BETA', value: profile.beta?.toFixed(2) ?? '—' },
                                                    { label: 'EMPLOYEES', value: fmtNumber(profile.employees) },
                                                    { label: 'DIV YIELD', value: profile.dividend_yield > 0 ? fmtPct(profile.dividend_yield) : '—' },
                                                    { label: 'EXCHANGE', value: profile.exchange || '—' },
                                                ].map(({ label, value, style }) => (_jsxs("div", { className: "bg-terminal-surface/50 rounded-sm px-3 py-2", children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-0.5", children: label }), _jsx("div", { className: "text-[10px] font-mono text-terminal-text", style: style, children: value })] }, label))) })] }), profile.fifty_two_week_low != null && profile.fifty_two_week_high != null && profile.current_price != null && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: "52-WEEK RANGE" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: fmtPrice(profile.fifty_two_week_low) }), _jsxs("div", { className: "flex-1 h-1.5 bg-terminal-border rounded-full overflow-hidden relative", children: [_jsx("div", { className: "h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-400", style: { width: '100%', opacity: 0.3 } }), _jsx("div", { className: "absolute top-0 h-full w-1 bg-[#00d4ff] rounded-full", style: { left: `${Math.min(100, Math.max(0, ((profile.current_price - profile.fifty_two_week_low) / (profile.fifty_two_week_high - profile.fifty_two_week_low)) * 100))}%` } })] }), _jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: fmtPrice(profile.fifty_two_week_high) })] })] })), profile.description && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1", children: "DESCRIPTION" }), _jsxs("p", { className: "text-[9px] font-mono text-terminal-dim/70 leading-relaxed", children: [profile.description.slice(0, 300), profile.description.length > 300 ? '…' : ''] })] }))] })), edge.evidence && (_jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-1.5", children: "EVIDENCE FROM FILING" }), _jsxs("blockquote", { className: "border-l-2 border-terminal-accent/40 pl-3 text-[10px] font-mono text-terminal-dim leading-relaxed italic", children: ["\"", edge.evidence, "\""] })] })), edge.as_of_date && (_jsxs("div", { className: "text-[9px] font-mono text-terminal-dim/50", children: ["As of ", edge.as_of_date] }))] })) : (
                    /* Events Tab */
                    _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-terminal-surface/20 border border-terminal-accent/30 rounded-sm overflow-hidden text-left relative", children: [researchLoading && (_jsx("div", { className: "absolute top-0 left-0 w-full h-[2px] bg-terminal-accent/50 shadow-[0_0_8px_rgba(0,212,255,0.8)] animate-[scan_2s_ease-in-out_infinite]" })), _jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-terminal-accent/20 bg-terminal-accent/5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: cn("w-1.5 h-1.5 rounded-full", researchLoading ? "animate-pulse bg-terminal-dim" : research ? "bg-terminal-accent" : "bg-red-400") }), _jsx("span", { className: "text-[9px] font-mono tracking-widest text-terminal-accent", children: "LIVE OSINT INTELLIGENCE" })] }), researchLoading && _jsx("span", { className: "text-[8px] font-mono animate-pulse text-terminal-accent", children: "QUERYING WEB..." })] }), _jsx("div", { className: "p-3", children: researchLoading ? (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-full" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-5/6" }), _jsx("div", { className: "h-2 bg-terminal-surface/50 rounded animate-pulse w-4/6" })] })) : researchError ? (_jsxs("div", { className: "text-[9px] font-mono text-red-400", children: ["Failed to generate live research: ", researchError] })) : research ? (_jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-[10px] font-mono text-terminal-text leading-relaxed", children: research.summary }), research.key_developments.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-1", children: "KEY DEVELOPMENTS" }), _jsx("ul", { className: "space-y-1", children: research.key_developments.map((dev, i) => (_jsxs("li", { className: "text-[9px] font-mono text-terminal-dim/90 flex gap-1.5", children: [_jsx("span", { className: "text-terminal-accent", children: "\u00BB" }), " ", dev] }, i))) })] })), (research.risk_indicators.length > 0 || research.known_affiliations.length > 0) && (_jsxs("div", { className: "grid grid-cols-2 gap-2 border-t border-terminal-border pt-2", children: [research.risk_indicators.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-[8px] font-mono text-red-400 tracking-widest mb-1", children: "RISK FLAGS" }), _jsx("ul", { className: "space-y-0.5", children: research.risk_indicators.map((r, i) => (_jsxs("li", { className: "text-[8px] font-mono text-red-400/80 truncate", title: r, children: ["\u2022 ", r] }, i))) })] })), research.known_affiliations.length > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-[8px] font-mono text-terminal-dim tracking-widest mb-1", children: "AFFILIATIONS" }), _jsx("ul", { className: "space-y-0.5", children: research.known_affiliations.slice(0, 3).map((a, i) => (_jsxs("li", { className: "text-[8px] font-mono text-terminal-dim/70 truncate", title: a, children: ["\u2022 ", a] }, i))) })] }))] }))] })) : (_jsx("div", { className: "text-[9px] font-mono text-terminal-dim/50 italic", children: "No research available." })) })] }), _jsx("div", { className: "text-[9px] font-mono tracking-widest text-terminal-dim border-b border-terminal-border/50 pb-1 mt-4", children: "LOCAL DATABASE MENTIONS" }), eventsLoading && (_jsxs("div", { className: "flex items-center gap-2 py-2", children: [_jsx(Loader2, { size: 10, className: "animate-spin text-terminal-accent" }), _jsx("span", { className: "text-[8px] font-mono text-terminal-dim", children: "Searching internal feed\u2026" })] })), !eventsLoading && events.length === 0 && (_jsxs("p", { className: "text-[9px] font-mono text-terminal-dim/50 leading-relaxed py-2 italic font-medium", children: ["No recent event clusters found for \"", edge.entity_name, "\" in database."] })), !eventsLoading && events.map((ev) => {
                                const sentColor = ev.sentiment > 0.2 ? '#10b981' : ev.sentiment < -0.2 ? '#f87171' : '#6b7280';
                                return (_jsxs("button", { onClick: () => setSelectedEventId(ev.cluster_id), className: "w-full text-left bg-terminal-surface/30 border border-terminal-border rounded-sm p-3 hover:bg-terminal-surface/80 hover:border-terminal-accent/50 transition-colors group", children: [_jsx("div", { className: "text-[11px] font-bold font-mono text-terminal-text group-hover:text-terminal-accent leading-snug mb-2 transition-colors", children: ev.label }), ev.bullets && ev.bullets.length > 0 && (_jsxs("div", { className: "text-[9px] font-mono text-terminal-dim/80 mb-2 truncate", children: ["\u2022 ", ev.bullets[0]] })), _jsxs("div", { className: "flex items-center justify-between text-[9px] font-mono", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { style: { color: sentColor }, children: ["SENT ", (ev.sentiment > 0 ? '+' : '') + ev.sentiment.toFixed(2)] }), _jsxs("span", { className: "text-terminal-dim", children: ["VOL ", Math.round(ev.volatility * 100), "%"] })] }), _jsxs("span", { className: "text-terminal-dim/50 flex flex-col items-end", children: [ev.member_count, " src", _jsxs("span", { className: "text-terminal-accent/0 group-hover:text-terminal-accent/100 transition-opacity flex items-center gap-0.5 mt-1", children: ["DEEP DIVE ", _jsx("svg", { width: "8", height: "8", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("path", { d: "m9 18 6-6-6-6" }) })] })] })] })] }, ev.cluster_id));
                            })] })) })) })] }));
}
// ─── Risk summary bar ─────────────────────────────────────────────────────
function RiskBar({ edges }) {
    const high = edges.filter(e => { const r = riskLevel(e); return r.level === 'HIGH'; }).length;
    const medium = edges.filter(e => { const r = riskLevel(e); return r.level === 'MEDIUM'; }).length;
    const soles = edges.filter(e => e.sole_source).length;
    const upstream = edges.filter(e => e.direction === 'UPSTREAM').length;
    const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length;
    return (_jsxs("div", { className: "flex items-center gap-4 px-4 py-2 border-b border-terminal-border bg-terminal-surface/30 flex-shrink-0 flex-wrap", children: [[
                { label: 'SUPPLIERS', value: upstream, color: '#0ea5e9' },
                { label: 'CUSTOMERS', value: downstream, color: '#22c55e' },
                { label: 'HIGH RISK', value: high, color: '#ef4444' },
                { label: 'MED RISK', value: medium, color: '#f97316' },
                { label: 'SOLE-SOURCE', value: soles, color: '#ef4444' },
            ].map(({ label, value, color }) => (_jsxs("div", { className: "flex items-baseline gap-1.5", children: [_jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: label }), _jsx("span", { className: "text-[13px] font-mono font-bold", style: { color }, children: value })] }, label))), _jsx("div", { className: "ml-auto text-[8px] font-mono text-terminal-dim/40", children: "Wikipedia \u00B7 SEC \u00B7 Model knowledge" })] }));
}
export function SupplyChainView({ initialTicker, onTickerChange }) {
    const [input, setInput] = useState(initialTicker ?? '');
    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [company, setCompany] = useState(null);
    const [edges, setEdges] = useState([]);
    const [tab, setTab] = useState('graph');
    const [selected, setSelected] = useState(null);
    const [analysing, setAnalysing] = useState(false);
    const [prevTickers, setPrevTickers] = useState([]);
    const inputRef = useRef(null);
    const searchRef = useRef(null);
    useEffect(() => {
        api.splc.list().then(setPrevTickers).catch(() => { });
    }, []);
    // Load ticker from URL on mount
    useEffect(() => {
        if (initialTicker)
            load(initialTicker);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Close dropdown on outside click
    useEffect(() => {
        function handler(e) {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    // Debounced search-as-you-type
    const searchTimer = useRef(null);
    function handleInputChange(val) {
        setInput(val);
        if (searchTimer.current)
            clearTimeout(searchTimer.current);
        if (val.trim().length < 1) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }
        searchTimer.current = setTimeout(async () => {
            try {
                const results = await api.splc.search(val.trim());
                setSuggestions(results);
                setShowDropdown(results.length > 0);
            }
            catch { /* backend not running */ }
        }, 250);
    }
    async function load(ticker, autoAnalyseOn404 = true) {
        setInput(ticker);
        setShowDropdown(false);
        setLoading(true);
        setError(null);
        setSelected(null);
        onTickerChange?.(ticker.toUpperCase());
        try {
            const data = await api.splc.get(ticker);
            setCompany(data.company);
            // Silently fetch company profile to inject shareholders + board as nodes
            const allEdges = [...data.edges];
            try {
                const profile = await api.company.get(ticker);
                allEdges.push(...buildMetaNodes(profile));
            }
            catch (profileErr) {
                console.warn('[SPLC] company profile fetch failed:', profileErr);
            }
            setEdges(allEdges);
            setLoading(false);
        }
        catch (e) {
            const msg = e?.message ?? '';
            setLoading(false);
            if (msg.includes('404') && autoAnalyseOn404) {
                // Not in cache — immediately kick off analysis
                await analyse(ticker);
            }
            else if (msg.includes('404')) {
                setCompany(null);
                setEdges([]);
                setError('not_found');
            }
            else {
                setError(String(e));
            }
        }
    }
    async function analyse(ticker) {
        setInput(ticker);
        setShowDropdown(false);
        setAnalysing(true);
        setError(null);
        try {
            await api.splc.analyse(ticker);
            await load(ticker);
            setPrevTickers(await api.splc.list());
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setAnalysing(false);
        }
    }
    // Smart submit: load from cache; if not found, immediately analyse
    async function handleSubmit(e) {
        e.preventDefault();
        const t = input.trim().toUpperCase();
        if (!t)
            return;
        setInput(t);
        setShowDropdown(false);
        setLoading(true);
        setError(null);
        setSelected(null);
        try {
            const data = await api.splc.get(t);
            setCompany(data.company);
            const allEdges = [...data.edges];
            try {
                const profile = await api.company.get(t);
                allEdges.push(...buildMetaNodes(profile));
            }
            catch (profileErr) {
                console.warn('[SPLC] company profile fetch failed:', profileErr);
            }
            setEdges(allEdges);
            setLoading(false);
        }
        catch (e) {
            const msg = e?.message ?? '';
            setLoading(false);
            if (msg.includes('404')) {
                // Auto-trigger analysis if not cached
                await analyse(t);
            }
            else {
                setError(String(e));
            }
        }
    }
    function pickSuggestion(s) {
        setInput(s.ticker);
        setSuggestions([]);
        setShowDropdown(false);
        load(s.ticker);
    }
    async function handleDelete(ticker) {
        await api.splc.remove(ticker);
        setPrevTickers(await api.splc.list());
        if (company?.ticker === ticker) {
            setCompany(null);
            setEdges([]);
            onTickerChange?.(null);
        }
    }
    const busy = loading || analysing;
    return (_jsxs("div", { className: "flex h-full w-full bg-terminal-bg overflow-hidden relative", children: [_jsxs("div", { className: "hidden md:flex w-[180px] flex-shrink-0 border-r border-terminal-border flex-col bg-terminal-surface/30 z-10", children: [_jsx("div", { className: "px-3 py-2.5 border-b border-terminal-border", children: _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: "ANALYSED" }) }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: [prevTickers.length === 0 && (_jsx("p", { className: "text-[9px] font-mono text-terminal-dim/40 p-3 leading-relaxed", children: "No tickers yet." })), prevTickers.map(c => (_jsxs("div", { className: cn('flex items-center justify-between px-3 py-2 group cursor-pointer hover:bg-terminal-muted/30 transition-colors', company?.ticker === c.ticker && 'bg-terminal-accent/10 border-l-2 border-terminal-accent'), onClick: () => load(c.ticker), children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "text-[10px] font-mono font-bold text-terminal-text", children: c.ticker }), _jsx("div", { className: "text-[8px] font-mono text-terminal-dim/60 truncate", children: c.legal_name ?? c.ticker })] }), _jsx("button", { onClick: ev => { ev.stopPropagation(); handleDelete(c.ticker); }, className: "opacity-0 group-hover:opacity-100 text-terminal-dim hover:text-red-400 transition-all flex-shrink-0 ml-1", children: _jsx(Trash2, { size: 10 }) })] }, c.ticker)))] })] }), _jsxs("div", { className: "flex-1 flex flex-col min-w-0 overflow-hidden", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-terminal-border bg-terminal-surface/20 flex-shrink-0", children: [_jsxs("form", { onSubmit: handleSubmit, className: "flex items-center gap-2 flex-1 min-w-0", ref: searchRef, children: [_jsxs("div", { className: "relative flex-1 max-w-[420px]", children: [_jsx(Search, { size: 12, className: "absolute left-3 top-1/2 -translate-y-1/2 text-terminal-dim pointer-events-none" }), _jsx("input", { ref: inputRef, value: input, onChange: e => handleInputChange(e.target.value), onFocus: () => suggestions.length > 0 && setShowDropdown(true), placeholder: "Ticker or company name \u2014 e.g. AAPL or Apple", autoComplete: "off", className: "w-full pl-8 pr-3 py-1.5 bg-terminal-bg border border-terminal-border rounded-sm font-mono text-xs text-terminal-text placeholder:text-terminal-dim/40 focus:outline-none focus:border-terminal-accent/60" }), _jsx(AnimatePresence, { children: showDropdown && suggestions.length > 0 && (_jsx(motion.div, { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.1 }, className: "absolute top-full left-0 right-0 mt-0.5 bg-terminal-surface border border-terminal-border rounded-sm shadow-lg z-50 overflow-hidden", children: suggestions.map(s => (_jsxs("button", { type: "button", onClick: () => pickSuggestion(s), className: "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-terminal-muted/40 transition-colors", children: [_jsx("span", { className: "text-[11px] font-mono font-bold text-terminal-accent w-14 flex-shrink-0", children: s.ticker }), _jsx("span", { className: "text-[10px] font-mono text-terminal-dim truncate", children: s.name })] }, s.ticker))) })) })] }), _jsxs("button", { type: "submit", disabled: busy, className: "flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono tracking-widest bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm hover:bg-terminal-accent/25 transition-colors disabled:opacity-50 flex-shrink-0", children: [busy
                                                ? _jsx(Loader2, { size: 11, className: "animate-spin" })
                                                : _jsx(GitBranch, { size: 11 }), analysing ? 'ANALYSING…' : loading ? 'LOADING…' : 'ANALYSE'] })] }), company && (_jsx("div", { className: "flex items-center gap-1", children: ([
                                    { id: 'graph', icon: GitBranch, label: 'GRAPH' },
                                    { id: 'table', icon: Table2, label: 'TABLE' },
                                    { id: 'intel', icon: BarChart2, label: 'INTEL' },
                                ]).map(({ id, icon: Icon, label }) => (_jsxs("button", { onClick: () => setTab(id), className: cn('flex items-center gap-1.5 text-[9px] font-mono tracking-widest px-2.5 py-1 rounded-sm transition-colors border', tab === id
                                        ? 'bg-terminal-accent/15 text-terminal-accent border-terminal-accent/30'
                                        : 'text-terminal-dim border-transparent hover:text-terminal-text'), children: [_jsx(Icon, { size: 10 }), _jsx("span", { className: "hidden sm:inline", children: label })] }, id))) })), company && (_jsxs("div", { className: "hidden sm:flex items-center gap-2 ml-auto", children: [_jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-[11px] font-mono font-bold text-terminal-text", children: company.ticker }), _jsx("div", { className: "text-[8px] font-mono text-terminal-dim/60 max-w-[150px] truncate", children: company.legal_name ?? company.sector ?? '' })] }), _jsx("button", { onClick: () => analyse(company.ticker), disabled: busy, title: "Re-analyse from latest 10-K", className: "text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-50", children: _jsx(RefreshCw, { size: 12, className: analysing ? 'animate-spin' : '' }) })] }))] }), edges.length > 0 && _jsx(RiskBar, { edges: edges }), _jsxs("div", { className: "flex flex-1 min-h-0 overflow-hidden", children: [_jsxs("div", { className: "flex-1 min-w-0 overflow-hidden flex flex-col", children: [busy && (_jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-4 z-20 bg-terminal-bg/80 backdrop-blur-sm", children: [_jsx(Loader2, { size: 28, className: "animate-spin text-terminal-accent" }), _jsxs("div", { className: "text-center space-y-1", children: [_jsx("p", { className: "font-mono text-sm text-terminal-text", children: analysing ? 'Analysing supply chain…' : 'Loading…' }), analysing && (_jsxs("div", { className: "font-mono text-[9px] text-terminal-dim space-y-0.5 mt-2", children: [_jsx("p", { className: "text-terminal-accent/70", children: "\u2460 Resolving company via SEC EDGAR" }), _jsx("p", { className: "text-terminal-dim/60", children: "\u2461 Fetching Wikipedia supply chain article" }), _jsx("p", { className: "text-terminal-dim/60", children: "\u2462 Fetching Wikipedia company article" }), _jsx("p", { className: "text-terminal-dim/60", children: "\u2463 Fetching SEC 10-K for context" }), _jsx("p", { className: "text-terminal-dim/60", children: "\u2464 LLM extracting all named relationships" }), _jsx("p", { className: "text-terminal-dim/60", children: "\u2465 Saving to database" }), _jsx("p", { className: "text-terminal-dim/30 mt-2", children: "~20\u201345 s \u00B7 Wikipedia + SEC + model knowledge" })] }))] })] })), !busy && error === 'not_found' && input && (_jsx("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none", children: _jsxs("div", { className: "text-center pointer-events-auto", children: [_jsxs("p", { className: "font-mono text-sm text-terminal-text mb-1", children: ["Not yet analysed: ", _jsx("span", { className: "text-terminal-accent", children: input })] }), _jsx("p", { className: "font-mono text-[10px] text-terminal-dim mb-4", children: "Sources: Wikipedia \u00B7 SEC 10-K \u00B7 model knowledge" }), _jsxs("button", { onClick: () => analyse(input), className: "flex items-center gap-2 px-4 py-2 bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm font-mono text-xs tracking-widest hover:bg-terminal-accent/25 transition-colors", children: [_jsx(GitBranch, { size: 13 }), "ANALYSE ", input] }), _jsx("p", { className: "font-mono text-[9px] text-terminal-dim/40 mt-3", children: "Wikipedia + SEC 10-K + model knowledge \u00B7 ~15\u201330s" })] }) })), !busy && error && error !== 'not_found' && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center z-10 pointer-events-none", children: _jsxs("div", { className: "flex items-center gap-2 text-red-400 font-mono text-sm pointer-events-auto", children: [_jsx(AlertTriangle, { size: 16 }), error] }) })), !busy && !error && !company && (_jsx("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8 z-10 pointer-events-none", children: _jsxs("div", { className: "pointer-events-auto flex flex-col items-center gap-4", children: [_jsx(GitBranch, { size: 36, className: "text-terminal-dim/20" }), _jsxs("div", { children: [_jsx("p", { className: "font-mono text-sm text-terminal-text mb-1", children: "Supply Chain Analysis" }), _jsx("p", { className: "font-mono text-[10px] text-terminal-dim max-w-xs leading-relaxed", children: "Enter any ticker to map named suppliers, customers and competitors using Wikipedia, SEC filings, and model knowledge." })] }), prevTickers.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-2 justify-center mt-2", children: prevTickers.slice(0, 6).map(c => (_jsx("button", { onClick: () => load(c.ticker), className: "text-[9px] font-mono px-2 py-1 border border-terminal-border rounded-sm text-terminal-dim hover:text-terminal-accent hover:border-terminal-accent/40 transition-colors", children: c.ticker }, c.ticker))) }))] }) })), !busy && !error && company && edges.length === 0 && (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center gap-4 text-center px-8", children: [_jsx(AlertTriangle, { size: 28, className: "text-yellow-400/50" }), _jsxs("div", { children: [_jsxs("p", { className: "font-mono text-sm text-terminal-text mb-1", children: ["No relationships extracted for ", _jsx("span", { className: "text-terminal-accent", children: company.ticker })] }), _jsx("p", { className: "font-mono text-[10px] text-terminal-dim mb-4 max-w-xs leading-relaxed", children: "No named suppliers or customers were found. The 10-K may use generic language (\"contract manufacturers\") without naming companies. Re-analyse to try the updated extraction prompt." }), _jsxs("button", { onClick: () => analyse(company.ticker), disabled: analysing, className: "flex items-center gap-2 mx-auto px-4 py-2 bg-terminal-accent/15 text-terminal-accent border border-terminal-accent/30 rounded-sm font-mono text-xs tracking-widest hover:bg-terminal-accent/25 transition-colors disabled:opacity-50", children: [_jsx(RefreshCw, { size: 12, className: analysing ? 'animate-spin' : '' }), "RE-ANALYSE ", company.ticker] })] })] })), !busy && !error && company && edges.length > 0 && (_jsx("div", { className: "flex-1 overflow-hidden", children: tab === 'graph' ? (_jsx("div", { className: "h-full w-full", children: _jsx(SCGraph, { ticker: company.ticker, legalName: company.legal_name ?? company.ticker, edges: edges, onNodeClick: e => setSelected({ kind: 'entity', edge: e }), onHubClick: (dir, label, nodes) => setSelected({ kind: 'hub', dir, label, nodes }), onFocalClick: () => setSelected({ kind: 'focal', company, edges }) }) })) : tab === 'table' ? (_jsx(SCTable, { edges: edges, onRowClick: e => setSelected({ kind: 'edge', edge: e }), onCellClick: ev => {
                                                switch (ev.type) {
                                                    case 'entity':
                                                        setSelected({ kind: 'entity', edge: ev.edge });
                                                        break;
                                                    case 'direction': {
                                                        const dirLabel = ev.direction === 'UPSTREAM' ? 'SUPPLIERS'
                                                            : ev.direction === 'DOWNSTREAM' ? 'CUSTOMERS'
                                                                : ev.direction === 'COMPETITOR' ? 'COMPETITORS'
                                                                    : ev.direction;
                                                        setSelected({ kind: 'hub', dir: ev.direction, label: dirLabel, nodes: ev.edges });
                                                        break;
                                                    }
                                                    case 'country':
                                                        setSelected({ kind: 'country', country: ev.country, edges: ev.edges });
                                                        break;
                                                    case 'edge':
                                                        setSelected({ kind: 'edge', edge: ev.edge });
                                                        break;
                                                }
                                            } })) : (_jsx(SCIntel, { company: company, edges: edges })) }))] }), _jsxs(AnimatePresence, { children: [selected?.kind === 'edge' && (_jsx(EvidenceDrawer, { edge: selected.edge, onClose: () => setSelected(null) }, selected.edge.id)), selected?.kind === 'hub' && (_jsx(HubDrawer, { dir: selected.dir, label: selected.label, nodes: selected.nodes, onClose: () => setSelected(null), onNodeClick: e => setSelected({ kind: 'entity', edge: e }) }, `hub-${selected.dir}`)), selected?.kind === 'country' && (_jsx(CountryDrawer, { country: selected.country, edges: selected.edges, onClose: () => setSelected(null), onNodeClick: e => setSelected({ kind: 'entity', edge: e }) }, `country-${selected.country}`)), selected?.kind === 'entity' && (_jsx(EntityDetailDrawer, { edge: selected.edge, onClose: () => setSelected(null) }, `entity-${selected.edge.id}`)), selected?.kind === 'focal' && (_jsx(FocalDrawer, { company: selected.company, edges: selected.edges, onClose: () => setSelected(null) }, "focal"))] })] })] })] }));
}
