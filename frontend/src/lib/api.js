const BASE = '/api/v1';
const TOKEN_KEY = 'ws_token';
function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}
async function req(path, params) {
    const url = new URL(path, window.location.origin);
    if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    }
    const res = await fetch(url.toString(), { headers: authHeaders() });
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/';
    }
    if (!res.ok)
        throw new Error(`API ${res.status}: ${path}`);
    return res.json();
}
async function post(path, body) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
    });
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/';
    }
    if (!res.ok)
        throw new Error(`API ${res.status}: ${path}`);
    return res.json();
}
async function patchReq(path) {
    const res = await fetch(path, { method: 'PATCH', headers: authHeaders() });
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/';
    }
    if (!res.ok)
        throw new Error(`API ${res.status}: ${path}`);
    return res.json();
}
async function del(path) {
    const res = await fetch(path, { method: 'DELETE', headers: authHeaders() });
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = '/';
    }
    if (!res.ok)
        throw new Error(`API ${res.status}: ${path}`);
}
export const api = {
    clusters: {
        list: (opts) => req(`${BASE}/clusters/`, {
            limit: opts?.limit ?? 50,
            active_only: opts?.activeOnly ?? true,
            min_volatility: opts?.minVolatility ?? 0,
        }),
        get: (id) => req(`${BASE}/clusters/${id}`),
        deepdive: (id) => req(`${BASE}/clusters/${id}/deepdive`),
    },
    feed: {
        list: (opts) => req(`${BASE}/feed/`, {
            limit: opts?.limit ?? 100,
            ...(opts?.sourceType ? { source_type: opts.sourceType } : {}),
            ...(opts?.minCredibility ? { min_credibility: opts.minCredibility } : {}),
        }),
    },
    search: {
        query: (q, mode = 'keyword', limit = 20) => req(`${BASE}/search/`, { q, mode, limit }),
    },
    research: {
        entity: (name, type) => req(`${BASE}/research/entity`, { name, ...(type ? { type } : {}) }),
    },
    alerts: {
        list: () => req(`${BASE}/alerts/`),
        create: (w) => post(`${BASE}/alerts/`, w),
        toggle: (id) => patchReq(`${BASE}/alerts/${id}/toggle`),
        delete: (id) => del(`${BASE}/alerts/${id}`),
        firings: (id, limit = 10) => req(`${BASE}/alerts/${id}/firings`, { limit }),
    },
    stats: {
        get: () => req(`${BASE}/stats/`),
    },
    strategies: {
        list: () => req(`${BASE}/strategies/`),
        refresh: () => post(`${BASE}/strategies/refresh`, {}),
    },
    splc: {
        list: () => req(`${BASE}/splc/`),
        search: (q) => req(`${BASE}/splc/search`, { q }),
        get: (ticker) => req(`${BASE}/splc/${ticker}`),
        analyse: (ticker) => post(`${BASE}/splc/${ticker}`, {}),
        remove: (ticker) => del(`${BASE}/splc/${ticker}`),
        graph: (ticker) => req(`${BASE}/splc/${ticker}/graph`),
    },
    company: {
        get: (ticker) => req(`${BASE}/company/${ticker}`),
        refresh: (ticker) => post(`${BASE}/company/${ticker}/refresh`, {}),
    },
    admin: {
        listOrgs: () => req('/admin/orgs'),
        getOrg: (id) => req(`/admin/orgs/${id}`),
        deleteOrg: (id) => del(`/admin/orgs/${id}`),
        usage: (days = 30) => req('/admin/usage', { days }),
        auditLog: (limit = 200, offset = 0) => req('/admin/audit', { limit, offset }),
        toggleAdmin: (userId) => post(`/admin/users/${userId}/toggle-admin`, {}),
        pendingUsers: () => req('/admin/users/pending'),
        approveUser: (userId) => post(`/admin/users/${userId}/approve`, {}),
        rejectUser: (userId) => del(`/admin/users/${userId}/reject`),
        serverStatus: () => req('/admin/server/status'),
    },
    account: {
        deleteMe: () => del('/auth/me'),
    },
    digest: {
        get: () => req(`${BASE}/digest/`),
        refresh: () => post(`${BASE}/digest/refresh`, {}),
    },
    watchlist: {
        get: () => req(`${BASE}/watchlist/`),
        add: (item) => post(`${BASE}/watchlist/`, item),
        remove: (name) => del(`${BASE}/watchlist/${encodeURIComponent(name)}`),
    },
};
