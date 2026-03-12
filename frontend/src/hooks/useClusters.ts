import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { EventCluster, WsClusterUpdateData } from '@/types'
import { useWebSocket } from '@/context/WebSocketContext'

const MAX_CLUSTERS = 200
const NEW_FLASH_MS = 4000

export function useClusters() {
  const [clusters, setClusters] = useState<EventCluster[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const { lastClusterUpdate }   = useWebSocket()
  const flashTimers             = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Initial load
  useEffect(() => {
    api.clusters
      .list({ limit: 50, activeOnly: true })
      .then(data => {
        setClusters(data.sort((a, b) =>
          new Date(b.last_updated_at ?? 0).getTime() - new Date(a.last_updated_at ?? 0).getTime()
        ))
        setLoading(false)
      })
      .catch(e => {
        setError(String(e))
        setLoading(false)
      })
  }, [])

  // Merge incoming WS cluster updates
  useEffect(() => {
    if (!lastClusterUpdate) return
    mergeClusterUpdate(lastClusterUpdate)
  }, [lastClusterUpdate])

  const clearFlash = useCallback((id: string, key: 'isNew' | 'isUpdated') => {
    setClusters(prev =>
      prev.map(c => c.id === id ? { ...c, [key]: false } : c)
    )
  }, [])

  const mergeClusterUpdate = useCallback((update: WsClusterUpdateData) => {
    setClusters(prev => {
      const idx = prev.findIndex(c => c.id === update.cluster_id)

      if (idx >= 0) {
        // Update existing — flash "updated"
        const updated = prev.map((c, i) =>
          i === idx
            ? {
                ...c,
                label:         update.label,
                bullets:       update.bullets,
                entities:      update.entities,
                volatility:    update.volatility,
                sentiment:     update.sentiment,
                member_count:  update.member_count,
                weighted_score: update.weighted_score,
                last_updated_at: new Date().toISOString(),
                isUpdated:     true,
                isNew:         false,
              }
            : c
        )
        // Re-sort by recency
        updated.sort((a, b) =>
          new Date(b.last_updated_at ?? 0).getTime() - new Date(a.last_updated_at ?? 0).getTime()
        )

        const timer = flashTimers.current.get(update.cluster_id)
        if (timer) clearTimeout(timer)
        flashTimers.current.set(
          update.cluster_id,
          setTimeout(() => clearFlash(update.cluster_id, 'isUpdated'), NEW_FLASH_MS),
        )
        return updated.slice(0, MAX_CLUSTERS)
      } else {
        // New cluster — prepend + flash "new"
        const newCluster: EventCluster = {
          id:              update.cluster_id,
          label:           update.label,
          bullets:         update.bullets,
          entities:        update.entities,
          volatility:      update.volatility,
          sentiment:       update.sentiment,
          member_count:    update.member_count,
          weighted_score:  update.weighted_score,
          first_seen_at:   new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          is_active:       true,
          isNew:           true,
        }
        flashTimers.current.set(
          update.cluster_id,
          setTimeout(() => clearFlash(update.cluster_id, 'isNew'), NEW_FLASH_MS),
        )
        return [newCluster, ...prev].slice(0, MAX_CLUSTERS)
      }
    })
  }, [clearFlash])

  return { clusters, loading, error }
}
