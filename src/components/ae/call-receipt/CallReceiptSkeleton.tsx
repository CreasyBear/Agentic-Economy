import { Skeleton } from '@/components/ui/skeleton'

export function CallReceiptSkeleton() {
  return (
    <div className="grid gap-section py-2" aria-busy="true" aria-label="Loading call receipt">
      <div className="rounded-xl border border-border bg-card p-5 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-8 w-48 max-w-full" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      <div className="min-h-[12rem] rounded-xl border border-border bg-card p-5 grid gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="min-h-[13.5rem] rounded-xl border border-border bg-card p-5 grid gap-4">
        <Skeleton className="h-5 w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="min-h-[4.5rem] rounded-xl border border-border bg-card p-5 grid gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="border-t border-border pt-related">
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  )
}
