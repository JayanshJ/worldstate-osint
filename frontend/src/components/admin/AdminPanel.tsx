import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface OrgStat {
  id: string
  name: string
  slug: string
  created_at: string | null
  user_count: number
  alert_count: number
  api_calls_24h: number
}

interface AuditEntry {
  id: string
  org_id: string | null
  user_email: string | null
  method: string
  path: string
  status_code: number
  latency_ms: number
  ip_address: string | null
  created_at: string
}

interface UsageRow {
  org_id: string | null
  day: string
  calls: number
  avg_latency_ms: number
}

type Tab = 'orgs' | 'usage' | 'audit'

const METHOD_COLORS: Record<string, string> = {
  GET:    'text-blue-400',
  POST:   'text-green-400',
  DELETE: 'text-red-400',
  PATCH:  'text-yellow-400',
  PUT:    'text-orange-400',
}

function statusColor(code: number) {
  if (code < 300) return 'text-green-400'
  if (code < 400) return 'text-yellow-400'
  return 'text-red-400'
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('orgs')
  const [orgs, setOrgs] = useState<OrgStat[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(t: Tab) {
    setLoading(true)
    setError(null)
    try {
      if (t === 'orgs')  setOrgs(await api.admin.listOrgs())
      if (t === 'audit') setAudit(await api.admin.auditLog())
      if (t === 'usage') setUsage(await api.admin.usage())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(tab) }, [tab])

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col font-mono text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-red-400 font-bold text-xs tracking-widest">ADMIN</span>
          <span className="text-white font-bold">WorldState Control Panel</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-gray-800">
        {(['orgs', 'usage', 'audit'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-2 text-xs uppercase tracking-widest border-b-2 transition-colors ${
              tab === t
                ? 'border-green-400 text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'orgs' ? 'Organisations' : t === 'usage' ? 'Usage (30d)' : 'Audit Log'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => load(tab)}
          className="px-4 text-xs text-gray-500 hover:text-green-400"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        {loading && <p className="text-gray-500 animate-pulse">Loading...</p>}
        {error   && <p className="text-red-400">Error: {error}</p>}

        {/* ── Orgs ── */}
        {!loading && tab === 'orgs' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-gray-800">
                <th className="py-2 pr-4">Organisation</th>
                <th className="py-2 pr-4">Slug</th>
                <th className="py-2 pr-4 text-right">Users</th>
                <th className="py-2 pr-4 text-right">Alerts</th>
                <th className="py-2 pr-4 text-right">API Calls (24h)</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(o => (
                <tr key={o.id} className="border-b border-gray-900 hover:bg-gray-900/30">
                  <td className="py-2 pr-4 text-white">{o.name}</td>
                  <td className="py-2 pr-4 text-gray-400">{o.slug}</td>
                  <td className="py-2 pr-4 text-right text-blue-400">{o.user_count}</td>
                  <td className="py-2 pr-4 text-right text-yellow-400">{o.alert_count}</td>
                  <td className="py-2 pr-4 text-right text-green-400">{o.api_calls_24h.toLocaleString()}</td>
                  <td className="py-2 text-gray-500 text-xs">{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-600">No organisations yet</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* ── Usage ── */}
        {!loading && tab === 'usage' && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-widest border-b border-gray-800">
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Org ID</th>
                <th className="py-2 pr-4 text-right">API Calls</th>
                <th className="py-2 text-right">Avg Latency (ms)</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((r, i) => (
                <tr key={i} className="border-b border-gray-900 hover:bg-gray-900/30">
                  <td className="py-2 pr-4 text-white">{r.day}</td>
                  <td className="py-2 pr-4 text-gray-500 text-xs font-mono">{r.org_id ? r.org_id.slice(0, 8) + '…' : 'anonymous'}</td>
                  <td className="py-2 pr-4 text-right text-green-400">{r.calls.toLocaleString()}</td>
                  <td className="py-2 text-right text-yellow-400">{r.avg_latency_ms}</td>
                </tr>
              ))}
              {usage.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-600">No usage data yet</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* ── Audit ── */}
        {!loading && tab === 'audit' && (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-gray-500 uppercase tracking-widest border-b border-gray-800">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2 pr-3 text-right">Status</th>
                <th className="py-2 text-right">ms</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(a => (
                <tr key={a.id} className="border-b border-gray-900 hover:bg-gray-900/20">
                  <td className="py-1 pr-3 text-gray-500">{new Date(a.created_at).toLocaleTimeString()}</td>
                  <td className="py-1 pr-3 text-gray-300">{a.user_email ?? a.ip_address ?? '—'}</td>
                  <td className={`py-1 pr-3 font-bold ${METHOD_COLORS[a.method] ?? 'text-gray-400'}`}>{a.method}</td>
                  <td className="py-1 pr-3 text-gray-400 max-w-xs truncate">{a.path}</td>
                  <td className={`py-1 pr-3 text-right font-bold ${statusColor(a.status_code)}`}>{a.status_code}</td>
                  <td className="py-1 text-right text-gray-500">{a.latency_ms}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-600">No audit entries yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
