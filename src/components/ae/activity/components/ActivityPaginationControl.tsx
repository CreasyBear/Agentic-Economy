import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'

import './ActivitySummaryComposition.css'

import type { ActivityPaginationControlProps } from '../activity.contracts'

export function ActivityPaginationControl({ pagination, onLoadMore }: ActivityPaginationControlProps) {
  if (pagination.cursor === undefined) return null
  return (
    <div className="arc-market arc-activity-pagination">
      {pagination.status === 'failed' ? (
        <Alert>
          <AlertTitle>Could not load older Calls.</AlertTitle>
          <AlertDescription>
            The loaded Calls remain available. Retry to read the remaining history for this period.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        disabled={pagination.status === 'loading'}
        aria-busy={pagination.status === 'loading' || undefined}
        onClick={() => { void onLoadMore() }}
      >
        {pagination.status === 'loading' ? 'Loading…' : pagination.status === 'failed' ? 'Try loading more again' : 'Load more'}
      </Button>
    </div>
  )
}
