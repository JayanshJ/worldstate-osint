import { useEffect, useRef, useState } from 'react';
import { getSourceLabel } from '@/types';
import { useWebSocket } from '@/context/WebSocketContext';
const MAX_TICKER = 60;
export function useTickerFeed() {
    const [items, setItems] = useState([]);
    const { lastArticle, lastClusterUpdate } = useWebSocket();
    const seenIds = useRef(new Set());
    // New article → add to ticker
    useEffect(() => {
        if (!lastArticle)
            return;
        const a = lastArticle;
        const id = `a-${a.article_id}`;
        if (seenIds.current.has(id))
            return;
        seenIds.current.add(id);
        const item = {
            id,
            text: `[${getSourceLabel(a.source_id)}] ${a.title}`,
            volatility: 0,
            source: a.source_id,
            timestamp: new Date().toISOString(),
        };
        setItems(prev => [item, ...prev].slice(0, MAX_TICKER));
    }, [lastArticle]);
    // Cluster update → add breaking headline to ticker
    useEffect(() => {
        if (!lastClusterUpdate)
            return;
        const c = lastClusterUpdate;
        if (!c.label)
            return;
        const id = `c-${c.cluster_id}-${Date.now()}`;
        if (seenIds.current.has(id))
            return;
        seenIds.current.add(id);
        const item = {
            id,
            text: `◆ ${c.label.toUpperCase()}`,
            volatility: c.volatility,
            source: 'INTELLIGENCE',
            timestamp: new Date().toISOString(),
        };
        setItems(prev => [item, ...prev].slice(0, MAX_TICKER));
    }, [lastClusterUpdate]);
    return { items };
}
