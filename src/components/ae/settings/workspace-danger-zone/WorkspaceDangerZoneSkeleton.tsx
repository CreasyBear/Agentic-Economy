import { Skeleton as ArcSkeleton } from '@/components/arc/skeleton/skeleton'
import './WorkspaceDangerComposition.css'

export function WorkspaceDangerZoneSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading workspace actions" className="arc-market arc-workspace-danger-loading">
      {[0, 1].map(index => <div key={index} className="arc-workspace-danger-placeholder" aria-hidden="true">
        <div className="h-6 w-48 max-w-full"><ArcSkeleton lines={1} /></div>
        <div className="h-4 w-3/4 overflow-hidden"><ArcSkeleton lines={1} /></div>
      </div>)}
    </div>
  )
}
