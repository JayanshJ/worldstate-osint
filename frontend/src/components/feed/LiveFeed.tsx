import { Radio } from 'lucide-react'
import { useLiveFeed } from '@/hooks/useLiveFeed'
import { CredibilityDot } from '@/components/ui/CredibilityDot'
import { getSourceLabel } from '@/types'
import { cn, timeAgo } from '@/lib/utils'

const SOURCE_TYPE_COLORS: Record<string, string> = {
  rss:       '#00d4ff',
  reddit:    '#ff6314',
  playwright:'#a78bfa',
  twitter:   '#1d9bf0',
  live:      '#22c55e',
}

export function LiveFeed() {
  const { articles, loading } = useLiveFeed()

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-terminal-border flex-shrink-0">
        <Radio size={11} className="text-green-400 animate-pulse" />
        <span className="text-[11px] font-mono font-semibold text-green-400 tracking-widest">
          LIVE FEED
        </span>
        <span className="text-[10px] font-mono bg-terminal-muted px-1.5 py-0.5 rounded text-terminal-dim ml-auto">
          {articles.length}
        </span>
      </div>

      {/* Articles */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-px">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 bg-terminal-surface animate-pulse mx-2 my-1 rounded-sm" />
            ))}
          </div>
        )}

        {articles.map((article, idx) => {
          const srcColor = SOURCE_TYPE_COLORS[article.source_type] ?? '#6b7280'
          const isFirst  = idx === 0

          return (
            <div
              key={article.id}
              className={cn(
                'group flex items-start gap-2 px-3 py-2 border-b border-terminal-border/50',
                'hover:bg-terminal-muted/30 transition-colors',
                isFirst && 'bg-terminal-muted/20 animate-fade-in',
              )}
            >
              {/* Source type strip */}
              <div
                className="w-0.5 rounded-full flex-shrink-0 self-stretch mt-1"
                style={{ backgroundColor: srcColor }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[9px] font-mono font-bold tracking-wider flex-shrink-0"
                    style={{ color: srcColor }}
                  >
                    {getSourceLabel(article.source_id)}
                  </span>
                  <CredibilityDot score={article.credibility_score} sourceId={article.source_id} />
                  <span className="text-[9px] text-terminal-dim font-mono ml-auto flex-shrink-0">
                    {timeAgo(article.ingested_at)}
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
              </div>
            </div>
          )
        })}

        {!loading && articles.length === 0 && (
          <div className="text-center py-8 text-terminal-dim font-mono text-xs">
            Waiting for data…
          </div>
        )}
      </div>
    </div>
  )
}
