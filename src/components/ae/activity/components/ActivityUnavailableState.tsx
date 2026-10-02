import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/arc/button/button'

import type { ActivityUnavailableStateProps } from '../activity.contracts'

export function ActivityUnavailableState({ retryPending, onRetry }: ActivityUnavailableStateProps) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Calls"
      description="Review Calls that need attention, then inspect recent outcomes and receipts."
      currentPath="/activity"
    >
      <AeDegradedState
        title="Calls are temporarily unavailable"
        description="No call outcome is being inferred. Try loading the authoritative activity again."
        action={(
          <Button
            type="button"
            variant="secondary"
            className="min-h-touch"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={onRetry}
          >
            {retryPending ? 'Trying again…' : 'Try again'}
          </Button>
        )}
      />
    </AeOperatorPage>
  )
}
