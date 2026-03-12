import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ConnectionStatus,
  MarketStrategy,
  WsClusterUpdateData,
  WsMessage,
  WsNewArticleData,
  WsStrategyUpdateData,
} from '@/types'

interface WsContextValue {
  status:              ConnectionStatus
  lastArticle:         WsNewArticleData | null
  lastClusterUpdate:   WsClusterUpdateData | null
  lastStrategyUpdate:  MarketStrategy[] | null
  clientCount:         number
}

const WsContext = createContext<WsContextValue>({
  status:             'connecting',
  lastArticle:        null,
  lastClusterUpdate:  null,
  lastStrategyUpdate: null,
  clientCount:        0,
})

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY = 30_000

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [status, setStatus]               = useState<ConnectionStatus>('connecting')
  const [lastArticle, setLastArticle]     = useState<WsNewArticleData | null>(null)
  const [lastClusterUpdate, setLastClusterUpdate] = useState<WsClusterUpdateData | null>(null)
  const [lastStrategyUpdate, setLastStrategyUpdate] = useState<MarketStrategy[] | null>(null)
  const [clientCount, setClientCount]     = useState(0)

  const wsRef         = useRef<WebSocket | null>(null)
  const retryCount    = useRef(0)
  const retryTimer    = useRef<ReturnType<typeof setTimeout>>()
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>()
  const isMounted     = useRef(true)

  const connect = useCallback(() => {
    if (!isMounted.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMounted.current) return
      setStatus('connected')
      retryCount.current = 0

      // Send heartbeat ping every 25s
      clearInterval(heartbeatTimer.current)
      heartbeatTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping')
      }, 25_000)
    }

    ws.onmessage = (event: MessageEvent<string>) => {
      if (!isMounted.current) return
      try {
        const msg: WsMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'connected':
            setClientCount((msg.data as { clients: number }).clients ?? 0)
            break
          case 'new_article':
            setLastArticle(msg.data as WsNewArticleData)
            break
          case 'cluster_update':
            setLastClusterUpdate(msg.data as WsClusterUpdateData)
            break
          case 'strategy_update':
            setLastStrategyUpdate((msg.data as WsStrategyUpdateData).strategies ?? null)
            break
          // 'heartbeat' and 'pong' — no state update needed
        }
      } catch {
        // malformed message — ignore
      }
    }

    ws.onclose = () => {
      if (!isMounted.current) return
      clearInterval(heartbeatTimer.current)
      setStatus('disconnected')

      // Exponential backoff
      const delay = Math.min(
        RECONNECT_DELAY_MS * 2 ** retryCount.current,
        MAX_RECONNECT_DELAY,
      )
      retryCount.current += 1
      retryTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      if (!isMounted.current) return
      setStatus('error')
      ws.close()
    }
  }, [])

  useEffect(() => {
    isMounted.current = true
    connect()
    return () => {
      isMounted.current = false
      clearInterval(heartbeatTimer.current)
      clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return (
    <WsContext.Provider value={{ status, lastArticle, lastClusterUpdate, lastStrategyUpdate, clientCount }}>
      {children}
    </WsContext.Provider>
  )
}

export function useWebSocket() {
  return useContext(WsContext)
}
