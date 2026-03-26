import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellRing, Plus, Trash2, ToggleLeft, ToggleRight, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAlerts } from '@/hooks/useAlerts';
import { VolatilityBadge } from '@/components/ui/VolatilityBadge';
import { cn, timeAgo } from '@/lib/utils';
export function AlertPanel({ onClose, onClusterSelect }) {
    const { watches, loading, notifications, unreadCount, createWatch, toggleWatch, deleteWatch, markAllRead, } = useAlerts();
    const [tab, setTab] = useState('notifications');
    const [showCreate, setShowCreate] = useState(false);
    // Request browser notification permission
    const requestNotifPermission = async () => {
        if (Notification.permission === 'default')
            await Notification.requestPermission();
    };
    return (_jsx(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, className: "fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4", style: { backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }, onClick: e => { if (e.target === e.currentTarget)
            onClose(); }, children: _jsxs(motion.div, { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 40, opacity: 0 }, className: "w-full max-w-sm bg-terminal-surface border border-terminal-border rounded-sm shadow-2xl flex flex-col", style: { maxHeight: 'calc(100vh - 5rem)' }, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-terminal-border flex-shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(BellRing, { size: 12, className: "text-terminal-accent" }), _jsx("span", { className: "font-mono text-[11px] font-bold text-terminal-accent tracking-widest", children: "ALERTS" }), unreadCount > 0 && (_jsxs("span", { className: "text-[9px] font-mono bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-sm animate-pulse", children: [unreadCount, " NEW"] }))] }), _jsxs("div", { className: "flex items-center gap-2", children: [Notification.permission !== 'granted' && (_jsx("button", { onClick: requestNotifPermission, className: "text-[9px] font-mono text-terminal-accent/70 hover:text-terminal-accent border border-terminal-accent/30 px-2 py-0.5 rounded-sm", children: "ENABLE PUSH" })), _jsx("button", { onClick: onClose, children: _jsx(X, { size: 12, className: "text-terminal-dim hover:text-terminal-text" }) })] })] }), _jsx("div", { className: "flex border-b border-terminal-border flex-shrink-0", children: [
                        { key: 'notifications', label: `FIRED (${notifications.length})` },
                        { key: 'watches', label: `WATCHES (${watches.length})` },
                    ].map(t => (_jsx("button", { onClick: () => { setTab(t.key); if (t.key === 'notifications')
                            markAllRead(); }, className: cn('flex-1 py-2 text-[10px] font-mono font-semibold tracking-widest transition-colors', tab === t.key
                            ? 'text-terminal-accent border-b-2 border-terminal-accent'
                            : 'text-terminal-dim hover:text-terminal-text'), children: t.label }, t.key))) }), _jsxs("div", { className: "flex-1 overflow-y-auto scrollbar-thin", children: [tab === 'notifications' && (_jsx(NotificationsTab, { notifications: notifications, onClusterSelect: id => { onClusterSelect?.(id); onClose(); } })), tab === 'watches' && (_jsx(WatchesTab, { watches: watches, loading: loading, showCreate: showCreate, setShowCreate: setShowCreate, onToggle: toggleWatch, onDelete: deleteWatch, onCreate: createWatch }))] })] }) }));
}
// ─── Notifications Tab ────────────────────────────────────────────────────
function NotificationsTab({ notifications, onClusterSelect, }) {
    if (!notifications.length) {
        return (_jsxs("div", { className: "py-12 text-center text-terminal-dim font-mono text-xs", children: [_jsx(Bell, { size: 20, className: "mx-auto mb-2 opacity-20" }), "No alerts fired yet"] }));
    }
    return (_jsx("div", { children: notifications.map(n => (_jsxs("button", { onClick: () => onClusterSelect(n.clusterId), className: cn('w-full text-left flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50', 'hover:bg-terminal-muted/30 transition-colors', !n.read && 'bg-terminal-accent/5'), children: [_jsx("div", { className: "flex-shrink-0 mt-0.5", children: _jsx(VolatilityBadge, { volatility: n.volatility, size: "sm" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-[10px] font-mono font-semibold text-terminal-accent truncate", children: n.watchName }), _jsx("p", { className: "text-[11px] font-mono text-terminal-text leading-snug mt-0.5 line-clamp-2", children: n.clusterLabel ?? 'Unnamed cluster' }), n.bullets?.[0] && (_jsx("p", { className: "text-[10px] font-mono text-terminal-dim mt-1 line-clamp-1", children: n.bullets[0] })), _jsx("p", { className: "text-[9px] font-mono text-terminal-dim mt-1", children: timeAgo(n.firedAt) })] }), !n.read && (_jsx("div", { className: "w-1.5 h-1.5 rounded-full bg-terminal-accent flex-shrink-0 mt-1.5" }))] }, n.id))) }));
}
// ─── Watches Tab ─────────────────────────────────────────────────────────
function WatchesTab({ watches, loading, showCreate, setShowCreate, onToggle, onDelete, onCreate, }) {
    return (_jsxs("div", { children: [_jsxs("div", { className: "p-3 border-b border-terminal-border", children: [_jsxs("button", { onClick: () => setShowCreate(!showCreate), className: "w-full flex items-center justify-center gap-2 py-2 text-[10px] font-mono font-semibold text-terminal-accent border border-terminal-accent/30 rounded-sm hover:bg-terminal-accent/10 transition-colors", children: [_jsx(Plus, { size: 10 }), "NEW WATCH RULE", showCreate ? _jsx(ChevronUp, { size: 10 }) : _jsx(ChevronDown, { size: 10 })] }), _jsx(AnimatePresence, { children: showCreate && (_jsx(motion.div, { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 }, className: "overflow-hidden", children: _jsx(CreateWatchForm, { onCreate: async (data) => { await onCreate(data); setShowCreate(false); } }) })) })] }), loading && _jsx("div", { className: "p-4 text-center text-terminal-dim font-mono text-xs", children: "Loading\u2026" }), !loading && !watches.length && (_jsx("div", { className: "py-8 text-center text-terminal-dim font-mono text-xs", children: "No watch rules defined" })), watches.map(watch => (_jsxs("div", { className: cn('flex items-start gap-3 px-4 py-3 border-b border-terminal-border/50', !watch.is_active && 'opacity-50'), children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-mono text-[11px] font-semibold text-terminal-text truncate", children: watch.name }), _jsxs("div", { className: "flex flex-wrap gap-x-2 gap-y-0.5 mt-1", children: [watch.keywords && (_jsxs("span", { className: "text-[9px] font-mono text-yellow-400/70", children: ["kw: ", watch.keywords.slice(0, 3).join(', ')] })), watch.entities && (_jsxs("span", { className: "text-[9px] font-mono text-purple-400/70", children: ["ent: ", watch.entities.slice(0, 2).join(', ')] })), watch.min_volatility > 0 && (_jsxs("span", { className: "text-[9px] font-mono text-orange-400/70", children: ["v\u2265", watch.min_volatility.toFixed(2)] }))] }), _jsxs("p", { className: "text-[9px] font-mono text-terminal-dim mt-1", children: ["Fired ", watch.fire_count, "\u00D7 \u00B7 ", watch.last_fired_at ? timeAgo(watch.last_fired_at) : 'never'] })] }), _jsxs("div", { className: "flex items-center gap-1 flex-shrink-0", children: [_jsx("button", { onClick: () => onToggle(watch.id), className: "p-1 text-terminal-dim hover:text-terminal-text", children: watch.is_active
                                    ? _jsx(ToggleRight, { size: 14, className: "text-green-400" })
                                    : _jsx(ToggleLeft, { size: 14 }) }), _jsx("button", { onClick: () => onDelete(watch.id), className: "p-1 text-terminal-dim hover:text-red-400", children: _jsx(Trash2, { size: 11 }) })] })] }, watch.id)))] }));
}
// ─── Create Watch Form ────────────────────────────────────────────────────
function CreateWatchForm({ onCreate }) {
    const [name, setName] = useState('');
    const [keywords, setKeywords] = useState('');
    const [entities, setEntities] = useState('');
    const [minVolt, setMinVolt] = useState('0.4');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const handleSubmit = async () => {
        if (!name.trim()) {
            setError('Name required');
            return;
        }
        const kws = keywords.split(',').map(s => s.trim()).filter(Boolean);
        const ents = entities.split(',').map(s => s.trim()).filter(Boolean);
        if (!kws.length && !ents.length) {
            setError('Add at least one keyword or entity');
            return;
        }
        setSaving(true);
        try {
            await onCreate({
                name: name.trim(),
                keywords: kws.length ? kws : undefined,
                entities: ents.length ? ents : undefined,
                min_volatility: parseFloat(minVolt) || 0,
            });
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs("div", { className: "mt-3 space-y-2", children: [error && _jsx("p", { className: "text-[9px] text-red-400 font-mono", children: error }), _jsx(Field, { label: "Name", value: name, onChange: setName, placeholder: "e.g. NATO alerts" }), _jsx(Field, { label: "Keywords (comma-sep)", value: keywords, onChange: setKeywords, placeholder: "ukraine, nato, missile" }), _jsx(Field, { label: "Entities (comma-sep)", value: entities, onChange: setEntities, placeholder: "Zelensky, NATO" }), _jsxs("div", { children: [_jsx("label", { className: "text-[9px] font-mono text-terminal-dim block mb-1", children: "Min Volatility" }), _jsx("input", { type: "range", min: "0", max: "1", step: "0.05", value: minVolt, onChange: e => setMinVolt(e.target.value), className: "w-full accent-terminal-accent" }), _jsx("span", { className: "text-[9px] font-mono text-terminal-dim", children: parseFloat(minVolt).toFixed(2) })] }), _jsx("button", { onClick: handleSubmit, disabled: saving, className: "w-full py-2 text-[10px] font-mono font-bold text-terminal-bg bg-terminal-accent hover:bg-terminal-accent/90 rounded-sm disabled:opacity-50", children: saving ? 'SAVING…' : 'CREATE WATCH' })] }));
}
function Field({ label, value, onChange, placeholder }) {
    return (_jsxs("div", { children: [_jsx("label", { className: "text-[9px] font-mono text-terminal-dim block mb-1", children: label }), _jsx("input", { value: value, onChange: e => onChange(e.target.value), placeholder: placeholder, className: "w-full bg-terminal-bg border border-terminal-border rounded-sm px-2 py-1.5 text-[11px] font-mono text-terminal-text placeholder-terminal-dim/50 outline-none focus:border-terminal-accent/50" })] }));
}
