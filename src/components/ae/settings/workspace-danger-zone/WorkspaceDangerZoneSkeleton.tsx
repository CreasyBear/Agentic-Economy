import { Skeleton } from '@/components/ui/skeleton'
import './WorkspaceDangerComposition.css'

export function WorkspaceDangerZoneSkeleton() {
  return (
    <div className="arc-market arc-workspace-danger-loading" aria-busy="true">
      {[0, 1].map(index => <div key={index} className="arc-workspace-danger-placeholder" aria-hidden="true">
        <Skeleton className="h-6 w-48 max-w-full" /><Skeleton className="h-4 w-3/4" />
      </div>)}
    </div>
  )
}
