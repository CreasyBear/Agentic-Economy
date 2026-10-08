import { Skeleton } from '@/components/ui/skeleton'

export function TeamRolesPending() {
  return <div role="status" aria-label="Loading team and roles" aria-busy="true" className="grid gap-5">
    <Skeleton className="h-8 w-44" /><Skeleton className="h-64 w-full rounded-xl" />
  </div>
}
