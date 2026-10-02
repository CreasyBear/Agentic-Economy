import { Skeleton } from '@/components/ui/skeleton'
import './TeamComposition.css'

export function TeamRolesSkeleton() {
  return <div className="arc-market arc-team-loading" aria-label="Loading team and roles" role="status">
    <div className="arc-team-loading-title" aria-hidden="true"><Skeleton className="h-8 w-44" /><Skeleton className="h-5 w-72 max-w-full" /></div>
    <div className="arc-team-members" aria-hidden="true">
      {[0, 1].map(index => <div key={index} className="arc-team-member-row-inner">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="arc-team-member-identity"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/4" /></div>
        <Skeleton className="h-6 w-20 max-w-full" />
      </div>)}
    </div>
  </div>
}
