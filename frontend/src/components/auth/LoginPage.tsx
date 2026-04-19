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
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#0e0d0b' }}
    >
      <div className="w-full max-w-sm space-y-6 px-4">

        {/* Brand mark */}
        <div className="text-center space-y-1.5">
          <h1 className="font-serif text-[32px] leading-none tracking-[-0.01em]" style={{ color: '#ece6d5' }}>
            Worldstate<em className="not-italic" style={{ color: '#d89b4a' }}>.</em>
          </h1>
          <p className="font-mono text-[9.5px] tracking-[0.22em] uppercase" style={{ color: '#8a8577' }}>
            OSINT Intelligence Terminal
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border p-6 space-y-4"
          style={{ backgroundColor: '#141210', borderColor: '#26231f' }}
        >
          <div className="space-y-1">
            <label
              className="font-mono text-[9px] tracking-[0.16em] uppercase"
              style={{ color: '#8a8577' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 font-mono text-sm focus:outline-none transition-colors"
              style={{
                backgroundColor: '#0e0d0b',
                border: '1px solid #26231f',
                color: '#ece6d5',
              }}
              onFocus={e => (e.target.style.borderColor = '#d89b4a80')}
              onBlur={e => (e.target.style.borderColor = '#26231f')}
              placeholder="operator@company.com"
            />
          </div>

          <div className="space-y-1">
            <label
              className="font-mono text-[9px] tracking-[0.16em] uppercase"
              style={{ color: '#8a8577' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 font-mono text-sm focus:outline-none transition-colors"
              style={{
                backgroundColor: '#0e0d0b',
                border: '1px solid #26231f',
                color: '#ece6d5',
              }}
              onFocus={e => (e.target.style.borderColor = '#d89b4a80')}
              onBlur={e => (e.target.style.borderColor = '#26231f')}
              placeholder="••••••••"
            />
          </div>

          {error && (
            error.toLowerCase().includes('pending') ? (
              <div
                className="text-xs px-3 py-2 space-y-1 border"
                style={{ backgroundColor: 'rgba(216,155,74,0.08)', borderColor: '#d89b4a40' }}
              >
                <p className="font-mono text-[10px] tracking-widest" style={{ color: '#d89b4a' }}>
                  PENDING APPROVAL
                </p>
                <p className="font-mono text-[10px]" style={{ color: 'rgba(216,155,74,0.6)' }}>
                  Your account is awaiting admin approval. You'll be able to sign in once approved.
                </p>
              </div>
            ) : (
              <p
                className="font-mono text-[10px] px-3 py-2 border"
                style={{ color: '#d64747', backgroundColor: 'rgba(214,71,71,0.08)', borderColor: 'rgba(214,71,71,0.30)' }}
              >
                {error}
              </p>
            )
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(216,155,74,0.15)',
              color: '#d89b4a',
              border: '1px solid rgba(216,155,74,0.35)',
            }}
            onMouseEnter={e => ((e.target as HTMLButtonElement).style.backgroundColor = 'rgba(216,155,74,0.25)')}
            onMouseLeave={e => ((e.target as HTMLButtonElement).style.backgroundColor = 'rgba(216,155,74,0.15)')}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="text-center font-mono text-[10px]" style={{ color: '#8a8577' }}>
          No account?{' '}
          <a
            href="/register"
            className="transition-colors"
            style={{ color: '#d89b4a' }}
            onMouseEnter={e => ((e.target as HTMLAnchorElement).style.color = '#e6af6a')}
            onMouseLeave={e => ((e.target as HTMLAnchorElement).style.color = '#d89b4a')}
          >
            Register
          </a>
        </p>
      </div>
    </div>
  )
}
