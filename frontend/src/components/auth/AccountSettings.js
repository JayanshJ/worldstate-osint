import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTimezone, TIMEZONE_GROUPS } from '@/context/TimezoneContext';
import { api } from '@/lib/api';
export function AccountSettings({ onClose }) {
    const { logout } = useAuth();
    const { timezone, setTimezone } = useTimezone();
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);
    async function handleDelete() {
        setDeleting(true);
        setError(null);
        try {
            await api.account.deleteMe();
            logout();
        }
        catch (e) {
            setError(e.message);
            setDeleting(false);
        }
    }
    return (_jsx("div", { className: "fixed inset-0 bg-black/80 z-50 flex items-center justify-center font-mono", children: _jsxs("div", { className: "bg-[#0c0e18] border border-[#1e2235] w-full max-w-md shadow-2xl", children: [_jsxs("div", { className: "flex justify-between items-center px-5 py-3 border-b border-[#1e2235]", children: [_jsx("span", { className: "text-[11px] tracking-[0.2em] text-terminal-accent font-bold uppercase", children: "Account Settings" }), _jsx("button", { onClick: onClose, className: "text-[#4a5568] hover:text-white transition-colors text-sm", children: "\u2715" })] }), _jsxs("div", { className: "p-5 space-y-4", children: [_jsxs("div", { className: "border border-[#1e2235] p-4", children: [_jsx("p", { className: "text-[9px] text-[#4a5568] uppercase tracking-[0.2em] mb-3", children: "Display Timezone" }), _jsx("select", { value: timezone, onChange: e => setTimezone(e.target.value), className: "w-full bg-[#0f1117] border border-[#1e2235] text-terminal-text text-[11px] font-mono px-3 py-2 focus:outline-none focus:border-terminal-accent/40", children: TIMEZONE_GROUPS.map(group => (_jsx("optgroup", { label: group.label, children: group.zones.map(z => (_jsx("option", { value: z.value, children: z.label }, z.value))) }, group.label))) }), _jsx("p", { className: "text-[9px] text-[#4a5568] mt-2", children: "All timestamps \u2014 news, clusters, charts \u2014 will display in this timezone." })] }), _jsxs("div", { className: "border border-[#1e2235] p-4", children: [_jsx("p", { className: "text-[9px] text-[#4a5568] uppercase tracking-[0.2em] mb-3", children: "Legal" }), _jsxs("div", { className: "flex gap-4", children: [_jsx("a", { href: "/privacy", target: "_blank", className: "text-terminal-accent hover:brightness-125 text-[11px] transition-all", children: "Privacy Policy" }), _jsx("a", { href: "/terms", target: "_blank", className: "text-terminal-accent hover:brightness-125 text-[11px] transition-all", children: "Terms of Service" })] })] }), _jsxs("div", { className: "border border-red-900/60 p-4", children: [_jsx("p", { className: "text-[9px] text-red-500 uppercase tracking-[0.2em] mb-2", children: "Danger Zone" }), _jsx("p", { className: "text-[#4a5568] text-[11px] mb-4", children: "Permanently delete your account and all associated data. This cannot be undone." }), !confirming ? (_jsx("button", { onClick: () => setConfirming(true), className: "px-4 py-1.5 bg-red-900/20 border border-red-800/60 text-red-500 text-[11px] hover:bg-red-900/40 transition-colors", children: "Delete My Account" })) : (_jsxs("div", { className: "space-y-3", children: [_jsx("p", { className: "text-yellow-400 text-[11px] font-bold tracking-wide", children: "Are you absolutely sure?" }), error && _jsx("p", { className: "text-red-400 text-[11px]", children: error }), _jsxs("div", { className: "flex gap-3", children: [_jsx("button", { onClick: handleDelete, disabled: deleting, className: "px-4 py-1.5 bg-red-700 text-white text-[11px] hover:bg-red-600 disabled:opacity-50 transition-colors", children: deleting ? 'Deleting…' : 'Yes, delete everything' }), _jsx("button", { onClick: () => setConfirming(false), className: "px-4 py-1.5 bg-[#1e2235] text-[#94a3b8] text-[11px] hover:bg-[#252840] transition-colors", children: "Cancel" })] })] }))] })] })] }) }));
}
