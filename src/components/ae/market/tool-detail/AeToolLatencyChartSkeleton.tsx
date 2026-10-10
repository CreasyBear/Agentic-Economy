import { Skeleton } from '@/components/arc/skeleton/skeleton'

/** Holds `ChartContainer`'s `h-56` box while the chart code loads. */
export function AeToolLatencyChartSkeleton() {
  return <div className="h-56 min-h-56 w-full"><Skeleton lines={6} label="Loading chart" /></div>
}
