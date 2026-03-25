import { useState, type FormEvent } from 'react'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">WorldState</h1>
          <p className="mt-1 text-sm text-neutral-500">OSINT Intelligence Terminal</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#111] border border-neutral-800 rounded-lg p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              placeholder="operator@company.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            error.toLowerCase().includes('pending') ? (
              <div className="text-xs bg-yellow-950/30 border border-yellow-800 rounded px-3 py-2 space-y-1">
                <p className="text-yellow-400 font-bold tracking-wider">PENDING APPROVAL</p>
                <p className="text-yellow-300/70">Your account is awaiting admin approval. You'll be able to sign in once approved.</p>
              </div>
            ) : (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">{error}</p>
            )
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-sm font-medium rounded py-2 hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-600">
          No account?{' '}
          <a href="/register" className="text-neutral-400 hover:text-white transition-colors">
            Register
          </a>
        </p>
      </div>
    </div>
  )
}
