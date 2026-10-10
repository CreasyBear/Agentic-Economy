import { formatCount, formatDuration } from '@/lib/ui/format-time'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'

import { AeToolLatencyChart } from './AeToolLatencyChart'

export function AeToolTrackRecord({
  evidence,
}: Readonly<{
  evidence?: MarketListingEvidenceProjection
}>) {
  if (evidence === undefined) {
    return (
      <section aria-label="30-day track record" className="grid gap-2 border-b border-border px-gutter py-5">
        <h2 className="text-sm font-medium text-foreground">Observed performance</h2>
        <p className="text-sm text-muted-foreground">Performance history is unavailable right now. You can still inspect and use this Tool.</p>
      </section>
    )
  }
  return (
    <section
      aria-label="30-day track record"
      className="min-w-0 border-b border-border"
    >
      <div className="flex min-w-0 items-baseline justify-between gap-related px-gutter py-4">
        <h2 className="text-sm font-medium text-foreground">Observed performance</h2>
        <p className="shrink-0 text-xs text-muted-foreground">30 days · AE-observed</p>
      </div>

      <dl className="grid min-w-0 grid-cols-2 border-y border-border [&>div:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:[&>div:nth-child(-n+2)]:border-b-0">
        <TrackMetric
          label="Completed calls"
          value={formatCount(evidence.popularity.completedCalls)}
          detail="Completed through AE"
          numeric
        />
        <TrackMetric
          label="Rating"
          value={evidence.rating.kind === 'rated' ? evidence.rating.average.toFixed(1) : 'Unrated'}
          detail={evidence.rating.kind === 'rated'
            ? `${formatCount(evidence.rating.count)} authenticated ${evidence.rating.count === 1 ? 'rating' : 'ratings'}`
            : 'No ratings yet'}
          numeric={evidence.rating.kind === 'rated'}
        />
        <TrackMetric
          label="Median time to result"
          value={evidence.latency.kind === 'measured' ? evidence.latency.display : 'Pending'}
          detail={evidence.latency.kind === 'measured'
            ? `${evidence.latency.sampleSize} timed calls`
            : `${evidence.latency.sampleSize}/${evidence.latency.minimumSampleSize} samples`}
          numeric={evidence.latency.kind === 'measured'}
        />
        <TrackMetric
          label="95th percentile time"
          value={evidence.latency.kind === 'measured'
            ? formatDuration(evidence.latency.p95Ms)
            : 'Pending'}
          detail={evidence.latency.kind === 'measured'
            ? '95% of completed Calls finish within this time'
            : 'Available after 5 samples'}
          numeric={evidence.latency.kind === 'measured'}
        />
      </dl>

      <div className="min-w-0 px-gutter py-5">
        <AeToolLatencyChart latency={evidence.latency} />
        <p className="mt-related text-xs text-muted-foreground">Time from acceptance to result, including any recovery.</p>
      </div>
    </section>
  )
}

function TrackMetric({
  label,
  value,
  detail,
  numeric,
}: Readonly<{
  label: string
  value: string
  detail: string
  numeric: boolean
}>) {
  return (
    <div className="grid min-w-0 content-start gap-1 border-border px-gutter py-4 odd:border-e sm:border-e sm:last:border-e-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={numeric
        ? 'break-words font-mono text-xl font-medium tabular-nums text-foreground'
        : 'break-words text-base font-medium text-muted-foreground'}>
        {value}
      </dd>
      <dd className="text-xs leading-5 text-muted-foreground">{detail}</dd>
    </div>
  )
}

