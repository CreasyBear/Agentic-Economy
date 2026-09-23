import { Skeleton } from '@/components/ui/skeleton'

export function WorkspaceDangerZoneSkeleton() {
  return (
    <div className="grid min-h-[28rem] gap-section" aria-busy="true">
      <Skeleton className="min-h-[12rem] w-full" />
      <Skeleton className="min-h-[12rem] w-full" />
    </div>
  )
}
