import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import '../CommandPanelComposition.css'

export function ToolDetailPageSkeleton() {
  return <div className="arc-market arc-command-loading-detail" aria-busy="true">
    <p role="status" aria-live="polite" className="arc-command-loading-label">
      <Spinner aria-hidden="true" role="presentation" />Loading Tool…
    </p>
    <div className="arc-command-loading-detail-content" aria-hidden="true">
      <Skeleton className="arc-command-loading-heading" />
      <Skeleton className="arc-command-loading-description" />
      <Skeleton className="arc-command-loading-description" />
      <div className="arc-command-loading-facts">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="arc-command-loading-fact" />)}
      </div>
      <Skeleton className="arc-command-loading-action" />
    </div>
  </div>
}
