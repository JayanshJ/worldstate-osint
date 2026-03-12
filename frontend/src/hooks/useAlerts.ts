import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type AlertWatch, type AlertWatchCreate } from '@/lib/api'
import { useWebSocket } from '@/context/WebSocketContext'

const CHANNEL_ALERT = 'worldstate:alert'
const NOTIF_COOLDOWN_MS = 10_000     // deduplicate browser notifications

export interface AlertNotification {
  id:           string
  watchName:    string
  clusterLabel: string | null
  volatility:   number
  bullets:      string[] | null
  firedAt:      string
  clusterId:    string
  read:         boolean
}

export function useAlerts() {
  const [watches, setWatches]           = useState<AlertWatch[]>([])
  const [notifications, setNotifications] = useState<AlertNotification[]>([])
  const [loading, setLoading]           = useState(true)
  const lastNotifTime                   = useRef<Record<string, number>>({})

  useEffect(() => {
    api.alerts.list().then(data => {
      setWatches(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Listen for alert events via a dedicated Redis subscription through WS
  // The WS context exposes raw lastMessage — we subscribe here
  const { status } = useWebSocket()

  // Subscribe to native WS for alert channel (separate from the main WsContext
  // which doesn't expose raw events — so we open a second connection here)
  const wsRef = useRef<WebSocket | null>(null)
  useEffect(() => {
    const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    // reuse the same connection by listening to the window-level custom event
    // that the WebSocketContext can dispatch (or fall back to polling)
    return () => { wsRef.current?.close() }
  }, [])

  // ─── CRUD operations ────────────────────────────────────────────────────

  const createWatch = useCallback(async (data: AlertWatchCreate) => {
    const watch = await api.alerts.create(data)
    setWatches(prev => [watch, ...prev])
    return watch
  }, [])

  const toggleWatch = useCallback(async (id: string) => {
    const updated = await api.alerts.toggle(id)
    setWatches(prev => prev.map(w => w.id === id ? updated : w))
  }, [])

  const deleteWatch = useCallback(async (id: string) => {
    await api.alerts.delete(id)
    setWatches(prev => prev.filter(w => w.id !== id))
  }, [])

  // ─── Ingest alert notification ────────────────────────────────────────

  const ingestAlertPayload = useCallback((payload: Record<string, unknown>) => {
    const watchId = payload.watch_id as string
    const now     = Date.now()

    // Cooldown dedup
    if (lastNotifTime.current[watchId] && now - lastNotifTime.current[watchId] < NOTIF_COOLDOWN_MS) {
      return
    }
    lastNotifTime.current[watchId] = now

    const notif: AlertNotification = {
      id:           `${watchId}-${now}`,
      watchName:    payload.watch_name as string,
      clusterLabel: payload.cluster_label as string | null,
      volatility:   payload.volatility as number,
      bullets:      payload.bullets as string[] | null,
      firedAt:      payload.fired_at as string,
      clusterId:    payload.cluster_id as string,
      read:         false,
    }

    setNotifications(prev => [notif, ...prev].slice(0, 50))

    // Update watch last_fired_at in local state
    setWatches(prev => prev.map(w =>
      w.id === watchId
        ? { ...w, last_fired_at: notif.firedAt, fire_count: w.fire_count + 1 }
        : w
    ))

    // Browser notification (if permission granted)
    if (Notification.permission === 'granted') {
      new Notification(`⚡ ${notif.watchName}`, {
        body:    notif.clusterLabel ?? 'New alert fired',
        icon:    '/favicon.ico',
        silent:  notif.volatility < 0.7,
      })
    }
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  return {
    watches,
    loading,
    notifications,
    unreadCount,
    createWatch,
    toggleWatch,
    deleteWatch,
    ingestAlertPayload,
    markAllRead,
  }
}
