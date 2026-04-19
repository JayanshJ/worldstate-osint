import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Radio, Star, X } from 'lucide-react'
import { useLiveFeed } from '@/hooks/useLiveFeed'
import { CredibilityDot } from '@/components/ui/CredibilityDot'
import { getSourceLabel } from '@/types'
import type { RawArticle, WatchlistEntity } from '@/types'
import { cn, formatAbsTime } from '@/lib/utils'
import { useTimezone } from '@/context/TimezoneContext'
import { SmartDigest } from './SmartDigest'
import { MorningBriefing } from './MorningBriefing'
import { api } from '@/lib/api'

// ─── Constants ─────────────────────────────────────────────────────────────

const SOURCE_TYPE_COLORS: Record<string, string> = {
  rss:        '#00d4ff',
  reddit:     '#ff6314',
  playwright: '#a78bfa',
  twitter:    '#1d9bf0',
  live:       '#22c55e',
}

type FeedTab = 'live' | 'digest'

// ─── Sentiment chip ────────────────────────────────────────────────────────

function SentimentChip({ v }: { v: number | null | undefined }) {
  if (v == null) return null
  if (v > 0.15)  return <span className="text-[7.5px] font-mono px-1 py-px rounded-sm bg-green-500/10 text-green-400 border border-green-500/20 flex-shrink-0">BULL</span>
  if (v < -0.15) return <span className="text-[7.5px] font-mono px-1 py-px rounded-sm bg-red-500/10 text-red-400 border border-red-500/20 flex-shrink-0">BEAR</span>
  return null  // skip neutral to reduce noise
}

// ─── Article grouping (collapse duplicates) ────────────────────────────────

interface ArticleGroup {
  primary: RawArticle
  extras:  RawArticle[]
}

function groupByCluster(articles: RawArticle[]): ArticleGroup[] {
  const groups: ArticleGroup[]    = []
  const seen  = new Map<string, ArticleGroup>()

  for (const a of articles) {
    const cid = a.cluster_id ?? null
    if (cid && seen.has(cid)) {
      seen.get(cid)!.extras.push(a)
    } else {
      const g: ArticleGroup = { primary: a, extras: [] }
      groups.push(g)
      if (cid) seen.set(cid, g)
    }
  }
  return groups
}

// ─── Watchlist panel ───────────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: 'person',   label: 'Person'   },
  { value: 'org',      label: 'Org'      },
  { value: 'location', label: 'Location' },
  { value: 'keyword',  label: 'Keyword'  },
] as const

