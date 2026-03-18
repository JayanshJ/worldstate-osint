import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

export function AccountSettings({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold">Account Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          {/* Legal links */}
          <div className="border border-gray-800 rounded p-4">
            <p className="text-gray-400 text-xs mb-3 uppercase tracking-widest">Legal</p>
            <div className="flex gap-4">
              <a href="/privacy" target="_blank" className="text-green-400 hover:text-green-300 text-sm">Privacy Policy</a>
              <a href="/terms"   target="_blank" className="text-green-400 hover:text-green-300 text-sm">Terms of Service</a>
            </div>
          </div>

          {/* GDPR delete */}
          <div className="border border-red-900 rounded p-4">
            <p className="text-red-400 text-xs mb-2 uppercase tracking-widest">Danger Zone</p>
            <p className="text-gray-400 text-sm mb-4">
              Permanently delete your account and all associated data. This cannot be undone.
            </p>
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="px-4 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded text-sm hover:bg-red-900/60 transition-colors"
              >
                Delete My Account
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-yellow-400 text-sm font-bold">Are you absolutely sure?</p>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-700 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded text-sm hover:bg-gray-700 transition-colors"
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
