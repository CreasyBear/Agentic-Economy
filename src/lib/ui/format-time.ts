/**
 * The one time formatter (spec: Language, Time). Every date or time label
 * takes the IANA time zone it renders in, so server and client markup match.
 * Locales are pinned: en-GB dates ("2 Jul 2026"; en-AU prints "July") and
 * en-AU times ("1:14 pm").
 *
 * - Records: formatTimestamp, "2 Jul 2026, 1:14 pm", inside <time dateTime={timestampIso(v)}>.
 * - Lists: formatListTime, relative under 7 days, then "2 Jul 2026".
 * - Durations: formatDuration, "1.2s".
 */

const LOCALE = 'en-AU'
const LIST_RELATIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const formatters = new Map<string, Intl.DateTimeFormat>()
function zoned(kind: 'date' | 'time', timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${kind}:${timeZone ?? ''}`
  let formatter = formatters.get(key)
  if (formatter === undefined) {
    formatter = kind === 'date'
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone })
      : new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

const countFormatter = new Intl.NumberFormat(LOCALE)
const compactCountFormatter = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const percentFormatter = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

const RELATIVE_UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
]

type TimeValue = number | string | Date

function toDate(value: TimeValue): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Record timestamp, e.g. "2 Jul 2026, 1:14 pm". `timeZone` is the account's
 * IANA zone; until accounts store one, omitting it uses the runtime zone.
 */
export function formatTimestamp(value: TimeValue, timeZone?: string): string {
  const date = toDate(value)
  return `${zoned('date', timeZone).format(date)}, ${zoned('time', timeZone).format(date)}`
}

/** Date label, e.g. "2 Jul 2026". */
export function formatDate(value: TimeValue, timeZone?: string): string {
  return zoned('date', timeZone).format(toDate(value))
}

/** List label: relative under 7 days ("3 hours ago"), then the date. Render after hydration. */
export function formatListTime(value: TimeValue, timeZone?: string, now: number = Date.now()): string {
  return Math.abs(now - toDate(value).getTime()) < LIST_RELATIVE_WINDOW_MS
    ? formatRelativeTime(value, now)
    : formatDate(value, timeZone)
}

/** e.g. "850ms", "1.2s", "12s", "1.4min". */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  const minutes = seconds / 60
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)}min`
}

export function formatCount(value: number | bigint): string {
  return countFormatter.format(value)
}

/** e.g. "950", "12.3K". */
export function formatCompactCount(value: number): string {
  return compactCountFormatter.format(value)
}

export function formatPercent(value: number): string {
  return percentFormatter.format(value)
}

/** `<input type="date">` value in the given zone, e.g. "2026-07-02". */
export function formatDateInputValue(value: TimeValue, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(toDate(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Short zone name in the given zone, e.g. "AWST". Empty when the runtime has none. */
export function formatZoneName(value: TimeValue, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: 'short' }).formatToParts(toDate(value)).find(entry => entry.type === 'timeZoneName')?.value ?? ''
}

/** Milliseconds since local midnight in `timeZone`, for send-window checks. */
export function msSinceMidnight(value: TimeValue, timeZone: string): number {
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(toDate(value))
  const at = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(entry => entry.type === type)?.value ?? 0)
  return ((at('hour') * 60 + at('minute')) * 60 + at('second')) * 1000
}

/** ISO-8601 for the `dateTime` attribute of a `<time>` element. */
export function timestampIso(value: TimeValue): string {
  return toDate(value).toISOString()
}

/** e.g. "3 hours ago", "just now". Zone-independent. */
export function formatRelativeTime(value: TimeValue, now: number = Date.now()): string {
  const diffMs = toDate(value).getTime() - now
  if (Math.abs(diffMs) < 45_000) return 'just now'
  for (const { unit, ms } of RELATIVE_UNITS) {
    const diffInUnit = diffMs / ms
    if (Math.abs(diffInUnit) >= 1) return relativeFormatter.format(Math.round(diffInUnit), unit)
  }
  return relativeFormatter.format(Math.round(diffMs / 60_000), 'minute')
}

/** Business locale for month boundaries (caps, alerts) until Joel says otherwise. */
export const BUSINESS_TIME_ZONE = 'Australia/Perth'

/** Calendar month containing `value` in `timeZone`: "2026-07" plus its start and end instants. */
export function monthBoundsInZone(value: TimeValue, timeZone: string): { month: string; startAt: number; endAt: number } {
  const month = formatDateInputValue(value, timeZone).slice(0, 7)
  const localMidnight = (key: string) => {
    const [year, monthIndex] = key.split('-').map(Number) as [number, number]
    const wall = Date.UTC(year, monthIndex - 1, 1)
    let instant = wall
    for (let pass = 0; pass < 2; pass += 1) {
      instant = wall - (Date.parse(`${formatDateInputValue(instant, timeZone)}T00:00:00Z`) + msSinceMidnight(instant, timeZone) - instant)
    }
    return instant
  }
  const [year, monthIndex] = month.split('-').map(Number) as [number, number]
  const next = monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  return { month, startAt: localMidnight(month), endAt: localMidnight(next) }
}
