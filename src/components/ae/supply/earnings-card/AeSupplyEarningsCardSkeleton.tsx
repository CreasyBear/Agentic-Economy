import { Skeleton } from '@/components/ui/skeleton'

export function AeSupplyEarningsCardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4">
        <section className="grid gap-4">
          <div className="grid gap-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="grid gap-2">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
          <div className="grid min-h-[7.5rem] gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-full max-w-lg" />
          </div>
          <div className="flex min-h-touch flex-wrap gap-2">
            <Skeleton className="h-touch w-36" />
            <Skeleton className="h-touch w-52" />
          </div>
          <Skeleton className="min-h-[5.5rem] w-full" />
        </section>
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </div>
  )
}
