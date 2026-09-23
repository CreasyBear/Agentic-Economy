import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { ACTIVITY_TACTILE_PRESS_CLASS, type ActivityPaginationControlProps } from '../activity.contracts'

export function ActivityPaginationControl({ pagination, onLoadMore }: ActivityPaginationControlProps) {
  if (pagination.cursor === undefined) return null
  return (
    <div className="flex flex-col items-center gap-intra border-t border-border pt-related">
      {pagination.status === 'failed' ? (
        <Alert>
          <AlertTitle>Could not load older Calls.</AlertTitle>
          <AlertDescription>
            A$0.00 affected — your account balance is unchanged. Check your connection and try loading more again.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className={`min-h-touch ${ACTIVITY_TACTILE_PRESS_CLASS}`}
        disabled={pagination.status === 'loading'}
        aria-busy={pagination.status === 'loading' || undefined}
        onClick={() => { void onLoadMore() }}
      >
        {pagination.status === 'loading' ? 'Loading…' : pagination.status === 'failed' ? 'Try loading more again' : 'Load more'}
      </Button>
    </div>
  )
}
