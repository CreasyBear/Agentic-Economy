import { useClientMounted } from '@/hooks/use-client-mounted'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'

/** The one table date format: relative label, absolute timestamp on hover. */
export function RecordTime({ at, missing = 'Not recorded' }: Readonly<{ at: number | string | null | undefined; missing?: string }>) {
  const mounted = useClientMounted()
  if (at === null || at === undefined) return <span className="text-muted-foreground">{missing}</span>
  const absolute = formatTimestamp(at)
  return <time className="whitespace-nowrap" dateTime={timestampIso(at)} title={absolute}>{mounted ? formatRelativeTime(at) : absolute}</time>
}
