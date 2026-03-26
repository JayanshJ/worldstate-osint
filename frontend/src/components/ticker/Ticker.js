import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { useTickerFeed } from '@/hooks/useTickerFeed';
import { VOLATILITY_COLORS, getVolatilityTier } from '@/types';
import { cn } from '@/lib/utils';
function TickerSegment({ item }) {
    const tier = getVolatilityTier(item.volatility);
    const color = item.volatility > 0 ? VOLATILITY_COLORS[tier] : '#5a6380';
    const isIntel = item.source === 'INTELLIGENCE';
    return (_jsxs("span", { className: cn('inline-flex items-center gap-2 px-4 border-r border-terminal-border whitespace-nowrap', 'font-mono text-[11px]'), children: [_jsx("span", { className: "text-[9px] font-bold tracking-widest flex-shrink-0", style: { color: isIntel ? '#00d4ff' : '#5a6380' }, children: isIntel ? '◆ INTEL' : item.source.toUpperCase().slice(0, 8) }), _jsx("span", { className: "text-terminal-dim", children: "\u203A" }), _jsx("span", { className: cn('transition-colors', isIntel ? 'text-terminal-accent font-semibold' : 'text-terminal-text'), style: isIntel && item.volatility > 0.7 ? { color } : {}, children: item.text }), item.volatility >= 0.55 && (_jsxs("span", { className: "text-[9px] font-bold px-1 py-0.5 rounded-sm", style: {
                    backgroundColor: `${color}22`,
                    color,
                    border: `1px solid ${color}44`,
                }, children: [Math.round(item.volatility * 100), "%"] }))] }));
}
export function Ticker() {
    const { items } = useTickerFeed();
    const trackRef = useRef(null);
    const [paused, setPaused] = useState(false);
    // Duplicate items for seamless loop
    const displayItems = items.length > 0
        ? [...items, ...items]
        : [{
                id: 'placeholder',
                text: 'Monitoring global sources — WorldState intelligence system active',
                volatility: 0,
                source: 'WORLDSTATE',
                timestamp: new Date().toISOString(),
            },
            {
                id: 'placeholder2',
                text: 'Monitoring global sources — WorldState intelligence system active',
                volatility: 0,
                source: 'WORLDSTATE',
                timestamp: new Date().toISOString(),
            }];
    return (_jsxs("div", { className: cn('relative h-8 bg-terminal-surface border-t border-terminal-border overflow-hidden', 'flex items-center select-none'), onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false), children: [_jsx("div", { className: "flex-shrink-0 h-full flex items-center px-3 bg-terminal-accent/10 border-r border-terminal-accent/30 z-10", children: _jsx("span", { className: "text-[9px] font-mono font-bold text-terminal-accent tracking-[0.2em]", children: "LIVE" }) }), _jsx("div", { className: "flex-1 overflow-hidden relative", children: _jsx("div", { ref: trackRef, className: cn('flex items-center', !paused && 'animate-ticker'), style: {
                        animationPlayState: paused ? 'paused' : 'running',
                        width: 'max-content',
                    }, children: displayItems.map((item, i) => (_jsx(TickerSegment, { item: item }, `${item.id}-${i}`))) }) }), _jsx("div", { className: "absolute right-0 top-0 h-full w-16 pointer-events-none z-10", style: {
                    background: 'linear-gradient(to left, #0f0f1a, transparent)',
                } })] }));
}
