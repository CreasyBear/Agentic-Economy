import { Skeleton } from '@/components/ui/skeleton'

export function AeToolTestPlaygroundSkeleton() {
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
        <Skeleton className="h-[7.5rem] w-full" />
        <div className="min-h-[2.5rem]" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="min-h-touch h-10 w-44" />
        <div className="min-h-[1.75rem] flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="grid min-h-[12rem] gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  )
}
