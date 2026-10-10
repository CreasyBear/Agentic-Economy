import { formatRelativeTime, formatUtcTimestamp, timestampIso } from '@/lib/ui/format-time'

/**
 * One date format for public tables and facts, as Linear and Stripe show it: relative words, the exact UTC time on
 * hover. The relative words depend on the clock, so a server render may differ from the client by a minute.
 */
export function RelativeTime({ value }: Readonly<{ value: number | string | Date }>) {
  return <time dateTime={timestampIso(value)} title={`${formatUtcTimestamp(value)} UTC`} suppressHydrationWarning>{formatRelativeTime(value)}</time>
}
