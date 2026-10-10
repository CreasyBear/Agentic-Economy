import { Skeleton } from '@/components/arc/skeleton/skeleton'
export function PlanRunSkeleton() {
  return <section aria-label="Loading Plan" aria-busy="true" className="grid min-h-96 gap-6 rounded-lg border border-border p-6">
    <Skeleton lines={2} label="Loading Plan status" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(key => <Skeleton key={key} lines={2} />)}</div>
    <Skeleton lines={6} label="Loading Plan stages" />
  </section>
}
