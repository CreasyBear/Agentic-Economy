import { lazy, Suspense } from 'react'

import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import type { MarketLatencyProjection } from '@/modules/market/listing-evidence'

import { AeToolLatencyChartSkeleton } from './AeToolLatencyChartSkeleton'

const AeToolLatencyChartPlot = lazy(() => import('./AeToolLatencyChartPlot').then((module) => ({
  default: module.AeToolLatencyChartPlot,
})))

export function AeToolLatencyChart({
  latency,
}: Readonly<{
  latency: MarketLatencyProjection
}>) {
  const samplesMs = latency.samplesMs ?? []
  const chartData = [...samplesMs]
    .reverse()
    .map((durationMs, index) => ({
      call: index + 1,
      durationMs,
    }))

  return (
    <section aria-label="Time to result" className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-related pb-3">
        <h3 className="text-sm font-medium text-foreground">Time to result</h3>
        <p className="shrink-0 text-xs text-muted-foreground">
          {samplesMs.length === 0 ? 'Up to 48 timed calls' : `${samplesMs.length} timed ${samplesMs.length === 1 ? 'call' : 'calls'}`}
        </p>
      </div>

      {chartData.length === 0 ? (
        <AeEmptyState compact titleAs="p" title="Waiting for timed calls" description="The chart appears after AE observes the first completed call." />
      ) : (
        <Suspense fallback={<AeToolLatencyChartSkeleton />}>
          <AeToolLatencyChartPlot
            chartData={chartData}
            {...(latency.kind === 'measured' ? { referenceMs: latency.p95Ms } : {})}
          />
        </Suspense>
      )}
    </section>
  )
}
