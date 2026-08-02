/**
 * Single shared timestamp formatter. Used on operator surfaces (owner/admin
 * routes) and public surfaces alike (e.g. AeThreadSidebar's recent-thread
 * list), replacing ad-hoc `new Date(x).toISOString()` renders and hand-
 * rolled relative-time math.
 *
 * Locale is pinned to en-AU (not the runtime default) so server-rendered
 * and hydrated client markup always match, and dates render day-before-
 * month with a lowercase am/pm marker.
 */

const TIMESTAMP_LOCALE = 'en-AU'
const dateFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, { hour: 'numeric', minute: '2-digit' })
const dateOnlyFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, { dateStyle: 'medium' })
const numericDateFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })
const clockTimeFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const recordTimestampFormatter = new Intl.DateTimeFormat(TIMESTAMP_LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const utcTimestampFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
const relativeFormatter = new Intl.RelativeTimeFormat(TIMESTAMP_LOCALE, { numeric: 'auto' })

const RELATIVE_UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
]

function toDate(value: number | string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** e.g. "2 Jul 2026, 1:14 pm" */
export function formatTimestamp(value: number | string | Date): string {
  const date = toDate(value)
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`
}
/** Date-only public label, e.g. "2 July 2026". */
export function formatDate(value: number | string | Date): string {
  return dateOnlyFormatter.format(toDate(value))
}

/** Date-only numeric label matching the browser's en-AU date default. */
export function formatNumericDate(value: number | string | Date): string {
  return numericDateFormatter.format(toDate(value))
}

/** Clock-only public label, e.g. "1:14:05 pm". */
export function formatClockTime(value: number | string | Date): string {
  return clockTimeFormatter.format(toDate(value))
}

/** Record timestamps preserve the record surface's two-digit fields. */
export function formatRecordTimestamp(value: number | string | Date): string {
  return recordTimestampFormatter.format(toDate(value))
}

/** UTC timestamp for surfaces whose product contract explicitly uses UTC. */
export function formatUtcTimestamp(value: number | string | Date): string {
  return utcTimestampFormatter.format(toDate(value))
}

/** ISO-8601 for the `dateTime` attribute of a `<time>` element. */
export function timestampIso(value: number | string | Date): string {
  return toDate(value).toISOString()
}

/** e.g. "3 hours ago", "just now" (Intl.RelativeTimeFormat-backed). */
export function formatRelativeTime(value: number | string | Date, now: number = Date.now()): string {
  const diffMs = toDate(value).getTime() - now
  const diffSeconds = Math.round(diffMs / 1000)

  if (Math.abs(diffSeconds) < 45) {
    return 'just now'
  }

  for (const { unit, ms } of RELATIVE_UNITS) {
    const diffInUnit = diffMs / ms
    if (Math.abs(diffInUnit) >= 1) {
      return relativeFormatter.format(Math.round(diffInUnit), unit)
    }
  }

  return relativeFormatter.format(Math.round(diffSeconds / 60), 'minute')
}
