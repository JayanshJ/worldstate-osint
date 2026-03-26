import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const ENTITY_STYLES = {
    people: { bg: 'rgba(139,92,246,0.15)', border: '#7c3aed44', color: '#a78bfa' },
    organizations: { bg: 'rgba(59,130,246,0.15)', border: '#2563eb44', color: '#60a5fa' },
    locations: { bg: 'rgba(16,185,129,0.15)', border: '#05966944', color: '#34d399' },
};
const ENTITY_ICONS = {
    people: '👤',
    organizations: '🏛',
    locations: '📍',
};
export function EntityPills({ entities, max = 3 }) {
    const all = [
        ...entities.people.slice(0, max).map(l => ({ label: l, type: 'people' })),
        ...entities.organizations.slice(0, max).map(l => ({ label: l, type: 'organizations' })),
        ...entities.locations.slice(0, max).map(l => ({ label: l, type: 'locations' })),
    ].slice(0, max * 2);
    if (!all.length)
        return null;
    return (_jsx("div", { className: "flex flex-wrap gap-1", children: all.map(({ label, type }) => {
            const s = ENTITY_STYLES[type];
            return (_jsxs("span", { className: "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono border", style: { backgroundColor: s.bg, borderColor: s.border, color: s.color }, children: [_jsx("span", { className: "text-[8px]", children: ENTITY_ICONS[type] }), label] }, `${type}-${label}`));
        }) }));
}
