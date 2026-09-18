import { Skeleton } from '@/components/ui/skeleton'

export function CallReceiptSkeleton() {
  return (
    <div className="grid gap-section py-2" aria-busy="true" aria-label="Loading call receipt">
      {/* Header status summary skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 grid gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* Economic facts card skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 grid gap-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="grid gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="grid gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="grid gap-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>

      {/* Execution timeline skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 grid gap-4">
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 rounded-full" />
              <div className="grid gap-1 flex-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical request/response payload skeleton */}
      <div className="rounded-xl border border-border bg-card p-5 grid gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    </div>
  )
}
