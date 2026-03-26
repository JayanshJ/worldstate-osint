import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from '@/context/WebSocketContext';
const MAX_FEED = 150;
export function useLiveFeed() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const { lastArticle } = useWebSocket();
    const seenIds = useRef(new Set());
    useEffect(() => {
        api.feed
            .list({ limit: 50 })
            .then(data => {
            data.forEach(a => seenIds.current.add(a.id));
            setArticles(data);
            setLoading(false);
        })
            .catch(() => setLoading(false));
    }, []);
    // Prepend incoming WS articles
    useEffect(() => {
        if (!lastArticle)
            return;
        const a = lastArticle;
        if (seenIds.current.has(a.article_id))
            return;
        seenIds.current.add(a.article_id);
        const newArticle = {
            id: a.article_id,
            source_id: a.source_id,
            source_type: 'live',
            title: a.title,
            url: a.url,
            published_at: a.published_at,
            ingested_at: new Date().toISOString(),
            credibility_score: a.credibility_score,
            is_processed: false,
        };
        setArticles(prev => [newArticle, ...prev].slice(0, MAX_FEED));
    }, [lastArticle]);
    return { articles, loading };
}
