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

import type { LatencyChartPoint } from './tool-inspector-model'

const chartConfig = {
  durationMs: {
    label: 'Latency (ms)',
    color: 'var(--color-brand)',
  },
} satisfies ChartConfig

export function AeToolLatencyChartPlot({
  chartData,
  referenceMs,
}: Readonly<{
  chartData: readonly LatencyChartPoint[]
  referenceMs?: number
}>) {
  return (
    <ChartContainer
      config={chartConfig}
      className="h-56 min-h-56 w-full aspect-auto"
      initialDimension={{ width: 640, height: 224 }}
    >
      <BarChart
        accessibilityLayer
        data={[...chartData]}
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
        {referenceMs === undefined ? null : (
          <ReferenceLine
            y={referenceMs}
            stroke="var(--color-muted-foreground)"
            strokeDasharray="3 3"
            label={{
              value: 'p95',
              position: 'insideTopRight',
              fill: 'var(--color-muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Bar
          dataKey="durationMs"
          fill="var(--color-durationMs)"
          radius={[2, 2, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ChartContainer>
  )
}

function formatAxisDuration(value: number): string {
  if (value < 1_000) return `${value}ms`
  const seconds = value / 1_000
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}
