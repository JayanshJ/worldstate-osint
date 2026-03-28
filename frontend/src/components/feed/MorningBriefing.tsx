import { useEffect, useState, useCallback } from 'react'
import { Sun, RefreshCw, TrendingUp, TrendingDown, Shield, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import type { MorningBriefing as BriefingType } from '@/types'
import { cn } from '@/lib/utils'

const DIR_STYLE: Record<string, { color: string; icon: JSX.Element }> = {
  LONG:  { color: '#22c55e', icon: <TrendingUp  size={10} /> },
  SHORT: { color: '#ef4444', icon: <TrendingDown size={10} /> },
  HEDGE: { color: '#eab308', icon: <Shield       size={10} /> },
  WATCH: { color: '#8b5cf6', icon: <Eye          size={10} /> },
}

function relDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function MorningBriefing() {
  const [briefing,   setBriefing]   = useState<BriefingType | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded,   setExpanded]   = useState(true)

  const load = useCallback(async () => {
    try {
      const b = await api.briefing.get()
      setBriefing(b)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const r = await api.briefing.refresh()
      if (r.briefing) setBriefing(r.briefing)
    } catch {
      // silent
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return null
  if (!briefing) return (
    <div className="border-b border-terminal-border px-4 py-3 bg-terminal-surface/30 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Sun size={11} className="text-yellow-400/50" />
        <span className="text-[10px] font-mono text-terminal-dim">No morning briefing yet</span>
      </div>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="text-[9px] font-mono text-terminal-accent hover:underline disabled:opacity-50"
      >
        {refreshing ? 'GENERATING…' : 'GENERATE'}
      </button>
    </div>
  )

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/5 flex-shrink-0">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Sun size={11} className="text-yellow-400" />
          <span className="text-[10px] font-mono font-bold text-yellow-400/80 tracking-widest">
            MORNING BRIEFING
          </span>
          <span className="text-[9px] font-mono text-terminal-dim hidden sm:block">
            {relDate(briefing.date)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={e => { e.stopPropagation(); handleRefresh() }}
            disabled={refreshing}
            className="text-[9px] font-mono text-terminal-dim hover:text-terminal-accent transition-colors disabled:opacity-40"
          >
            <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {expanded ? <ChevronUp size={11} className="text-terminal-dim" /> : <ChevronDown size={11} className="text-terminal-dim" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Headline + TLDR */}
          <div>
            <h3 className="text-[14px] font-bold text-terminal-text leading-snug mb-1">
              {briefing.headline}
            </h3>
            <p className="text-[11px] text-terminal-dim leading-relaxed">
              {briefing.tldr}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Top Events */}
            <div>
              <p className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2">TOP EVENTS</p>
              <div className="space-y-1.5">
                {briefing.top_events.slice(0, 4).map((ev, i) => {
                  const volColor = ev.volatility >= 0.7 ? '#ef4444' : ev.volatility >= 0.4 ? '#f97316' : '#22c55e'
                  return (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className="font-mono font-bold mt-0.5 flex-shrink-0" style={{ color: volColor }}>
                        ●
                      </span>
                      <div>
                        <span className="text-terminal-text font-semibold">{ev.title}</span>
                        <span className="text-terminal-dim ml-1">— {ev.summary}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Trade Setups */}
            <div>
              <p className="text-[9px] font-mono text-terminal-dim tracking-widest mb-2">SETUPS</p>
              <div className="space-y-1.5">
                {briefing.trade_setups.slice(0, 4).map((s, i) => {
                  const style = DIR_STYLE[s.direction] ?? DIR_STYLE.WATCH
                  return (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <div
                        className="flex items-center gap-1 font-mono font-bold flex-shrink-0 mt-0.5 px-1 py-0.5 rounded-sm border text-[8px]"
                        style={{ color: style.color, borderColor: `${style.color}40`, background: `${style.color}10` }}
                      >
                        {style.icon}
                        {s.direction}
                      </div>
                      <div>
                        <span className="text-terminal-text font-semibold">{s.asset}</span>
                        <span className="text-terminal-dim ml-1">— {s.thesis}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Macro theme */}
          {briefing.macro_theme && (
            <div className="flex items-start gap-2 pt-1 border-t border-terminal-border/30">
              <span className="text-[9px] font-mono text-terminal-dim tracking-widest flex-shrink-0 mt-0.5">
                THEME
              </span>
              <span className="text-[10px] text-terminal-dim italic">{briefing.macro_theme}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
