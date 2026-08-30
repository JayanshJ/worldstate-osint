import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an ISO timestamp as an absolute time in the given timezone.
 * Same day → "14:32"  |  Different day → "Mar 18 14:32"
 */
export function formatAbsTime(iso: string | null | undefined, tz = 'UTC'): string {
  if (!iso) return '—'
  try {
    const d   = new Date(iso)
    const now = new Date()
    const opts: Intl.DateTimeFormatOptions = { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }
    const isSameDay = d.toLocaleDateString('en-US', opts) === now.toLocaleDateString('en-US', opts)
    const timeStr = d.toLocaleTimeString('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    })
    if (isSameDay) return timeStr
    const dateStr = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
    return `${dateStr} ${timeStr}`
  } catch {
    return '—'
  }
}

/**
 * Full date+time: "Mar 19 14:32:05"
 */
export function formatDateTime(iso: string | null | undefined, tz = 'UTC'): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const date = d.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
    const time = d.toLocaleTimeString('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
    return `${date} ${time}`
  } catch {
    return '—'
  }
}

export function formatUtcClock(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'UTC',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ' UTC'
}

export function formatTzClock(tz: string): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: tz,
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Relative time formatter: "5m ago", "3h ago", "2d ago"
 * Falls back to absolute date for older items.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 0) return 'just now'
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `${sec}s ago`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export function formatTime(iso: string | null | undefined): string {
  return formatDateTime(iso, 'UTC')
}

/** Clamp a number between min and max */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/** Format sentiment as a signed string e.g. "+0.72" or "-0.34" */
export function formatSentiment(s: number): string {
  const sign = s >= 0 ? '+' : ''
  return `${sign}${s.toFixed(2)}`
}
