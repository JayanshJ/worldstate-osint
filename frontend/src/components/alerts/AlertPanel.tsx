import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, Plus, Trash2, ToggleLeft, ToggleRight, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useAlerts } from '@/hooks/useAlerts'
import type { AlertWatchCreate, AlertWatch } from '@/lib/api'
import { VolatilityBadge } from '@/components/ui/VolatilityBadge'
import { cn, timeAgo } from '@/lib/utils'

interface Props {
  onClose:          () => void
  onClusterSelect?: (id: string) => void
}

export function AlertPanel({ onClose, onClusterSelect }: Props) {
  const {
    watches, loading, notifications, unreadCount,
    createWatch, toggleWatch, deleteWatch, markAllRead,
  } = useAlerts()

  const [tab, setTab]             = useState<'watches' | 'notifications'>('notifications')
  const [showCreate, setShowCreate] = useState(false)

  // Request browser notification permission
  const requestNotifPermission = async () => {
    if (Notification.permission === 'default') await Notification.requestPermission()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        className="w-full max-w-sm bg-terminal-surface border border-terminal-border rounded-sm shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 5rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <BellRing size={12} className="text-terminal-accent" />
            <span className="font-mono text-[11px] font-bold text-terminal-accent tracking-widest">
              ALERTS
            </span>
            {unreadCount > 0 && (
              <span className="text-[9px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-sm animate-pulse">
                {unreadCount} NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {Notification.permission !== 'granted' && (
              <button
                onClick={requestNotifPermission}
                className="text-[9px] font-mono text-terminal-accent/70 hover:text-terminal-accent border border-terminal-accent/30 px-2 py-0.5 rounded-sm"
              >
                ENABLE PUSH
              </button>
            )}
            <button onClick={onClose}>
              <X size={12} className="text-terminal-dim hover:text-terminal-text" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-terminal-border flex-shrink-0">
          {[
            { key: 'notifications', label: `FIRED (${notifications.length})` },
            { key: 'watches',       label: `WATCHES (${watches.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as typeof tab); if (t.key === 'notifications') markAllRead() }}
              className={cn(
                'flex-1 py-2 text-[10px] font-mono font-semibold tracking-widest transition-colors',
                tab === t.key
                  ? 'text-terminal-accent border-b-2 border-terminal-accent'
                  : 'text-terminal-dim hover:text-terminal-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {tab === 'notifications' && (
            <NotificationsTab
              notifications={notifications}
              onClusterSelect={id => { onClusterSelect?.(id); onClose() }}
            />
          )}
          {tab === 'watches' && (
            <WatchesTab
              watches={watches}
              loading={loading}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              onToggle={toggleWatch}
              onDelete={deleteWatch}
              onCreate={createWatch}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Notifications Tab ────────────────────────────────────────────────────

function NotificationsTab({
  notifications,
  onClusterSelect,
}: {
  notifications: ReturnType<typeof useAlerts>['notifications']
  onClusterSelect: (id: string) => void
}) {
  if (!notifications.length) {
    return (
      <div className="py-12 text-center text-terminal-dim font-mono text-xs">
        <Bell size={20} className="mx-auto mb-2 opacity-20" />
        No alerts fired yet
      </div>
    )
  }
  return (
    <div>
      {notifications.map(n => (
        <button
          key={n.id}
          onClick={() => onClusterSelect(n.clusterId)}
          className={cn(
            'w-full text-left flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50',
            'hover:bg-terminal-muted/30 transition-colors',
            !n.read && 'bg-terminal-accent/5',
          )}
        >
          <div className="flex-shrink-0 mt-0.5">
            <VolatilityBadge volatility={n.volatility} size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono font-semibold text-terminal-accent truncate">
              {n.watchName}
            </p>
            <p className="text-[11px] font-mono text-terminal-text leading-snug mt-0.5 line-clamp-2">
              {n.clusterLabel ?? 'Unnamed cluster'}
            </p>
            {n.bullets?.[0] && (
              <p className="text-[10px] font-mono text-terminal-dim mt-1 line-clamp-1">
                {n.bullets[0]}
              </p>
            )}
            <p className="text-[9px] font-mono text-terminal-dim mt-1">{timeAgo(n.firedAt)}</p>
          </div>
          {!n.read && (
            <div className="w-1.5 h-1.5 rounded-full bg-terminal-accent flex-shrink-0 mt-1.5" />
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Watches Tab ─────────────────────────────────────────────────────────

function WatchesTab({
  watches, loading, showCreate, setShowCreate, onToggle, onDelete, onCreate,
}: {
  watches:         AlertWatch[]
  loading:         boolean
  showCreate:      boolean
  setShowCreate:   (v: boolean) => void
  onToggle:        (id: string) => void
  onDelete:        (id: string) => void
  onCreate:        (data: AlertWatchCreate) => Promise<unknown>
}) {
  return (
    <div>
      {/* Create button */}
      <div className="p-3 border-b border-terminal-border">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-mono font-semibold text-terminal-accent border border-terminal-accent/30 rounded-sm hover:bg-terminal-accent/10 transition-colors"
        >
          <Plus size={10} />
          NEW WATCH RULE
          {showCreate ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <CreateWatchForm
                onCreate={async data => { await onCreate(data); setShowCreate(false) }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading && <div className="p-4 text-center text-terminal-dim font-mono text-xs">Loading…</div>}

      {!loading && !watches.length && (
        <div className="py-8 text-center text-terminal-dim font-mono text-xs">
          No watch rules defined
        </div>
      )}

      {watches.map(watch => (
        <div
          key={watch.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50',
            !watch.is_active && 'opacity-50',
          )}
        >
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[11px] font-semibold text-terminal-text truncate">{watch.name}</p>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
              {watch.keywords && (
                <span className="text-[9px] font-mono text-yellow-400/70">
                  kw: {watch.keywords.slice(0, 3).join(', ')}
                </span>
              )}
              {watch.entities && (
                <span className="text-[9px] font-mono text-purple-400/70">
                  ent: {watch.entities.slice(0, 2).join(', ')}
                </span>
              )}
              {watch.min_volatility > 0 && (
                <span className="text-[9px] font-mono text-orange-400/70">
                  v≥{watch.min_volatility.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-[9px] font-mono text-terminal-dim mt-1">
              Fired {watch.fire_count}× · {watch.last_fired_at ? timeAgo(watch.last_fired_at) : 'never'}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onToggle(watch.id)} className="p-1 text-terminal-dim hover:text-terminal-text">
              {watch.is_active
                ? <ToggleRight size={14} className="text-green-400" />
                : <ToggleLeft size={14} />
              }
            </button>
            <button onClick={() => onDelete(watch.id)} className="p-1 text-terminal-dim hover:text-red-400">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Create Watch Form ────────────────────────────────────────────────────

function CreateWatchForm({ onCreate }: { onCreate: (data: AlertWatchCreate) => Promise<void> }) {
  const [name, setName]         = useState('')
  const [keywords, setKeywords] = useState('')
  const [entities, setEntities] = useState('')
  const [minVolt, setMinVolt]   = useState('0.4')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name required'); return }
    const kws = keywords.split(',').map(s => s.trim()).filter(Boolean)
    const ents = entities.split(',').map(s => s.trim()).filter(Boolean)
    if (!kws.length && !ents.length) { setError('Add at least one keyword or entity'); return }

    setSaving(true)
    try {
      await onCreate({
        name: name.trim(),
        keywords: kws.length ? kws : undefined,
        entities: ents.length ? ents : undefined,
        min_volatility: parseFloat(minVolt) || 0,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <p className="text-[9px] text-red-400 font-mono">{error}</p>}
      <Field label="Name" value={name} onChange={setName} placeholder="e.g. NATO alerts" />
      <Field label="Keywords (comma-sep)" value={keywords} onChange={setKeywords} placeholder="ukraine, nato, missile" />
      <Field label="Entities (comma-sep)" value={entities} onChange={setEntities} placeholder="Zelensky, NATO" />
      <div>
        <label className="text-[9px] font-mono text-terminal-dim block mb-1">Min Volatility</label>
        <input
          type="range" min="0" max="1" step="0.05"
          value={minVolt}
          onChange={e => setMinVolt(e.target.value)}
          className="w-full accent-terminal-accent"
        />
        <span className="text-[9px] font-mono text-terminal-dim">{parseFloat(minVolt).toFixed(2)}</span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-2 text-[10px] font-mono font-bold text-terminal-bg bg-terminal-accent hover:bg-terminal-accent/90 rounded-sm disabled:opacity-50"
      >
        {saving ? 'SAVING…' : 'CREATE WATCH'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[9px] font-mono text-terminal-dim block mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-terminal-bg border border-terminal-border rounded-sm px-2 py-1.5 text-[11px] font-mono text-terminal-text placeholder-terminal-dim/50 outline-none focus:border-terminal-accent/50"
      />
    </div>
  )
}
