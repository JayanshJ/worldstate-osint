import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { TrendingUp, TrendingDown, Shield, Minus, Clock, AlertTriangle, CheckCircle2, MapPin, FlaskConical } from 'lucide-react';
import { ASSET_CLASS_COLORS, ASSET_CLASS_BG, DIRECTION_COLORS, RISK_COLORS, } from '@/types';
// ─── Small label helpers ──────────────────────────────────────────────────────
const ASSET_CLASS_LABELS = {
    COMMODITY: 'COMMODITY',
    EQUITY: 'EQUITY',
    FOREX: 'FOREX',
    CRYPTO: 'CRYPTO',
    BONDS: 'BONDS',
    VOLATILITY: 'VOLATILITY',
};
const TIMEFRAME_LABELS = {
    INTRADAY: 'INTRADAY',
    SHORT: '2–7 DAYS',
    MEDIUM: '1–4 WEEKS',
    LONG: '1–6 MONTHS',
};
const RISK_LABELS = {
    LOW: 'LOW RISK',
    MODERATE: 'MODERATE',
    HIGH: 'HIGH RISK',
    SPECULATIVE: 'SPECULATIVE',
};
function DirectionIcon({ direction }) {
    const color = DIRECTION_COLORS[direction];
    const props = { size: 14, color };
    if (direction === 'LONG')
        return _jsx(TrendingUp, { ...props });
    if (direction === 'SHORT')
        return _jsx(TrendingDown, { ...props });
    if (direction === 'HEDGE')
        return _jsx(Shield, { ...props });
    return _jsx(Minus, { ...props });
}
function RiskIcon({ risk }) {
    const color = RISK_COLORS[risk];
    const props = { size: 11, color };
    if (risk === 'LOW')
        return _jsx(CheckCircle2, { ...props });
    if (risk === 'MODERATE')
        return _jsx(CheckCircle2, { ...props });
    return _jsx(AlertTriangle, { ...props });
}
// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
    const pct = Math.round(value * 100);
    const color = value >= 0.75 ? '#22c55e' :
        value >= 0.55 ? '#eab308' :
            value >= 0.40 ? '#f97316' : '#ef4444';
    return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex-1 h-1 bg-terminal-border rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full transition-all", style: { width: `${pct}%`, background: color } }) }), _jsxs("span", { className: "font-mono text-[10px] tabular-nums", style: { color }, children: [pct, "%"] })] }));
}
// ─── Backtest Badge ───────────────────────────────────────────────────────────
function BacktestBadge({ outcome, label, direction }) {
    if (outcome === null)
        return (_jsxs("div", { className: "flex items-center gap-1 text-[9px] font-mono text-terminal-dim/50", children: [_jsx(FlaskConical, { size: 8 }), _jsxs("span", { children: [label, " PENDING"] })] }));
    const isCorrect = (direction === 'LONG' && outcome > 0) || (direction === 'SHORT' && outcome < 0);
    const color = isCorrect ? '#22c55e' : '#ef4444';
    const sign = outcome > 0 ? '+' : '';
    return (_jsxs("div", { className: "flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border", style: { color, borderColor: `${color}40`, background: `${color}10` }, children: [_jsx(FlaskConical, { size: 8 }), _jsx("span", { children: label }), _jsxs("span", { className: "font-bold", children: [sign, outcome.toFixed(2), "%"] }), _jsx("span", { children: isCorrect ? '✓' : '✗' })] }));
}
export function StrategyCard({ strategy, onClusterSelect }) {
    const acColor = ASSET_CLASS_COLORS[strategy.asset_class] ?? '#6b7280';
    const acBg = ASSET_CLASS_BG[strategy.asset_class] ?? 'rgba(107,114,128,0.12)';
    const dirColor = DIRECTION_COLORS[strategy.direction] ?? '#6b7280';
    const riskColor = RISK_COLORS[strategy.risk_level] ?? '#6b7280';
    return (_jsxs("div", { className: "border border-terminal-border bg-terminal-surface/40 hover:bg-terminal-surface/70 transition-colors", style: { borderLeftColor: dirColor, borderLeftWidth: 3 }, children: [_jsxs("div", { className: "flex items-center gap-1.5 px-4 py-1 bg-amber-500/10 border-b border-amber-500/20", children: [_jsx(AlertTriangle, { size: 9, className: "text-amber-400 flex-shrink-0" }), _jsx("span", { className: "font-mono text-[9px] text-amber-400/80 tracking-wider", children: "RESEARCH ONLY \u2014 NOT FINANCIAL ADVICE \u2014 NO BACKTEST" })] }), _jsxs("div", { className: "flex items-start justify-between gap-3 px-4 pt-3 pb-2", children: [_jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] font-bold tracking-wider", style: { color: dirColor, borderColor: `${dirColor}44`, background: `${dirColor}15` }, children: [_jsx(DirectionIcon, { direction: strategy.direction }), strategy.direction] }), _jsx("div", { className: "px-2 py-0.5 rounded-sm font-mono text-[10px] font-bold tracking-wider border", style: { color: acColor, borderColor: `${acColor}44`, background: acBg }, children: ASSET_CLASS_LABELS[strategy.asset_class] ?? strategy.asset_class }), _jsxs("div", { className: "flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-wider border", style: { color: riskColor, borderColor: `${riskColor}30`, background: `${riskColor}10` }, children: [_jsx(RiskIcon, { risk: strategy.risk_level }), RISK_LABELS[strategy.risk_level] ?? strategy.risk_level] })] }), _jsxs("div", { className: "flex items-center gap-1 text-[10px] font-mono text-terminal-dim flex-shrink-0", children: [_jsx(Clock, { size: 9 }), TIMEFRAME_LABELS[strategy.timeframe] ?? strategy.timeframe] })] }), _jsx("div", { className: "px-4 pb-2", children: _jsx("h3", { className: "font-mono font-bold text-sm text-terminal-text leading-snug", children: strategy.title }) }), _jsx("div", { className: "px-4 pb-3", children: _jsx("p", { className: "font-mono text-[11px] text-terminal-dim leading-relaxed", children: strategy.thesis }) }), strategy.rationale?.length > 0 && (_jsx("div", { className: "px-4 pb-3 border-t border-terminal-border/40 pt-2.5 space-y-1.5", children: strategy.rationale.map((point, i) => (_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { className: "font-mono text-[9px] font-bold mt-0.5 flex-shrink-0", style: { color: i === 0 ? acColor : i === 2 ? '#6b7280' : '#94a3b8' }, children: i === 0 ? '▶' : i === 1 ? '◆' : '⚠' }), _jsx("p", { className: "font-mono text-[10px] text-terminal-text/80 leading-relaxed", children: point })] }, i))) })), _jsxs("div", { className: "px-4 pb-3 pt-1 border-t border-terminal-border/40", children: [strategy.specific_assets?.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1.5 mb-3", children: strategy.specific_assets.map((asset, i) => (_jsx("span", { className: "font-mono text-[10px] px-2 py-0.5 rounded-sm border", style: { color: acColor, borderColor: `${acColor}40`, background: `${acColor}0d` }, children: asset }, i))) })), _jsxs("div", { className: "mb-2", children: [_jsx("div", { className: "flex items-center justify-between mb-1", children: _jsx("span", { className: "font-mono text-[9px] text-terminal-dim tracking-widest uppercase", children: "Conviction" }) }), _jsx(ConfidenceBar, { value: strategy.confidence })] }), (strategy.entry_ticker) && (_jsxs("div", { className: "flex items-center gap-3 mt-2 mb-1", children: [_jsx(BacktestBadge, { outcome: strategy.outcome_4h ?? null, label: "4h", direction: strategy.direction }), _jsx(BacktestBadge, { outcome: strategy.outcome_24h ?? null, label: "24h", direction: strategy.direction }), strategy.entry_price && (_jsxs("span", { className: "text-[9px] font-mono text-terminal-dim/40", children: ["entry ", strategy.entry_ticker, " @ ", strategy.entry_price.toFixed(2)] }))] })), _jsxs("div", { className: "flex items-center justify-between mt-2", children: [_jsx("div", { className: "flex items-center gap-1 flex-wrap", children: strategy.related_regions?.slice(0, 3).map((region, i) => (_jsxs("span", { className: "flex items-center gap-0.5 font-mono text-[9px] text-terminal-dim", children: [_jsx(MapPin, { size: 8 }), region] }, i))) }), _jsx("div", { className: "flex items-center gap-1 text-[9px] font-mono text-terminal-dim/60", children: strategy.source_cluster_ids?.length > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full flex-shrink-0", style: { background: acColor } }), strategy.source_cluster_ids.length, " cluster", strategy.source_cluster_ids.length !== 1 ? 's' : ''] })) })] })] })] }));
}
