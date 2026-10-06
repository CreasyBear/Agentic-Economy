import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'

import './ActivitySummaryComposition.css'

import type { ActivityPaginationControlProps } from '../activity.contracts'

export function ActivityPaginationControl({ pagination, onLoadMore }: ActivityPaginationControlProps) {
  if (pagination.cursor === undefined) return null
  return (
    <div className="arc-market arc-activity-pagination">
      {pagination.status === 'failed' ? (
        <AeAlert role="alert" tone="info" title="Could not load older Calls.">
            The loaded Calls remain available. Retry to read the remaining history for this period.
          </AeAlert>
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
