import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SCIntel — Supply Chain Intelligence Dashboard
 *
 * Four panels shown on the INTEL tab:
 *   1. Risk Scorecard   — overall SC risk score with sub-scores
 *   2. Geo Exposure     — country breakdown with flag + risk tier
 *   3. Concentration    — ranked bar chart by revenue/COGS exposure %
 *   4. SC News          — live articles mentioning the company + named suppliers
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Globe, BarChart2, Newspaper } from 'lucide-react';
import { api } from '@/lib/api';
// ─── Country helpers ──────────────────────────────────────────────────────
const ALPHA3_TO_2 = {
    TWN: 'TW', CHN: 'CN', USA: 'US', KOR: 'KR', JPN: 'JP',
    DEU: 'DE', GBR: 'GB', IND: 'IN', NLD: 'NL', IRL: 'IE',
    SGP: 'SG', MYS: 'MY', VNM: 'VN', THA: 'TH', PHL: 'PH',
    MEX: 'MX', BRA: 'BR', CAN: 'CA', AUS: 'AU', FRA: 'FR',
    ITA: 'IT', CHE: 'CH', SWE: 'SE', ISR: 'IL', NOR: 'NO',
    FIN: 'FI', DNK: 'DK', AUT: 'AT', BEL: 'BE', HKG: 'HK',
};
// Countries with elevated geopolitical risk
const HIGH_GEO_RISK = new Set(['CHN', 'RUS', 'IRN', 'PRK', 'BLR', 'SYR', 'VEN']);
const MED_GEO_RISK = new Set(['TWN', 'PAK', 'EGY', 'TUR', 'SAU', 'ARE']);
function flagEmoji(alpha3) {
    const a2 = ALPHA3_TO_2[alpha3];
    if (!a2)
        return '🌐';
    return a2
        .split('')
        .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
        .join('');
}
function geoRisk(alpha3) {
    if (HIGH_GEO_RISK.has(alpha3))
        return 'high';
    if (MED_GEO_RISK.has(alpha3))
        return 'med';
    return 'low';
}
function computeRisk(edges) {
    const upstream = edges.filter(e => e.direction === 'UPSTREAM');
    // Concentration: penalise heavily-concentrated suppliers
    const exposures = upstream.map(e => e.pct_cogs ?? e.pct_revenue ?? 0);
    const topExposure = Math.max(0, ...exposures);
    const concScore = Math.min(100, topExposure * 3);
    // Sole-source
    const soles = upstream.filter(e => e.sole_source).length;
    const ssScore = Math.min(100, soles * 25);
    // Geo-risk: count suppliers in high/med risk countries
    const hiGeo = upstream.filter(e => e.hq_country && HIGH_GEO_RISK.has(e.hq_country)).length;
    const mdGeo = upstream.filter(e => e.hq_country && MED_GEO_RISK.has(e.hq_country)).length;
    const geoScore = Math.min(100, hiGeo * 20 + mdGeo * 8);
    const overall = Math.round(concScore * 0.4 + ssScore * 0.35 + geoScore * 0.25);
    const tier = overall >= 70 ? 'CRITICAL' : overall >= 45 ? 'HIGH' : overall >= 20 ? 'MEDIUM' : 'LOW';
    const color = tier === 'CRITICAL' ? '#ef4444' : tier === 'HIGH' ? '#f97316' : tier === 'MEDIUM' ? '#eab308' : '#22c55e';
    return {
        overall,
        concentration: Math.round(concScore),
        soleSource: Math.round(ssScore),
        geoRisk: Math.round(geoScore),
        tier,
        color,
    };
}
// ─── Panel: Risk Scorecard ────────────────────────────────────────────────
function ScoreBar({ label, value, color }) {
    return (_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex justify-between items-baseline", children: [_jsx("span", { className: "text-[8px] font-mono text-terminal-dim tracking-widest", children: label }), _jsx("span", { className: "text-[10px] font-mono font-bold", style: { color }, children: value })] }), _jsx("div", { className: "h-1 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${value}%`, background: color } }) })] }));
}
function RiskScorecard({ edges }) {
    const scores = computeRisk(edges);
    const upstream = edges.filter(e => e.direction === 'UPSTREAM').length;
    const downstream = edges.filter(e => e.direction === 'DOWNSTREAM').length;
    const soles = edges.filter(e => e.sole_source).length;
    return (_jsxs("div", { className: "bg-terminal-surface/40 border border-terminal-border rounded-sm p-4 space-y-4", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(AlertTriangle, { size: 11, className: "text-terminal-dim" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: "SUPPLY CHAIN RISK SCORE" })] }), _jsxs("div", { className: "flex items-end gap-3", children: [_jsx("div", { className: "text-5xl font-mono font-bold leading-none", style: { color: scores.color }, children: scores.overall }), _jsxs("div", { className: "pb-1 space-y-0.5", children: [_jsx("div", { className: "text-[9px] font-mono font-bold tracking-widest", style: { color: scores.color }, children: scores.tier }), _jsx("div", { className: "text-[8px] font-mono text-terminal-dim/50", children: "out of 100" })] })] }), _jsxs("div", { className: "space-y-2.5", children: [_jsx(ScoreBar, { label: "CONCENTRATION RISK", value: scores.concentration, color: scores.color }), _jsx(ScoreBar, { label: "SOLE-SOURCE RISK", value: scores.soleSource, color: scores.color }), _jsx(ScoreBar, { label: "GEOPOLITICAL RISK", value: scores.geoRisk, color: scores.color })] }), _jsx("div", { className: "grid grid-cols-3 gap-2 pt-1 border-t border-terminal-border", children: [
                    { label: 'SUPPLIERS', value: upstream },
                    { label: 'CUSTOMERS', value: downstream },
                    { label: 'SOLE-SOURCE', value: soles },
                ].map(({ label, value }) => (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-[15px] font-mono font-bold text-terminal-text", children: value }), _jsx("div", { className: "text-[7px] font-mono text-terminal-dim/50 tracking-wider", children: label })] }, label))) })] }));
}
// ─── Panel: Geographic Exposure ───────────────────────────────────────────
function GeoExposure({ edges }) {
    // Count suppliers and customers per country
    const countryMap = new Map();
    for (const e of edges) {
        if (!e.hq_country)
            continue;
        const prev = countryMap.get(e.hq_country) ?? { sup: 0, cust: 0 };
        if (e.direction === 'UPSTREAM')
            countryMap.set(e.hq_country, { ...prev, sup: prev.sup + 1 });
        if (e.direction === 'DOWNSTREAM')
            countryMap.set(e.hq_country, { ...prev, cust: prev.cust + 1 });
    }
    const countries = Array.from(countryMap.entries())
        .map(([code, counts]) => ({ code, ...counts, total: counts.sup + counts.cust }))
        .sort((a, b) => b.total - a.total);
    if (countries.length === 0) {
        return (_jsxs("div", { className: "bg-terminal-surface/40 border border-terminal-border rounded-sm p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Globe, { size: 11, className: "text-terminal-dim" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: "GEOGRAPHIC EXPOSURE" })] }), _jsx("p", { className: "text-[9px] font-mono text-terminal-dim/40 text-center py-4", children: "No country data" })] }));
    }
    return (_jsxs("div", { className: "bg-terminal-surface/40 border border-terminal-border rounded-sm p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Globe, { size: 11, className: "text-terminal-dim" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: "GEOGRAPHIC EXPOSURE" }), _jsxs("span", { className: "ml-auto text-[8px] font-mono text-terminal-dim/40", children: [countries.length, " countries"] })] }), _jsx("div", { className: "space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin", children: countries.map(({ code, sup, cust, total }) => {
                    const risk = geoRisk(code);
                    const riskColor = risk === 'high' ? '#ef4444' : risk === 'med' ? '#f97316' : '#5a6380';
                    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-base leading-none w-5", children: flagEmoji(code) }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim w-8", children: code }), _jsxs("div", { className: "flex-1 flex gap-1", children: [sup > 0 && (_jsxs("span", { className: "text-[8px] font-mono px-1 bg-sky-500/10 text-sky-400 rounded-sm", children: [sup, "\u2191 sup"] })), cust > 0 && (_jsxs("span", { className: "text-[8px] font-mono px-1 bg-green-500/10 text-green-400 rounded-sm", children: [cust, "\u2193 cust"] }))] }), risk !== 'low' && (_jsx("span", { className: "text-[7px] font-mono tracking-widest", style: { color: riskColor }, children: risk.toUpperCase() }))] }, code));
                }) })] }));
}
// ─── Panel: Concentration Chart ───────────────────────────────────────────
function ConcentrationChart({ edges }) {
    // Primary: quantified exposures; fallback: top by confidence
    const withExposure = edges
        .filter(e => (e.pct_revenue ?? e.pct_cogs ?? 0) > 0)
        .map(e => ({
        name: e.entity_name,
        value: e.pct_revenue ?? e.pct_cogs ?? 0,
        direction: e.direction,
        label: e.pct_revenue != null ? 'REV%' : 'COG%',
        isConf: false,
    }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12);
    const useFallback = withExposure.length === 0;
    const items = useFallback
        ? edges
            .filter(e => e.direction !== 'COMPETITOR')
            .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
            .slice(0, 12)
            .map(e => ({
            name: e.entity_name,
            value: (e.confidence ?? 0.5) * 100,
            direction: e.direction,
            label: 'CONF',
            isConf: true,
        }))
        : withExposure;
    const maxVal = Math.max(1, ...items.map(e => e.value));
    return (_jsxs("div", { className: "bg-terminal-surface/40 border border-terminal-border rounded-sm p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(BarChart2, { size: 11, className: "text-terminal-dim" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: useFallback ? 'TOP RELATIONSHIPS' : 'CONCENTRATION' }), _jsx("span", { className: "ml-auto text-[8px] font-mono text-terminal-dim/40", children: useFallback ? 'by confidence' : 'by exposure' })] }), _jsx("div", { className: "space-y-2 max-h-56 overflow-y-auto scrollbar-thin", children: items.map(({ name, value, direction, label }) => {
                    const barColor = direction === 'UPSTREAM' ? '#0ea5e9' : direction === 'DOWNSTREAM' ? '#22c55e' : '#9ca3af';
                    const pct = (value / maxVal) * 100;
                    return (_jsxs("div", { className: "space-y-0.5", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [_jsx("span", { className: "text-[8px] font-mono text-terminal-dim truncate max-w-[160px]", children: name }), _jsxs("span", { className: "text-[8px] font-mono flex-shrink-0 tabular-nums", style: { color: barColor }, children: [value.toFixed(0), label === 'CONF' ? '%' : `% ${label}`] })] }), _jsx("div", { className: "h-1.5 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all duration-700", style: { width: `${pct}%`, background: barColor } }) })] }, name));
                }) }), _jsx("div", { className: "flex gap-3 mt-3 pt-2 border-t border-terminal-border", children: [
                    { color: '#0ea5e9', label: 'SUPPLIER' },
                    { color: '#22c55e', label: 'CUSTOMER' },
                    { color: '#9ca3af', label: 'COMPETITOR' },
                ].map(({ color, label }) => (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("div", { className: "w-2 h-1.5 rounded-full", style: { background: color } }), _jsx("span", { className: "text-[7px] font-mono text-terminal-dim/40", children: label })] }, label))) })] }));
}
function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60)
        return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)
        return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}
function SCNews({ company, edges }) {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!company)
            return;
        setLoading(true);
        // Build query: company name + first word of top named partners
        const names = [company.legal_name ?? company.ticker];
        edges
            .filter(e => !e.entity_name.startsWith('['))
            .slice(0, 4)
            .forEach(e => names.push(e.entity_name.split(' ')[0]));
        const q = names.join(' OR ');
        api.search.query(q, 'keyword', 25)
            .then(res => {
            // SearchResponse has article_hits: ArticleHit[]
            const hits = res.article_hits ?? [];
            const arts = hits.map(h => ({
                id: h.article_id,
                title: h.title,
                url: h.url ?? '#',
                source_id: h.source_id,
                published_at: h.published_at ?? '',
            }));
            setArticles(arts.slice(0, 15));
            setLoading(false);
        })
            .catch(() => setLoading(false));
    }, [company.ticker]);
    return (_jsxs("div", { className: "bg-terminal-surface/40 border border-terminal-border rounded-sm p-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx(Newspaper, { size: 11, className: "text-terminal-dim" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim tracking-widest", children: "SUPPLY CHAIN NEWS" }), loading && (_jsx("span", { className: "ml-auto text-[8px] font-mono text-terminal-dim/40 animate-pulse", children: "searching\u2026" }))] }), !loading && articles.length === 0 && (_jsx("p", { className: "text-[9px] font-mono text-terminal-dim/40 text-center py-4", children: "No recent articles found" })), _jsx("div", { className: "space-y-2 max-h-64 overflow-y-auto scrollbar-thin", children: articles.map(a => (_jsx("a", { href: a.url, target: "_blank", rel: "noopener noreferrer", className: "block group", children: _jsx("div", { className: "flex items-start gap-2 py-1.5 border-b border-terminal-border/30 hover:border-terminal-accent/20 transition-colors", children: _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-[9px] font-mono text-terminal-dim group-hover:text-terminal-text transition-colors line-clamp-2 leading-relaxed", children: a.title }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [a.source_id && (_jsx("span", { className: "text-[7px] font-mono text-terminal-dim/40 uppercase tracking-widest", children: a.source_id.replace(/_/g, ' ') })), a.published_at && (_jsx("span", { className: "text-[7px] font-mono text-terminal-dim/30", children: timeAgo(a.published_at) }))] })] }) }) }, a.id))) })] }));
}
export function SCIntel({ company, edges }) {
    return (_jsx("div", { className: "h-full overflow-y-auto scrollbar-thin p-4", children: _jsxs("div", { className: "max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx(RiskScorecard, { edges: edges }), _jsx(GeoExposure, { edges: edges }), _jsx(ConcentrationChart, { edges: edges }), _jsx("div", { className: "md:col-span-1", children: _jsx(SCNews, { company: company, edges: edges }) })] }) }));
}
