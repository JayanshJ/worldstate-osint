import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { api } from '@/lib/api'
import type { DigestStory } from '@/types'
import { useTimezone } from '@/context/TimezoneContext'
import { formatAbsTime } from '@/lib/utils'

const REFRESH_MS = 15 * 60 * 1000

function SentimentIcon({ v }: { v: number }) {
  if (v > 0.15)  return <TrendingUp  size={9} className="text-green-400" />
  if (v < -0.15) return <TrendingDown size={9} className="text-red-400" />
  return <Minus size={9} className="text-gray-500" />
}

function VolDot({ v }: { v: number }) {
  const color = v > 0.7 ? '#ef4444' : v > 0.5 ? '#f97316' : v > 0.3 ? '#eab308' : '#22c55e'
  return <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

export function SmartDigest() {
  const [stories, setStories]   = useState<DigestStory[]>([])
  const [loading, setLoading]   = useState(true)
  const [spinning, setSpinning] = useState(false)
  const { timezone } = useTimezone()

  const load = useCallback(async (bust = false) => {
    if (bust) setSpinning(true)
    try {
      const data = bust ? await api.digest.refresh() : await api.digest.get()
      setStories(data)
    } catch { /* ignore */ }
    finally { setLoading(false); setSpinning(false) }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(), REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-terminal-surface animate-pulse rounded-sm" />
        ))}
      </div>
    )
  }

  if (!stories.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[10px] font-mono text-terminal-dim tracking-widest">
          NO DIGEST AVAILABLE YET
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-terminal-border/50 flex-shrink-0">
        <span className="text-[8px] font-mono text-terminal-dim tracking-widest">
          TOP STORIES · AUTO-REFRESHES EVERY 15 MIN
        </span>
        <button
          onClick={() => load(true)}
          disabled={spinning}
          className="text-terminal-dim hover:text-terminal-accent transition-colors"
        >
          <RefreshCw size={9} className={spinning ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stories.map((story, i) => (
          <div
            key={story.id}
            className="px-3 py-2.5 border-b border-terminal-border/40 hover:bg-terminal-muted/20 transition-colors"
          >
            {/* Story rank + label */}
            <div className="flex items-start gap-2 mb-1.5">
              <span className="text-[9px] font-mono text-terminal-dim flex-shrink-0 mt-px">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <SentimentIcon v={story.sentiment} />
                  <VolDot v={story.volatility} />
                  <span className="text-[9px] font-mono text-terminal-dim">
                    {story.member_count} sources
                  </span>
                  <span className="text-[9px] font-mono text-terminal-dim ml-auto">
                    {story.last_updated_at ? formatAbsTime(story.last_updated_at, timezone) : ''}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-terminal-text font-semibold leading-snug">
                  {story.label}
                </p>
              </div>
            </div>

            {/* Bullets */}
            {story.bullets.length > 0 && (
              <ul className="pl-5 space-y-0.5">
                {story.bullets.map((b, bi) => (
                  <li key={bi} className="text-[9.5px] font-mono text-terminal-dim leading-snug list-disc">
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {/* Entity pills */}
            {story.entities && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[
                  ...(story.entities.people       ?? []).slice(0, 2).map(e => ({ e, t: '👤' })),
                  ...(story.entities.organizations ?? []).slice(0, 2).map(e => ({ e, t: '🏛' })),
                  ...(story.entities.locations     ?? []).slice(0, 1).map(e => ({ e, t: '📍' })),
                ].map(({ e, t }) => (
                  <span key={e} className="text-[8px] font-mono px-1.5 py-0.5 rounded-sm bg-terminal-surface text-terminal-dim border border-terminal-border/50">
                    {t} {e}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
