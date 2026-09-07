import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import type { MarketLatencyProjection } from '@/modules/market/listing-evidence'

const chartConfig = {
  durationMs: {
    label: 'Latency (ms)',
    color: 'var(--color-brand)',
  },
} satisfies ChartConfig

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
    <section aria-label="Latency by completed call" className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-related pb-3">
        <h3 className="text-sm font-semibold text-foreground">Latency by completed call</h3>
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
        <ChartContainer
          config={chartConfig}
          className="h-56 min-h-56 w-full aspect-auto"
          initialDimension={{ width: 640, height: 224 }}
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 18, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="call"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={18}
              tickFormatter={(value: number) => `#${value}`}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              width={54}
              tickFormatter={formatAxisDuration}
            />
            <ChartTooltip
              cursor={false}
              content={(
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => `Completed call #${String(value)}`}
                />
              )}
            />
            {latency.kind === 'measured' ? (
              <ReferenceLine
                y={latency.p95Ms}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="3 3"
                label={{
                  value: 'p95',
                  position: 'insideTopRight',
                  fill: 'var(--color-muted-foreground)',
                  fontSize: 11,
                }}
              />
            ) : null}
            <Bar
              dataKey="durationMs"
              fill="var(--color-durationMs)"
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  )
}

function formatAxisDuration(value: number): string {
  if (value < 1_000) return `${value}ms`
  const seconds = value / 1_000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}
