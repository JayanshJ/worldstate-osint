import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Search, X, Zap } from 'lucide-react'
import { api, type ArticleHit, type ClusterHit, type SearchResponse } from '@/lib/api'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { CredibilityDot } from '@/components/ui/CredibilityDot'
import { cn, timeAgo } from '@/lib/utils'
import { getSourceLabel } from '@/types'

interface Props {
  onClose:          () => void
  onClusterSelect?: (id: string) => void
}

type SearchMode = 'keyword' | 'semantic'

export function SearchPanel({ onClose, onClusterSelect }: Props) {
  const [query, setQuery]     = useState('')
  const [mode, setMode]       = useState<SearchMode>('keyword')
  const [result, setResult]   = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const debounceRef           = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { inputRef.current?.focus() }, [])

  // Keyboard: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const runSearch = useCallback(async (q: string, m: SearchMode) => {
    if (q.trim().length < 2) { setResult(null); return }
    setLoading(true)
    setError(null)
    try {
      const data = await api.search.query(q.trim(), m, 15)
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInput = (val: string) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    // Semantic search is expensive — longer debounce
    debounceRef.current = setTimeout(
      () => runSearch(val, mode),
      mode === 'semantic' ? 800 : 300,
    )
  }

  const handleModeChange = (m: SearchMode) => {
    setMode(m)
    if (query.trim().length >= 2) runSearch(query, m)
  }

  const hasResults = result && result.total > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        className="w-full max-w-2xl bg-terminal-surface border border-terminal-border rounded-sm shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 8rem)' }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-terminal-border">
          {loading
            ? <Loader2 size={14} className="text-terminal-accent animate-spin flex-shrink-0" />
            : <Search size={14} className="text-terminal-dim flex-shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder="Search events, entities, locations…"
            className={cn(
              'flex-1 bg-transparent font-mono text-sm text-terminal-text',
              'placeholder-terminal-dim outline-none',
            )}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResult(null) }}>
              <X size={12} className="text-terminal-dim hover:text-terminal-text" />
            </button>
          )}
          {/* Mode toggle */}
          <div className="flex items-center gap-1 border border-terminal-border rounded-sm p-0.5 flex-shrink-0">
            {(['keyword', 'semantic'] as SearchMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={cn(
                  'text-[9px] font-mono px-2 py-0.5 rounded-sm transition-colors tracking-widest',
                  mode === m
                    ? 'bg-terminal-accent/20 text-terminal-accent'
                    : 'text-terminal-dim hover:text-terminal-text',
                )}
              >
                {m === 'semantic' ? '⚡ AI' : 'TXT'}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-terminal-dim hover:text-terminal-text ml-1">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
          {error && (
            <div className="px-4 py-3 text-xs text-red-400 font-mono">⚠ {error}</div>
          )}

          {!loading && query.length >= 2 && !hasResults && (
            <div className="px-4 py-8 text-center text-terminal-dim font-mono text-xs">
              No results for "{query}"
            </div>
          )}

          {hasResults && (
            <>
              {/* Cluster hits */}
              {result!.cluster_hits.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border uppercase bg-terminal-bg/50">
                    Event Clusters ({result!.cluster_hits.length})
                  </div>
                  {result!.cluster_hits.map(hit => (
                    <ClusterResultRow
                      key={hit.cluster_id}
                      hit={hit}
                      onSelect={() => { onClusterSelect?.(hit.cluster_id); onClose() }}
                    />
                  ))}
                </div>
              )}

              {/* Article hits */}
              {result!.article_hits.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[9px] font-mono text-terminal-dim tracking-widest border-b border-terminal-border uppercase bg-terminal-bg/50">
                    Articles ({result!.article_hits.length})
                  </div>
                  {result!.article_hits.map(hit => (
                    <ArticleResultRow key={hit.article_id} hit={hit} />
                  ))}
                </div>
              )}
            </>
          )}

          {!query && (
            <div className="px-4 py-6 text-center text-terminal-dim font-mono text-xs space-y-1">
              <p>TXT mode: trigram keyword matching</p>
              <p>⚡ AI mode: semantic meaning search (slower)</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="px-4 py-2 border-t border-terminal-border flex items-center justify-between">
            <span className="text-[9px] font-mono text-terminal-dim">
              {result!.total} results · {mode} · "{result!.query}"
            </span>
            <span className="text-[9px] font-mono text-terminal-dim">ESC to close</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function ClusterResultRow({ hit, onSelect }: { hit: ClusterHit; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50 hover:bg-terminal-muted/30 transition-colors text-left group"
    >
      <div className="flex-shrink-0 mt-0.5">
        <VolatilityBadge volatility={hit.volatility} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-terminal-text group-hover:text-terminal-accent transition-colors truncate">
          {hit.label ?? 'Unnamed cluster'}
        </p>
        {hit.bullets?.[0] && (
          <p className="font-mono text-[10px] text-terminal-dim mt-0.5 line-clamp-1">
            {hit.bullets[0]}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[10px] font-mono text-terminal-dim">{hit.member_count} src</div>
        <div className="text-[9px] font-mono text-terminal-accent/60">{(hit.score * 100).toFixed(0)}%</div>
      </div>
    </button>
  )
}

function ArticleResultRow({ hit }: { hit: ArticleHit }) {
  const content = (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-terminal-border/30 hover:bg-terminal-muted/20 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <CredibilityDot score={hit.credibility_score} sourceId={hit.source_id} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-terminal-text line-clamp-1">{hit.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-terminal-dim font-mono">
            {getSourceLabel(hit.source_id)}
          </span>
          {hit.cluster_label && (
            <span className="text-[9px] text-terminal-accent font-mono truncate max-w-[180px]">
              ↳ {hit.cluster_label}
            </span>
          )}
          <span className="text-[9px] text-terminal-dim font-mono ml-auto">
            {timeAgo(hit.published_at)}
          </span>
        </div>
      </div>
    </div>
  )
  return hit.url
    ? <a href={hit.url} target="_blank" rel="noopener noreferrer">{content}</a>
    : <div>{content}</div>
}
