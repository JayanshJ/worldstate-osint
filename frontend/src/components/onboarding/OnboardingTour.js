import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, LayoutDashboard, Globe, Zap, GitBranch, Bell, Search, FlaskConical } from 'lucide-react';
const STEPS = [
    {
        icon: _jsx(Globe, { size: 24, className: "text-terminal-accent" }),
        title: 'Welcome to WorldState',
        description: 'Real-time geopolitical intelligence fused with market signals. Every panel updates live as events unfold around the world.',
        hint: 'This tour takes about 60 seconds.',
    },
    {
        icon: _jsx(LayoutDashboard, { size: 24, className: "text-blue-400" }),
        title: 'Feed — Live Intelligence',
        description: 'The main dashboard shows two panels: Event Clusters on the left (AI-grouped stories) and Live Feed on the right (raw articles as they arrive).',
        hint: 'Click any cluster to expand it and see source articles, key entities, and a volatility score.',
    },
    {
        icon: _jsx(Zap, { size: 24, className: "text-yellow-400" }),
        title: 'Event Clusters',
        description: 'Articles are grouped by semantic similarity into clusters. Each cluster is scored for volatility (0–1), sentiment, and geographic reach.',
        hint: 'Filter by category (CONFLICT, FINANCE, CRYPTO…) or severity (MOD+, HIGH, CRIT) using the top bar.',
    },
    {
        icon: _jsx(FlaskConical, { size: 24, className: "text-green-400" }),
        title: 'Alpha — Market Signals',
        description: 'AI synthesizes active clusters into directional market strategies across COMMODITY, EQUITY, FOREX, CRYPTO, BONDS, and VOLATILITY.',
        hint: 'Each signal now includes a live backtest — see how the price actually moved at 4h and 24h after generation.',
    },
    {
        icon: _jsx(Globe, { size: 24, className: "text-cyan-400" }),
        title: 'World Map',
        description: 'Geographic view of active intelligence clusters. Countries are colored by cluster intensity. Click a country to filter relevant signals.',
        hint: 'Switch to Map tab in the top navigation.',
    },
    {
        icon: _jsx(GitBranch, { size: 24, className: "text-purple-400" }),
        title: 'Supply Chain — SPLC',
        description: 'Search any stock ticker to visualize its supplier and customer network. Nodes are colored by supply chain tier and geographic risk.',
        hint: 'Click any node to expand that company\'s own supply chain.',
    },
    {
        icon: _jsx(Bell, { size: 24, className: "text-red-400" }),
        title: 'Alerts & Search',
        description: 'Set keyword or entity alert watches — WorldState will notify you in real time when a matching cluster appears.',
        hint: 'Use ⌘K (or Ctrl+K) to search across all intelligence instantly.',
    },
    {
        icon: _jsx(Search, { size: 24, className: "text-terminal-accent" }),
        title: "You're ready",
        description: 'WorldState is now monitoring global sources in real time. Intelligence clusters will populate as articles are ingested and processed.',
        hint: 'You can revisit this tour from your account settings at any time.',
    },
];
const STORAGE_KEY = 'onboarding_complete';
export function useOnboarding() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const done = localStorage.getItem(STORAGE_KEY);
        if (!done)
            setShow(true);
    }, []);
    const complete = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setShow(false);
    };
    return { show, complete };
}
export function OnboardingTour({ onComplete }) {
    const [step, setStep] = useState(0);
    const total = STEPS.length;
    const current = STEPS[step];
    const isLast = step === total - 1;
    const barRef = useRef(null);
    function finish() {
        localStorage.setItem(STORAGE_KEY, '1');
        onComplete();
    }
    return (_jsx("div", { className: "fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in", children: _jsxs("div", { className: "relative w-full max-w-md mx-4 bg-terminal-surface border border-terminal-border shadow-2xl rounded-sm font-mono", children: [_jsx("div", { className: "h-0.5 bg-terminal-border", children: _jsx("div", { ref: barRef, className: "h-full bg-terminal-accent transition-all duration-300", style: { width: `${((step + 1) / total) * 100}%` } }) }), _jsxs("div", { className: "flex items-center justify-between px-5 pt-4 pb-2", children: [_jsxs("span", { className: "text-[9px] text-terminal-dim tracking-widest uppercase", children: ["Step ", step + 1, " of ", total] }), _jsx("button", { onClick: finish, className: "text-terminal-dim hover:text-terminal-text transition-colors", title: "Skip tour", children: _jsx(X, { size: 14 }) })] }), _jsxs("div", { className: "px-5 py-4", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "flex-shrink-0 w-10 h-10 flex items-center justify-center bg-terminal-muted rounded-sm", children: current.icon }), _jsx("h2", { className: "text-terminal-text font-bold text-base leading-tight", children: current.title })] }), _jsx("p", { className: "text-terminal-dim text-xs leading-relaxed mb-3", children: current.description }), current.hint && (_jsxs("div", { className: "flex items-start gap-2 px-3 py-2 bg-terminal-accent/5 border border-terminal-accent/20 rounded-sm", children: [_jsx("span", { className: "text-terminal-accent text-[10px] flex-shrink-0 mt-0.5", children: "\u2192" }), _jsx("p", { className: "text-terminal-accent/80 text-[10px] leading-relaxed", children: current.hint })] }))] }), _jsx("div", { className: "flex items-center justify-center gap-1.5 pb-2", children: STEPS.map((_, i) => (_jsx("button", { onClick: () => setStep(i), className: `w-1.5 h-1.5 rounded-full transition-all ${i === step
                            ? 'bg-terminal-accent w-4'
                            : i < step
                                ? 'bg-terminal-accent/40'
                                : 'bg-terminal-border'}` }, i))) }), _jsxs("div", { className: "flex items-center justify-between px-5 pb-5 pt-1", children: [_jsxs("button", { onClick: () => setStep(s => s - 1), disabled: step === 0, className: "flex items-center gap-1 text-[10px] text-terminal-dim hover:text-terminal-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors", children: [_jsx(ChevronLeft, { size: 12 }), " Back"] }), isLast ? (_jsxs("button", { onClick: finish, className: "flex items-center gap-1.5 text-[10px] font-bold px-4 py-1.5 bg-terminal-accent text-black rounded-sm hover:brightness-110 transition-all", children: ["Get Started ", _jsx(ChevronRight, { size: 12 })] })) : (_jsxs("button", { onClick: () => setStep(s => s + 1), className: "flex items-center gap-1.5 text-[10px] font-bold px-4 py-1.5 border border-terminal-accent/40 text-terminal-accent hover:bg-terminal-accent/10 rounded-sm transition-colors", children: ["Next ", _jsx(ChevronRight, { size: 12 })] }))] })] }) }));
}
