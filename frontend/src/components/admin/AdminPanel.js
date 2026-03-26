import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
const METHOD_COLORS = {
    GET: 'text-blue-400',
    POST: 'text-green-400',
    DELETE: 'text-red-400',
    PATCH: 'text-yellow-400',
    PUT: 'text-orange-400',
};
function statusColor(code) {
    if (code < 300)
        return 'text-green-400';
    if (code < 400)
        return 'text-yellow-400';
    return 'text-red-400';
}
export function AdminPanel({ onClose }) {
    const [tab, setTab] = useState('server');
    const [server, setServer] = useState(null);
    const [pending, setPending] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [audit, setAudit] = useState([]);
    const [usage, setUsage] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    async function load(t) {
        setLoading(true);
        setError(null);
        try {
            if (t === 'server')
                setServer(await api.admin.serverStatus());
            if (t === 'pending')
                setPending(await api.admin.pendingUsers());
            if (t === 'orgs')
                setOrgs(await api.admin.listOrgs());
            if (t === 'audit')
                setAudit(await api.admin.auditLog());
            if (t === 'usage')
                setUsage(await api.admin.usage());
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setLoading(false);
        }
    }
    // Auto-refresh server stats every 10s
    useEffect(() => {
        if (tab !== 'server')
            return;
        const id = setInterval(() => {
            api.admin.serverStatus().then(setServer).catch(() => { });
        }, 10_000);
        return () => clearInterval(id);
    }, [tab]);
    async function approve(id) {
        await api.admin.approveUser(id);
        setPending(p => p.filter(u => u.id !== id));
    }
    async function reject(id) {
        await api.admin.rejectUser(id);
        setPending(p => p.filter(u => u.id !== id));
    }
    useEffect(() => { load(tab); }, [tab]);
    return (_jsxs("div", { className: "fixed inset-0 bg-black/90 z-50 flex flex-col font-mono text-sm", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-3 border-b border-gray-800", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-red-400 font-bold text-xs tracking-widest", children: "ADMIN" }), _jsx("span", { className: "text-white font-bold", children: "WorldState Control Panel" })] }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-white text-lg", children: "\u2715" })] }), _jsxs("div", { className: "flex gap-0 border-b border-gray-800", children: [['server', 'pending', 'orgs', 'usage', 'audit'].map(t => (_jsxs("button", { onClick: () => setTab(t), className: `px-6 py-2 text-xs uppercase tracking-widest border-b-2 transition-colors flex items-center gap-1.5 ${tab === t
                            ? 'border-green-400 text-green-400'
                            : 'border-transparent text-gray-500 hover:text-gray-300'}`, children: [t === 'server' ? 'Server' : t === 'pending' ? 'Approvals' : t === 'orgs' ? 'Organisations' : t === 'usage' ? 'Usage (30d)' : 'Audit Log', t === 'pending' && pending.length > 0 && (_jsx("span", { className: "bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full", children: pending.length }))] }, t))), _jsx("div", { className: "flex-1" }), _jsx("button", { onClick: () => load(tab), className: "px-4 text-xs text-gray-500 hover:text-green-400", children: "\u21BB Refresh" })] }), _jsxs("div", { className: "flex-1 overflow-auto p-6", children: [loading && _jsx("p", { className: "text-gray-500 animate-pulse", children: "Loading..." }), error && _jsxs("p", { className: "text-red-400", children: ["Error: ", error] }), !loading && tab === 'server' && (_jsx("div", { className: "space-y-6", children: !server ? (_jsx("p", { className: "text-gray-500", children: "Loading server status\u2026" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { className: "bg-gray-900/50 border border-gray-800 rounded p-4", children: [_jsx("p", { className: "text-gray-500 text-xs uppercase tracking-widest mb-2", children: "Site Status" }), server.ping.up === null ? (_jsx("p", { className: "text-gray-500 text-sm", children: "Not configured" })) : server.ping.up ? (_jsxs("div", { children: [_jsx("span", { className: "text-green-400 font-bold text-lg", children: "\u25CF ONLINE" }), _jsxs("p", { className: "text-gray-400 text-xs mt-1", children: [server.ping.latency_ms, "ms \u00B7 HTTP ", server.ping.status_code] }), _jsx("p", { className: "text-gray-600 text-xs truncate", children: server.ping.url })] })) : (_jsxs("div", { children: [_jsx("span", { className: "text-red-400 font-bold text-lg", children: "\u25CF DOWN" }), _jsx("p", { className: "text-gray-400 text-xs mt-1", children: server.ping.error })] }))] }), _jsxs("div", { className: "bg-gray-900/50 border border-gray-800 rounded p-4", children: [_jsx("p", { className: "text-gray-500 text-xs uppercase tracking-widest mb-2", children: "SSL Certificate" }), server.ssl.error ? (_jsx("p", { className: "text-red-400 text-sm", children: server.ssl.error })) : server.ssl.days_remaining !== undefined ? (_jsxs("div", { children: [_jsxs("span", { className: `font-bold text-lg ${server.ssl.days_remaining > 14 ? 'text-green-400' : 'text-red-400'}`, children: [server.ssl.days_remaining, "d left"] }), _jsxs("p", { className: "text-gray-400 text-xs mt-1", children: ["Expires ", server.ssl.expires_at] }), _jsx("p", { className: "text-gray-600 text-xs", children: server.ssl.domain })] })) : (_jsx("p", { className: "text-gray-500 text-sm", children: "Not configured" }))] })] }), _jsxs("div", { className: "bg-gray-900/50 border border-gray-800 rounded p-4", children: [_jsx("p", { className: "text-gray-500 text-xs uppercase tracking-widest mb-3", children: "System Resources" }), _jsx("div", { className: "grid grid-cols-3 gap-4", children: [
                                                { label: 'CPU', pct: server.system.cpu_percent, text: `${server.system.cpu_percent}%` },
                                                { label: 'RAM', pct: server.system.ram_percent, text: `${server.system.ram_used_mb}MB / ${server.system.ram_total_mb}MB` },
                                                { label: 'DISK', pct: server.system.disk_percent, text: `${server.system.disk_used_gb}GB / ${server.system.disk_total_gb}GB` },
                                            ].map(({ label, pct, text }) => (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between text-xs mb-1", children: [_jsx("span", { className: "text-gray-400", children: label }), _jsxs("span", { className: pct > 80 ? 'text-red-400' : pct > 60 ? 'text-yellow-400' : 'text-green-400', children: [pct, "%"] })] }), _jsx("div", { className: "h-1.5 bg-gray-800 rounded-full overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`, style: { width: `${pct}%` } }) }), _jsx("p", { className: "text-gray-600 text-xs mt-1", children: text })] }, label))) }), _jsxs("p", { className: "text-gray-600 text-xs mt-3", children: ["Uptime: ", Math.floor(server.system.uptime_seconds / 86400), "d ", Math.floor((server.system.uptime_seconds % 86400) / 3600), "h ", Math.floor((server.system.uptime_seconds % 3600) / 60), "m"] })] }), _jsxs("div", { className: "bg-gray-900/50 border border-gray-800 rounded p-4", children: [_jsx("p", { className: "text-gray-500 text-xs uppercase tracking-widest mb-3", children: "Containers" }), _jsx("div", { className: "space-y-2", children: server.containers.map((c, i) => (_jsxs("div", { className: "flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0", children: [_jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [_jsx("span", { className: `w-2 h-2 rounded-full flex-shrink-0 ${c.status === 'running' ? (c.health === 'unhealthy' ? 'bg-yellow-400' : 'bg-green-400') : 'bg-red-400'}` }), _jsx("span", { className: "text-white text-xs font-mono truncate", children: (c.name ?? c.id ?? 'unknown').replace(/^worldstate-osint-/, '') })] }), _jsxs("div", { className: "flex items-center gap-4 flex-shrink-0 text-xs font-mono", children: [_jsxs("span", { className: "text-gray-500", children: [c.mem_mb, "MB"] }), _jsxs("span", { className: "text-gray-500", children: [c.cpu_percent, "%"] }), _jsx("span", { className: c.status === 'running' ? 'text-green-400' : 'text-red-400', children: c.status })] })] }, i))) })] })] })) })), !loading && tab === 'pending' && (_jsx("div", { className: "space-y-2 max-w-xl", children: pending.length === 0 ? (_jsx("p", { className: "text-gray-600 py-8 text-center", children: "No pending approvals" })) : (pending.map(u => (_jsxs("div", { className: "flex items-center justify-between px-4 py-3 bg-gray-900/50 border border-gray-800 rounded", children: [_jsxs("div", { children: [_jsx("p", { className: "text-white text-sm", children: u.email }), _jsx("p", { className: "text-gray-500 text-xs mt-0.5", children: u.created_at ? new Date(u.created_at).toLocaleString() : '—' })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => approve(u.id), className: "px-3 py-1 text-xs font-bold text-green-400 border border-green-500/40 hover:bg-green-500/10 rounded transition-colors", children: "APPROVE" }), _jsx("button", { onClick: () => reject(u.id), className: "px-3 py-1 text-xs font-bold text-red-400 border border-red-500/40 hover:bg-red-500/10 rounded transition-colors", children: "REJECT" })] })] }, u.id)))) })), !loading && tab === 'orgs' && (_jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-500 text-xs uppercase tracking-widest border-b border-gray-800", children: [_jsx("th", { className: "py-2 pr-4", children: "Organisation" }), _jsx("th", { className: "py-2 pr-4", children: "Slug" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "Users" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "Alerts" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "API Calls (24h)" }), _jsx("th", { className: "py-2", children: "Created" })] }) }), _jsxs("tbody", { children: [orgs.map(o => (_jsxs("tr", { className: "border-b border-gray-900 hover:bg-gray-900/30", children: [_jsx("td", { className: "py-2 pr-4 text-white", children: o.name }), _jsx("td", { className: "py-2 pr-4 text-gray-400", children: o.slug }), _jsx("td", { className: "py-2 pr-4 text-right text-blue-400", children: o.user_count }), _jsx("td", { className: "py-2 pr-4 text-right text-yellow-400", children: o.alert_count }), _jsx("td", { className: "py-2 pr-4 text-right text-green-400", children: o.api_calls_24h.toLocaleString() }), _jsx("td", { className: "py-2 text-gray-500 text-xs", children: o.created_at ? new Date(o.created_at).toLocaleDateString() : '—' })] }, o.id))), orgs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "py-8 text-center text-gray-600", children: "No organisations yet" }) }))] })] })), !loading && tab === 'usage' && (_jsxs("table", { className: "w-full text-left border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-500 text-xs uppercase tracking-widest border-b border-gray-800", children: [_jsx("th", { className: "py-2 pr-4", children: "Day" }), _jsx("th", { className: "py-2 pr-4", children: "Org ID" }), _jsx("th", { className: "py-2 pr-4 text-right", children: "API Calls" }), _jsx("th", { className: "py-2 text-right", children: "Avg Latency (ms)" })] }) }), _jsxs("tbody", { children: [usage.map((r, i) => (_jsxs("tr", { className: "border-b border-gray-900 hover:bg-gray-900/30", children: [_jsx("td", { className: "py-2 pr-4 text-white", children: r.day }), _jsx("td", { className: "py-2 pr-4 text-gray-500 text-xs font-mono", children: r.org_id ? r.org_id.slice(0, 8) + '…' : 'anonymous' }), _jsx("td", { className: "py-2 pr-4 text-right text-green-400", children: r.calls.toLocaleString() }), _jsx("td", { className: "py-2 text-right text-yellow-400", children: r.avg_latency_ms })] }, i))), usage.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "py-8 text-center text-gray-600", children: "No usage data yet" }) }))] })] })), !loading && tab === 'audit' && (_jsxs("table", { className: "w-full text-left border-collapse text-xs", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-gray-500 uppercase tracking-widest border-b border-gray-800", children: [_jsx("th", { className: "py-2 pr-3", children: "Time" }), _jsx("th", { className: "py-2 pr-3", children: "User" }), _jsx("th", { className: "py-2 pr-3", children: "Method" }), _jsx("th", { className: "py-2 pr-3", children: "Path" }), _jsx("th", { className: "py-2 pr-3 text-right", children: "Status" }), _jsx("th", { className: "py-2 text-right", children: "ms" })] }) }), _jsxs("tbody", { children: [audit.map(a => (_jsxs("tr", { className: "border-b border-gray-900 hover:bg-gray-900/20", children: [_jsx("td", { className: "py-1 pr-3 text-gray-500", children: new Date(a.created_at).toLocaleTimeString() }), _jsx("td", { className: "py-1 pr-3 text-gray-300", children: a.user_email ?? a.ip_address ?? '—' }), _jsx("td", { className: `py-1 pr-3 font-bold ${METHOD_COLORS[a.method] ?? 'text-gray-400'}`, children: a.method }), _jsx("td", { className: "py-1 pr-3 text-gray-400 max-w-xs truncate", children: a.path }), _jsx("td", { className: `py-1 pr-3 text-right font-bold ${statusColor(a.status_code)}`, children: a.status_code }), _jsx("td", { className: "py-1 text-right text-gray-500", children: a.latency_ms })] }, a.id))), audit.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "py-8 text-center text-gray-600", children: "No audit entries yet" }) }))] })] }))] })] }));
}