function WatchlistPanel({
  items,
  onAdd,
  onRemove,
  onClose,
}: {
  items:    WatchlistEntity[]
  onAdd:    (item: WatchlistEntity) => void
  onRemove: (name: string) => void
  onClose:  () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WatchlistEntity['type']>('keyword')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, type })
    setName('')
  }

  return (
    <div className="border-b border-terminal-border bg-[#07080f] px-3 py-2.5 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-mono text-terminal-accent tracking-widest">★ WATCHLIST</span>
        <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text"><X size={10} /></button>
      </div>

      {/* Add form */}
      <div className="flex items-center gap-1.5 mb-2">
        <select
          value={type}
          onChange={e => setType(e.target.value as WatchlistEntity['type'])}
          className="text-[9px] font-mono bg-terminal-surface border border-terminal-border text-terminal-dim px-1 py-0.5 rounded-sm flex-shrink-0"
        >
          {ENTITY_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. Jerome Powell"
          className="flex-1 text-[9px] font-mono bg-terminal-surface border border-terminal-border text-terminal-text px-2 py-0.5 rounded-sm placeholder-terminal-dim/50 outline-none focus:border-terminal-accent/50"
        />
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="text-[8px] font-mono px-2 py-0.5 rounded-sm bg-terminal-accent/10 text-terminal-accent border border-terminal-accent/30 hover:bg-terminal-accent/20 transition-colors disabled:opacity-30"
        >
          ADD
        </button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <p className="text-[8px] font-mono text-terminal-dim/50 tracking-wider">No entities watched — add one above</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map(item => (
            <span
              key={item.name}
              className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded-sm bg-terminal-surface border border-terminal-border text-terminal-dim"
            >
              {item.name}
              <button onClick={() => onRemove(item.name)} className="hover:text-red-400 transition-colors">
                <X size={7} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Single article row ────────────────────────────────────────────────────

function ArticleRow({
  article,
  isFirst,
  isWatched,
  timezone,
}: {
  article:   RawArticle
  isFirst:   boolean
  isWatched: boolean
  timezone:  string
}) {
  const srcColor = SOURCE_TYPE_COLORS[article.source_type] ?? '#6b7280'
  const stripColor = isWatched ? '#f59e0b' : srcColor

  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-3 py-2 border-b border-terminal-border/50',
        'hover:bg-terminal-muted/30 transition-colors',
        isFirst && !isWatched && 'bg-terminal-muted/20 animate-fade-in',
        isWatched && 'bg-amber-500/5',
      )}
    >
      <div className="w-0.5 rounded-full flex-shrink-0 self-stretch mt-1" style={{ backgroundColor: stripColor }} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[9px] font-mono font-bold tracking-wider flex-shrink-0" style={{ color: srcColor }}>
            {getSourceLabel(article.source_id)}
          </span>
          <CredibilityDot score={article.credibility_score} sourceId={article.source_id} />
          <SentimentChip v={article.sentiment} />
          <span className="text-[9px] text-terminal-dim font-mono ml-auto flex-shrink-0">
            {formatAbsTime(article.ingested_at, timezone)}
          </span>
        </div>

        {article.url ? (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-terminal-text hover:text-terminal-accent transition-colors leading-snug line-clamp-2 block"
          >
            {article.title}
          </a>
        ) : (
          <p className="text-[11px] font-mono text-terminal-text leading-snug line-clamp-2">
            {article.title}
          </p>
        )}

        {article.cluster_label && (
          <span className="text-[8px] font-mono text-terminal-dim/60 line-clamp-1 mt-0.5">
            ↳ {article.cluster_label}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Article group (with collapse) ────────────────────────────────────────

function ArticleGroupRow({
  group,
  isFirst,
  watchlist,
  timezone,
}: {
  group:     ArticleGroup
  isFirst:   boolean
  watchlist: WatchlistEntity[]
  timezone:  string
}) {
  const [expanded, setExpanded] = useState(false)

  const isWatched = (a: RawArticle) =>
    watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()))

  const primaryWatched = isWatched(group.primary)

  return (
    <>
      <ArticleRow
        article={group.primary}
        isFirst={isFirst}
        isWatched={primaryWatched}
        timezone={timezone}
      />

      {group.extras.length > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-1.5 px-4 py-1 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors text-left"
        >
          <ChevronRight size={8} className="text-terminal-dim" />
          <span className="text-[8.5px] font-mono text-terminal-dim">
            +{group.extras.length} more source{group.extras.length > 1 ? 's' : ''} on this story
          </span>
        </button>
      )}

      {expanded && (
        <>
          {group.extras.map(a => (
            <ArticleRow
              key={a.id}
              article={a}
              isFirst={false}
              isWatched={isWatched(a)}
              timezone={timezone}
            />
          ))}
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center gap-1.5 px-4 py-1 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors"
          >
            <ChevronDown size={8} className="text-terminal-dim" />
            <span className="text-[8.5px] font-mono text-terminal-dim">Collapse</span>
          </button>
        </>
      )}
    </>
  )
}

// ─── Main LiveFeed ─────────────────────────────────────────────────────────

export function LiveFeed() {
  const { articles, loading }     = useLiveFeed()
  const { timezone }              = useTimezone()
  const [tab, setTab]             = useState<FeedTab>('live')
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [watchlist, setWatchlist] = useState<WatchlistEntity[]>([])

  // Load watchlist on mount
  useEffect(() => {
    api.watchlist.get().then(setWatchlist).catch(() => {})
  }, [])

  const addEntity = async (item: WatchlistEntity) => {
    try {
      const updated = await api.watchlist.add(item)
      setWatchlist(updated)
    } catch { /* ignore */ }
  }

  const removeEntity = async (name: string) => {
    try {
      await api.watchlist.remove(name)
      const updated = await api.watchlist.get()
      setWatchlist(updated)
    } catch { /* ignore */ }
  }

  // Sort watched articles to top when watchlist is active
  const sortedArticles = watchlist.length > 0
    ? [...articles].sort((a, b) => {
        const aW = watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()))
        const bW = watchlist.some(w => b.title.toLowerCase().includes(w.name.toLowerCase()))
        return (bW ? 1 : 0) - (aW ? 1 : 0)
      })
    : articles

  const groups = groupByCluster(sortedArticles)

  const watchedCount = watchlist.length > 0
    ? articles.filter(a => watchlist.some(w => a.title.toLowerCase().includes(w.name.toLowerCase()))).length
    : 0

  return (
    <div className="flex flex-col h-full">
      <MorningBriefing />

      {/* Panel header — § eyebrow + serif headline */}
      <div className="px-4 py-3 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-terminal-dim mb-0.5">
              § Live feed
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTab('live')}
                className={cn('font-serif text-[20px] leading-none tracking-[-0.01em] transition-colors',
                  tab === 'live' ? 'text-terminal-text' : 'text-terminal-dim hover:text-terminal-text')}
              >
                {tab === 'live'
                  ? <>Incoming, <em className="italic text-terminal-accent">raw.</em></>
                  : 'Live'}
              </button>
              <span className="text-terminal-dim/30 font-mono text-[11px]">·</span>
              <button
                onClick={() => setTab('digest')}
                className={cn('font-serif text-[20px] leading-none tracking-[-0.01em] transition-colors',
                  tab === 'digest' ? 'text-terminal-text' : 'text-terminal-dim hover:text-terminal-text')}
              >
                {tab === 'digest'
                  ? <>Digest, <em className="italic text-terminal-accent">curated.</em></>
                  : 'Digest'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-0.5 flex-shrink-0">
            {tab === 'live' && (
              <span className="font-mono text-[9px] text-terminal-dim tracking-[0.1em]">
                {articles.length} items
              </span>
            )}
            <span className="w-1.5 h-1.5 rounded-full bg-terminal-accent animate-pulse-dot flex-shrink-0" />

            {tab === 'live' && (
              <button
                onClick={() => setWatchlistOpen(v => !v)}
                className={cn(
                  'flex items-center gap-1 text-[9px] font-mono tracking-[0.1em] transition-colors px-2 py-1 border',
                  watchlistOpen || watchedCount > 0
                    ? 'text-terminal-accent border-terminal-accent/40 bg-terminal-accent/10'
                    : 'text-terminal-dim border-terminal-border hover:text-terminal-text',
                )}
              >
                <Star size={9} fill={watchlistOpen || watchedCount > 0 ? 'currentColor' : 'none'} />
                {watchedCount > 0 && <span>{watchedCount}</span>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Watchlist panel */}
      {tab === 'live' && watchlistOpen && (
        <WatchlistPanel
          items={watchlist}
          onAdd={addEntity}
          onRemove={removeEntity}
          onClose={() => setWatchlistOpen(false)}
        />
      )}

      {/* Body */}
      {tab === 'digest' ? (
        <SmartDigest />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-px">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-10 bg-terminal-surface animate-pulse mx-2 my-1 rounded-sm" />
              ))}
            </div>
          )}

          {!loading && groups.map((group, idx) => (
            <ArticleGroupRow
              key={group.primary.id}
              group={group}
              isFirst={idx === 0}
              watchlist={watchlist}
              timezone={timezone}
            />
          ))}

          {!loading && articles.length === 0 && (
            <div className="text-center py-8 text-terminal-dim font-mono text-xs">
              Waiting for data…
            </div>
          )}
        </div>
      )}
    </div>
  )
}
