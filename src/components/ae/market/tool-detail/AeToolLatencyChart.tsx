import { lazy, Suspense } from 'react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
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
        <h3 className="text-sm font-semibold text-foreground">Time to result</h3>
        <p className="shrink-0 text-xs text-muted-foreground">
          {samplesMs.length === 0 ? 'Up to 48 timed calls' : `${samplesMs.length} timed calls`}
        </p>
      </div>

      {chartData.length === 0 ? (
        <Empty className="min-h-36 items-start justify-end rounded-none border-0 px-0 py-6 text-left md:px-0 md:py-6">
          <EmptyHeader className="items-start text-left">
            <EmptyTitle className="text-sm">Waiting for timed calls</EmptyTitle>
            <EmptyDescription>
              The chart appears after AE observes the first completed call.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
