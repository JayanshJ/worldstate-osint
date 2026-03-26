import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState, } from 'react';
const WsContext = createContext({
    status: 'connecting',
    lastArticle: null,
    lastClusterUpdate: null,
    lastStrategyUpdate: null,
    clientCount: 0,
});
function getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const token = localStorage.getItem('ws_token') ?? '';
    return `${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY = 30_000;
export function WebSocketProvider({ children }) {
    const [status, setStatus] = useState('connecting');
    const [lastArticle, setLastArticle] = useState(null);
    const [lastClusterUpdate, setLastClusterUpdate] = useState(null);
    const [lastStrategyUpdate, setLastStrategyUpdate] = useState(null);
    const [clientCount, setClientCount] = useState(0);
    const wsRef = useRef(null);
    const retryCount = useRef(0);
    const retryTimer = useRef();
    const heartbeatTimer = useRef();
    const isMounted = useRef(true);
    const connect = useCallback(() => {
        if (!isMounted.current)
            return;
        if (wsRef.current?.readyState === WebSocket.OPEN)
            return;
        setStatus('connecting');
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;
        ws.onopen = () => {
            if (!isMounted.current)
                return;
            setStatus('connected');
            retryCount.current = 0;
            // Send heartbeat ping every 25s
            clearInterval(heartbeatTimer.current);
            heartbeatTimer.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN)
                    ws.send('ping');
            }, 25_000);
        };
        ws.onmessage = (event) => {
            if (!isMounted.current)
                return;
            try {
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case 'connected':
                        setClientCount(msg.data.clients ?? 0);
                        break;
                    case 'new_article':
                        setLastArticle(msg.data);
                        break;
                    case 'cluster_update':
                        setLastClusterUpdate(msg.data);
                        break;
                    case 'strategy_update':
                        setLastStrategyUpdate(msg.data.strategies ?? null);
                        break;
                    // 'heartbeat' and 'pong' — no state update needed
                }
            }
            catch {
                // malformed message — ignore
            }
        };
        ws.onclose = () => {
            if (!isMounted.current)
                return;
            clearInterval(heartbeatTimer.current);
            setStatus('disconnected');
            // Exponential backoff
            const delay = Math.min(RECONNECT_DELAY_MS * 2 ** retryCount.current, MAX_RECONNECT_DELAY);
            retryCount.current += 1;
            retryTimer.current = setTimeout(connect, delay);
        };
        ws.onerror = () => {
            if (!isMounted.current)
                return;
            setStatus('error');
            ws.close();
        };
    }, []);
    useEffect(() => {
        isMounted.current = true;
        connect();
        return () => {
            isMounted.current = false;
            clearInterval(heartbeatTimer.current);
            clearTimeout(retryTimer.current);
            wsRef.current?.close();
        };
    }, [connect]);
    return (_jsx(WsContext.Provider, { value: { status, lastArticle, lastClusterUpdate, lastStrategyUpdate, clientCount }, children: children }));
}
export function useWebSocket() {
    return useContext(WsContext);
}
