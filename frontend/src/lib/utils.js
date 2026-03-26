import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
/**
 * Format an ISO timestamp as an absolute time in the given timezone.
 * Same day → "14:32"  |  Different day → "Mar 18 14:32"
 */
export function formatAbsTime(iso, tz = 'UTC') {
    if (!iso)
        return '—';
    try {
        const d = new Date(iso);
        const now = new Date();
        const opts = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' };
        const isSameDay = d.toLocaleDateString('en-US', opts) === now.toLocaleDateString('en-US', opts);
        const timeStr = d.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        });
        if (isSameDay)
            return timeStr;
        const dateStr = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
        return `${dateStr} ${timeStr}`;
    }
    catch {
        return '—';
    }
}
/**
 * Full date+time: "Mar 19 14:32:05"
 */
export function formatDateTime(iso, tz = 'UTC') {
    if (!iso)
        return '—';
    try {
        const d = new Date(iso);
        const date = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
        return `${date} ${time}`;
    }
    catch {
        return '—';
    }
}
export function formatUtcClock() {
    return new Date().toLocaleTimeString('en-US', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }) + ' UTC';
}
export function formatTzClock(tz) {
    return new Date().toLocaleTimeString('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}
// Keep for any legacy callers — maps to formatAbsTime with UTC
export function timeAgo(iso) {
    return formatAbsTime(iso, 'UTC');
}
export function formatTime(iso) {
    return formatDateTime(iso, 'UTC');
}
/** Clamp a number between min and max */
export function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}
/** Format sentiment as a signed string e.g. "+0.72" or "-0.34" */
export function formatSentiment(s) {
    const sign = s >= 0 ? '+' : '';
    return `${sign}${s.toFixed(2)}`;
}
