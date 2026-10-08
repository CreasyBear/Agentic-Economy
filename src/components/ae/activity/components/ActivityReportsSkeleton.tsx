import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import './ActivitySummaryComposition.css'

/** Only unresolved finance uses these shapes; confirmed Calls and Plans stay above it. */
export function ActivityReportsSkeleton() {
  return <div className="arc-market arc-activity-reports-pending" aria-busy="true">
    <p role="status" aria-live="polite" className="arc-activity-loading-label">
      <Spinner aria-hidden="true" role="presentation" />
      Loading totals and reconciliation for this period…
    </p>
    <div aria-hidden="true" className="arc-activity-skeleton-content">
      <Skeleton className="arc-activity-skeleton-heading" />
      <div className="arc-activity-skeleton-metrics">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="arc-activity-skeleton-metric">
          <Skeleton className="arc-activity-skeleton-label" />
          <Skeleton className="arc-activity-skeleton-value" />
        </div>)}
      </div>
      <Skeleton className="arc-activity-skeleton-note" />
    </div>
  </div>
}
