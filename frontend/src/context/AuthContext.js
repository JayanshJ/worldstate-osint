import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
const TOKEN_KEY = 'ws_token';
const AuthContext = createContext({
    token: null,
    user: null,
    login: async () => { },
    logout: () => { },
});
export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUser] = useState(null);
    // Fetch /auth/me whenever we have a token
    useEffect(() => {
        if (!token) {
            setUser(null);
            return;
        }
        fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(data => setUser(data ?? null))
            .catch(() => setUser(null));
    }, [token]);
    const login = useCallback(async (email, password) => {
        const body = new URLSearchParams({ username: email, password });
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Login failed' }));
            throw new Error(err.detail ?? 'Login failed');
        }
        const { access_token } = await res.json();
        localStorage.setItem(TOKEN_KEY, access_token);
        setToken(access_token);
    }, []);
    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
    }, []);
    // Keep token state in sync across tabs
    useEffect(() => {
        const handler = () => setToken(localStorage.getItem(TOKEN_KEY));
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);
    return (_jsx(AuthContext.Provider, { value: { token, user, login, logout }, children: children }));
}
export function useAuth() {
    return useContext(AuthContext);
}
