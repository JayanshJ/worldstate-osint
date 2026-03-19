import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTimezone, TIMEZONE_GROUPS } from '@/context/TimezoneContext'
import { api } from '@/lib/api'

export function AccountSettings({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  const { timezone, setTimezone } = useTimezone()
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await api.account.deleteMe()
      logout()
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center font-mono">
      <div className="bg-[#0c0e18] border border-[#1e2235] w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-[#1e2235]">
          <span className="text-[11px] tracking-[0.2em] text-terminal-accent font-bold uppercase">
            Account Settings
          </span>
          <button onClick={onClose} className="text-[#4a5568] hover:text-white transition-colors text-sm">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Timezone */}
          <div className="border border-[#1e2235] p-4">
            <p className="text-[9px] text-[#4a5568] uppercase tracking-[0.2em] mb-3">Display Timezone</p>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full bg-[#0f1117] border border-[#1e2235] text-terminal-text text-[11px] font-mono px-3 py-2 focus:outline-none focus:border-terminal-accent/40"
            >
              {TIMEZONE_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.zones.map(z => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-[9px] text-[#4a5568] mt-2">
              All timestamps — news, clusters, charts — will display in this timezone.
            </p>
          </div>

          {/* Legal links */}
          <div className="border border-[#1e2235] p-4">
            <p className="text-[9px] text-[#4a5568] uppercase tracking-[0.2em] mb-3">Legal</p>
            <div className="flex gap-4">
              <a href="/privacy" target="_blank" className="text-terminal-accent hover:brightness-125 text-[11px] transition-all">Privacy Policy</a>
              <a href="/terms"   target="_blank" className="text-terminal-accent hover:brightness-125 text-[11px] transition-all">Terms of Service</a>
            </div>
          </div>

          {/* GDPR delete */}
          <div className="border border-red-900/60 p-4">
            <p className="text-[9px] text-red-500 uppercase tracking-[0.2em] mb-2">Danger Zone</p>
            <p className="text-[#4a5568] text-[11px] mb-4">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="px-4 py-1.5 bg-red-900/20 border border-red-800/60 text-red-500 text-[11px] hover:bg-red-900/40 transition-colors"
              >
                Delete My Account
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-yellow-400 text-[11px] font-bold tracking-wide">Are you absolutely sure?</p>
                {error && <p className="text-red-400 text-[11px]">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-1.5 bg-red-700 text-white text-[11px] hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-4 py-1.5 bg-[#1e2235] text-[#94a3b8] text-[11px] hover:bg-[#252840] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
