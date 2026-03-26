import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from 'react';
const DEFAULT_TZ = (() => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    catch {
        return 'UTC';
    }
})();
const TzContext = createContext({ timezone: DEFAULT_TZ, setTimezone: () => { } });
export function TimezoneProvider({ children }) {
    const [timezone, setTzState] = useState(() => localStorage.getItem('user_tz') || DEFAULT_TZ);
    function setTimezone(tz) {
        localStorage.setItem('user_tz', tz);
        setTzState(tz);
    }
    return _jsx(TzContext.Provider, { value: { timezone, setTimezone }, children: children });
}
export function useTimezone() {
    return useContext(TzContext);
}
/** All IANA timezone groups for the picker */
export const TIMEZONE_GROUPS = [
    {
        label: 'UTC',
        zones: [{ value: 'UTC', label: 'UTC +0:00' }],
    },
    {
        label: 'Americas',
        zones: [
            { value: 'America/New_York', label: 'New York (ET)' },
            { value: 'America/Chicago', label: 'Chicago (CT)' },
            { value: 'America/Denver', label: 'Denver (MT)' },
            { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
            { value: 'America/Toronto', label: 'Toronto' },
            { value: 'America/Vancouver', label: 'Vancouver' },
            { value: 'America/Sao_Paulo', label: 'São Paulo' },
            { value: 'America/Mexico_City', label: 'Mexico City' },
        ],
    },
    {
        label: 'Europe',
        zones: [
            { value: 'Europe/London', label: 'London (GMT/BST)' },
            { value: 'Europe/Paris', label: 'Paris (CET)' },
            { value: 'Europe/Berlin', label: 'Berlin' },
            { value: 'Europe/Moscow', label: 'Moscow' },
            { value: 'Europe/Istanbul', label: 'Istanbul' },
            { value: 'Europe/Zurich', label: 'Zurich' },
            { value: 'Europe/Amsterdam', label: 'Amsterdam' },
        ],
    },
    {
        label: 'Middle East & Africa',
        zones: [
            { value: 'Asia/Dubai', label: 'Dubai (GST)' },
            { value: 'Asia/Riyadh', label: 'Riyadh (AST)' },
            { value: 'Asia/Tehran', label: 'Tehran' },
            { value: 'Africa/Cairo', label: 'Cairo' },
            { value: 'Africa/Nairobi', label: 'Nairobi' },
            { value: 'Africa/Lagos', label: 'Lagos' },
        ],
    },
    {
        label: 'Asia & Pacific',
        zones: [
            { value: 'Asia/Kolkata', label: 'Mumbai/Delhi (IST)' },
            { value: 'Asia/Singapore', label: 'Singapore' },
            { value: 'Asia/Shanghai', label: 'Beijing/Shanghai' },
            { value: 'Asia/Tokyo', label: 'Tokyo' },
            { value: 'Asia/Seoul', label: 'Seoul' },
            { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
            { value: 'Australia/Sydney', label: 'Sydney' },
            { value: 'Pacific/Auckland', label: 'Auckland' },
        ],
    },
];
