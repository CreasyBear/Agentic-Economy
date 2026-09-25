import { Skeleton } from '@/components/ui/skeleton'

export function TeamRolesSkeleton() {
  return <div className="grid min-w-0 gap-8" aria-label="Loading team and roles" role="status">
    <div className="grid gap-2"><Skeleton className="h-8 w-44" /><Skeleton className="h-5 w-72 max-w-full" /></div>
    <div className="rounded-card border border-border bg-card p-4"><Skeleton className="mb-6 h-6 w-28" />
      <div className="grid gap-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
    </div>
  </div>
}
