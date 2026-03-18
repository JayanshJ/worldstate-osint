import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const TOKEN_KEY = 'ws_token'

interface AuthContextValue {
  token: string | null
  login:  (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  token:  null,
  login:  async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  const login = useCallback(async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password })
    const res = await fetch('/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }))
      throw new Error(err.detail ?? 'Login failed')
    }
    const { access_token } = await res.json()
    localStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }, [])

  // Keep token state in sync across tabs
  useEffect(() => {
    const handler = () => setToken(localStorage.getItem(TOKEN_KEY))
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
