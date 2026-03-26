import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
export function RegisterPage() {
    const [, navigate] = useLocation();
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState(false);
    async function handleSubmit(e) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
                throw new Error(err.detail ?? 'Registration failed');
            }
            const data = await res.json();
            if (!data.is_approved) {
                // Not the first user — show pending message instead of auto-login
                setPending(true);
                setLoading(false);
                return;
            }
            // First user — auto-login
            await login(email, password);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-[#0a0a0a] flex items-center justify-center", children: _jsxs("div", { className: "w-full max-w-sm space-y-6", children: [_jsxs("div", { className: "text-center", children: [_jsx("h1", { className: "text-2xl font-bold tracking-tight text-white", children: "WorldState" }), _jsx("p", { className: "mt-1 text-sm text-neutral-500", children: "Create your account" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-[#111] border border-neutral-800 rounded-lg p-6 space-y-4", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-neutral-400 uppercase tracking-wider", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: e => setEmail(e.target.value), required: true, autoFocus: true, className: "w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500", placeholder: "operator@company.com" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-neutral-400 uppercase tracking-wider", children: "Password" }), _jsx("input", { type: "password", value: password, onChange: e => setPassword(e.target.value), required: true, minLength: 8, className: "w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-500", placeholder: "min 8 characters" })] }), error && (_jsx("p", { className: "text-xs text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2", children: error })), pending && (_jsxs("div", { className: "text-xs bg-yellow-950/30 border border-yellow-800 rounded px-3 py-2 space-y-1", children: [_jsx("p", { className: "text-yellow-400 font-bold tracking-wider", children: "REQUEST SUBMITTED" }), _jsx("p", { className: "text-yellow-300/70", children: "Your account is pending admin approval. You'll receive access once approved." })] })), !pending && (_jsx("button", { type: "submit", disabled: loading, className: "w-full bg-white text-black text-sm font-medium rounded py-2 hover:bg-neutral-200 disabled:opacity-50 transition-colors", children: loading ? 'Creating account…' : 'Create account' }))] }), _jsxs("p", { className: "text-center text-xs text-neutral-600", children: ["Already have an account?", ' ', _jsx("button", { onClick: () => navigate('/'), className: "text-neutral-400 hover:text-white transition-colors", children: "Sign in" })] })] }) }));
}
