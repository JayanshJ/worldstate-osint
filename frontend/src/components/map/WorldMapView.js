import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup, } from 'react-simple-maps';
// @ts-expect-error — Graticule exists at runtime but is missing from the bundled .d.ts
import { Graticule } from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Globe, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { VolatilityBadge } from '@/components/ui/VolatilityBadge';
import { CredibilityDot } from '@/components/ui/CredibilityDot';
import { timeAgo } from '@/lib/utils';
import { getSourceLabel } from '@/types';
const GEO_URL = '/countries-110m.json';
// ─── Country name normalisation ──────────────────────────────────────────────
// Maps search-extracted names → canonical GeoJSON names
const COUNTRY_ALIASES = {
    'USA': 'United States of America',
    'US': 'United States of America',
    'United States': 'United States of America',
    'America': 'United States of America',
    'UK': 'United Kingdom',
    'Britain': 'United Kingdom',
    'England': 'United Kingdom',
    'UAE': 'United Arab Emirates',
    'Russia': 'Russian Federation',
    'Iran': 'Iran',
    'South Korea': 'South Korea',
    'North Korea': 'Dem. Rep. Korea',
    'DPRK': 'Dem. Rep. Korea',
    'DR Congo': 'Dem. Rep. Congo',
    'Congo': 'Congo',
    'Ivory Coast': "Côte d'Ivoire",
    'Czech Republic': 'Czechia',
    'Taiwan': 'Taiwan',
    'Palestine': 'Palestine',
    'Venezuela': 'Venezuela',
    'Bolivia': 'Bolivia',
    'Tanzania': 'Tanzania',
};
function normaliseCountry(raw) {
    const trimmed = raw.trim();
    return COUNTRY_ALIASES[trimmed] ?? trimmed;
}
// ─── Extract countries from cluster entities ──────────────────────────────────
function extractCountriesFromCluster(cluster) {
    const found = new Set();
    // From locations like "Tehran, Iran (relevance: conflict)" → "Iran"
    for (const loc of cluster.entities?.locations ?? []) {
        // Try "Country (relevance:…)" pattern
        const m1 = loc.match(/^([A-Z][^,(]+?)(?:\s*\(|\s*$)/);
        if (m1)
            found.add(normaliseCountry(m1[1].trim()));
        // Try "City, Country (relevance:…)" → take part after last comma
        const parts = loc.split(',');
        if (parts.length > 1) {
            const last = parts[parts.length - 1].split('(')[0].trim();
            if (last.length > 1)
                found.add(normaliseCountry(last));
        }
    }
    // From people like "Khamenei (Supreme Leader/Iran)" → "Iran"
    for (const person of cluster.entities?.people ?? []) {
        const m = person.match(/\/([A-Z][A-Za-z\s]+)\)/);
        if (m)
            found.add(normaliseCountry(m[1].trim()));
    }
    return [...found].filter(Boolean);
}
// ─── Volatility → fill colour ─────────────────────────────────────────────────
function activityColor(maxVol, count) {
    if (count === 0)
        return '#13132b';
    if (maxVol >= 0.85)
        return 'rgba(220,38,38,0.55)'; // critical
    if (maxVol >= 0.70)
        return 'rgba(239,68,68,0.40)'; // high
    if (maxVol >= 0.55)
        return 'rgba(249,115,22,0.38)'; // elevated
    if (maxVol >= 0.40)
        return 'rgba(234,179,8,0.30)'; // moderate
    return 'rgba(0,212,255,0.20)'; // low/calm
}
// ─── Component ────────────────────────────────────────────────────────────────
export function WorldMapView({ onClusterSelect }) {
    const containerRef = useRef(null);
    const [clusters, setClusters] = useState([]);
    const [selectedCountry, setSelectedCountry] = useState(null);
    const [hoveredCountry, setHoveredCountry] = useState(null);
    const [searchResult, setSearchResult] = useState(null);
    const [searching, setSearching] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [center, setCenter] = useState([0, 20]);
    const [isDragging, setIsDragging] = useState(false);
    // Fetch clusters once on mount
    useEffect(() => {
        api.clusters.list({ limit: 200, activeOnly: true, minVolatility: 0 })
            .then(setClusters)
            .catch(() => { });
    }, []);
    // Mouse-wheel zoom — prevent page scroll, zoom into map
    useEffect(() => {
        const el = containerRef.current;
        if (!el)
            return;
        const onWheel = (e) => {
            e.preventDefault();
            setZoom(z => e.deltaY < 0
                ? Math.min(z * 1.25, 20)
                : Math.max(z / 1.25, 1));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);
    // Build country → activity map
    const countryActivity = useMemo(() => {
        const map = new Map();
        for (const cluster of clusters) {
            const countries = extractCountriesFromCluster(cluster);
            for (const c of countries) {
                const existing = map.get(c) ?? { clusters: [], maxVol: 0, count: 0 };
                existing.clusters.push(cluster);
                existing.maxVol = Math.max(existing.maxVol, cluster.volatility);
                existing.count++;
                map.set(c, existing);
            }
        }
        return map;
    }, [clusters]);
    // When country is selected, search for its news
    const handleCountryClick = useCallback(async (name) => {
        setSelectedCountry(name);
        setSearchResult(null);
        setSearching(true);
        try {
            const res = await api.search.query(name, 'keyword', 20);
            setSearchResult(res);
        }
        catch {
            setSearchResult(null);
        }
        finally {
            setSearching(false);
        }
    }, []);
    // Active country list for legend
    const topCountries = useMemo(() => {
        return [...countryActivity.entries()]
            .sort((a, b) => b[1].maxVol - a[1].maxVol)
            .slice(0, 8);
    }, [countryActivity]);
    return (_jsxs("div", { className: "flex h-full w-full relative overflow-hidden", style: { background: '#000000' }, children: [_jsxs("div", { ref: containerRef, className: "flex-1 relative overflow-hidden", style: {
                    background: '#000000',
                    cursor: isDragging ? 'grabbing' : 'grab',
                }, children: [_jsxs(ComposableMap, { projection: "geoMercator", projectionConfig: { scale: 140 }, width: 960, height: 500, style: { width: '100%', height: '100%', display: 'block' }, children: [_jsx("rect", { x: 0, y: 0, width: 960, height: 500, fill: "#000000" }), _jsxs(ZoomableGroup, { zoom: zoom, center: center, onMoveStart: () => setIsDragging(true), onMoveEnd: ({ zoom: z, coordinates }) => {
                                    setIsDragging(false);
                                    setZoom(z);
                                    setCenter(coordinates);
                                }, children: [_jsx(Graticule, { stroke: "rgba(255,255,255,0.06)", strokeWidth: 0.5 }), _jsx(Geographies, { geography: GEO_URL, children: ({ geographies }) => geographies.map(geo => {
                                            const name = geo.properties.name;
                                            const activity = countryActivity.get(name);
                                            const isSelected = selectedCountry === name;
                                            const isHovered = hoveredCountry === name;
                                            const fill = isSelected
                                                ? '#00d4ff'
                                                : isHovered
                                                    ? '#1e3a5f'
                                                    : activity
                                                        ? activityColor(activity.maxVol, activity.count)
                                                        : '#111118';
                                            return (_jsx(Geography, { geography: geo, onClick: () => handleCountryClick(name), onMouseEnter: () => setHoveredCountry(name), onMouseLeave: () => setHoveredCountry(null), style: {
                                                    default: { fill, stroke: 'rgba(255,255,255,0.10)', strokeWidth: 0.3, outline: 'none' },
                                                    hover: { fill: isSelected ? '#00d4ff' : '#1e3a5f', stroke: '#00d4ff66', strokeWidth: 0.6, outline: 'none', cursor: 'pointer' },
                                                    pressed: { fill: '#00d4ff', outline: 'none' },
                                                } }, geo.rsmKey));
                                        }) })] })] }), _jsx(AnimatePresence, { children: hoveredCountry && !selectedCountry && (_jsx(motion.div, { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, className: "absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none", children: _jsxs("div", { className: "bg-terminal-surface border border-terminal-border px-3 py-1.5 rounded-sm font-mono text-xs text-terminal-text flex items-center gap-2", children: [_jsx(Globe, { size: 10, className: "text-terminal-accent" }), hoveredCountry, countryActivity.get(hoveredCountry) && (_jsxs("span", { className: "text-terminal-dim", children: ["\u00B7 ", countryActivity.get(hoveredCountry).count, " cluster", countryActivity.get(hoveredCountry).count !== 1 ? 's' : ''] }))] }) })) }), _jsx("div", { className: "absolute bottom-4 right-4 flex flex-col gap-1", children: [
                            { icon: Plus, action: () => setZoom(z => Math.min(z * 1.5, 12)) },
                            { icon: Minus, action: () => setZoom(z => Math.max(z / 1.5, 1)) },
                            { icon: RotateCcw, action: () => { setZoom(1); setCenter([0, 20]); } },
                        ].map(({ icon: Icon, action }, i) => (_jsx("button", { onClick: action, className: "w-7 h-7 bg-terminal-surface border border-terminal-border text-terminal-dim hover:text-terminal-accent hover:border-terminal-accent/50 rounded-sm flex items-center justify-center transition-colors", children: _jsx(Icon, { size: 11 }) }, i))) }), topCountries.length > 0 && (_jsxs("div", { className: "absolute top-4 left-4 bg-terminal-surface/90 border border-terminal-border rounded-sm p-3 min-w-[180px]", children: [_jsx("div", { className: "text-[9px] font-mono text-terminal-dim tracking-widest mb-2 uppercase", children: "Active Regions" }), topCountries.map(([country, act]) => (_jsxs("button", { onClick: () => handleCountryClick(country), className: "flex items-center gap-2 w-full py-0.5 hover:text-terminal-accent transition-colors group", children: [_jsx("div", { className: "w-2 h-2 rounded-full flex-shrink-0", style: { background: activityColor(act.maxVol, act.count) } }), _jsx("span", { className: "font-mono text-[10px] text-terminal-text group-hover:text-terminal-accent truncate", children: country }), _jsx("span", { className: "font-mono text-[9px] text-terminal-dim ml-auto", children: act.count })] }, country)))] })), !selectedCountry && (_jsx("div", { className: "absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none", children: _jsx("span", { className: "font-mono text-[10px] text-terminal-dim/60", children: "Click any country to view intelligence \u00B7 Scroll to zoom" }) }))] }), _jsx(AnimatePresence, { children: selectedCountry && (_jsxs(motion.div, { initial: { x: 380, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 380, opacity: 0 }, transition: { type: 'spring', stiffness: 300, damping: 30 }, className: "w-[360px] flex-shrink-0 border-l border-terminal-border flex flex-col bg-terminal-bg overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-surface flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Globe, { size: 13, className: "text-terminal-accent" }), _jsx("span", { className: "font-mono font-bold text-sm text-terminal-text tracking-wide", children: selectedCountry }), countryActivity.get(selectedCountry) && (_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim border border-terminal-border px-1.5 py-0.5 rounded-sm", children: [countryActivity.get(selectedCountry).count, " CLUSTER", countryActivity.get(selectedCountry).count !== 1 ? 'S' : ''] }))] }), _jsx("button", { onClick: () => setSelectedCountry(null), className: "text-terminal-dim hover:text-terminal-text transition-colors", children: _jsx(X, { size: 14 }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: searching ? (_jsxs("div", { className: "flex items-center justify-center h-32 gap-2 text-terminal-dim font-mono text-xs", children: [_jsx(Loader2, { size: 14, className: "animate-spin text-terminal-accent" }), "Scanning intelligence..."] })) : !searchResult || searchResult.total === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center h-32 gap-2 text-terminal-dim/60 font-mono text-xs", children: [_jsx(Globe, { size: 24, className: "text-terminal-dim/30" }), "No current intelligence for ", selectedCountry] })) : (_jsxs("div", { children: [searchResult.cluster_hits.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border bg-terminal-surface/50 uppercase", children: ["Event Clusters (", searchResult.cluster_hits.length, ")"] }), searchResult.cluster_hits.map(hit => (_jsx(MapClusterRow, { hit: hit, onSelect: () => onClusterSelect?.(hit.cluster_id) }, hit.cluster_id)))] })), searchResult.article_hits.length > 0 && (_jsxs("div", { children: [_jsxs("div", { className: "px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border bg-terminal-surface/50 uppercase", children: ["Recent Articles (", searchResult.article_hits.length, ")"] }), searchResult.article_hits.map(hit => (_jsx(MapArticleRow, { hit: hit }, hit.article_id)))] }))] })) }), searchResult && searchResult.total > 0 && (_jsx("div", { className: "px-4 py-2 border-t border-terminal-border flex-shrink-0 bg-terminal-surface/30", children: _jsxs("span", { className: "text-[9px] font-mono text-terminal-dim", children: [searchResult.total, " results \u00B7 keyword match"] }) }))] }, selectedCountry)) })] }));
}
// ─── Cluster row ──────────────────────────────────────────────────────────────
function MapClusterRow({ hit, onSelect }) {
    return (_jsxs("button", { onClick: onSelect, className: "w-full flex items-start gap-3 px-4 py-3 border-b border-terminal-border/40 hover:bg-terminal-muted/30 transition-colors text-left group", children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx(VolatilityBadge, { volatility: hit.volatility, size: "sm" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-[11px] text-terminal-text group-hover:text-terminal-accent transition-colors line-clamp-2 leading-relaxed", children: hit.label ?? 'Unnamed cluster' }), hit.bullets?.[0] && (_jsx("p", { className: "font-mono text-[10px] text-terminal-dim mt-1 line-clamp-1", children: hit.bullets[0] }))] }), _jsx(ChevronRight, { size: 11, className: "flex-shrink-0 mt-0.5 text-terminal-dim group-hover:text-terminal-accent transition-colors" })] }));
}
// ─── Article row ──────────────────────────────────────────────────────────────
function MapArticleRow({ hit }) {
    const inner = (_jsxs("div", { className: "flex items-start gap-3 px-4 py-2.5 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors", children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx(CredibilityDot, { score: hit.credibility_score, sourceId: hit.source_id }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-[11px] text-terminal-text line-clamp-2 leading-relaxed", children: hit.title }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [_jsx("span", { className: "text-[9px] text-terminal-dim font-mono", children: getSourceLabel(hit.source_id) }), _jsx("span", { className: "text-[9px] text-terminal-dim font-mono ml-auto", children: hit.published_at ? timeAgo(hit.published_at) : '' })] })] })] }));
    return hit.url
        ? _jsx("a", { href: hit.url, target: "_blank", rel: "noopener noreferrer", children: inner })
        : _jsx("div", { children: inner });
}
