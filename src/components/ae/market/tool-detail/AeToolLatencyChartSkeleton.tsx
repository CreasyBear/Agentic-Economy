import { Skeleton } from '@/components/ui/skeleton'

/** Matches `ChartContainer`'s `h-56 min-h-56 w-full aspect-auto` box. */
export function AeToolLatencyChartSkeleton() {
  return (
    <Skeleton
      aria-hidden="true"
      className="h-56 min-h-56 w-full rounded-none aspect-auto"
    />
  )
}
