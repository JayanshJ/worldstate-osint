import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type AlertWatch, type AlertWatchCreate } from '@/lib/api'
import { useWebSocket } from '@/context/WebSocketContext'

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

  // ─── Ingest alert notification (defined first — used in WS effect below) ──

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

  // ─── Wire up to shared WebSocket context ──────────────────────────────

  const { lastAlert } = useWebSocket()
  useEffect(() => {
    if (lastAlert) ingestAlertPayload(lastAlert)
  }, [lastAlert, ingestAlertPayload])

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
