import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { EarningsEmptyStateProps } from '../earnings-card.contracts'

export type EarningsEmptyStateComponentProps = EarningsEmptyStateProps

export function EarningsEmptyState(props: EarningsEmptyStateComponentProps) {
  switch (props.variant) {
    case 'error_unauthenticated':
      return (
        <Alert variant="destructive">
          <AlertTitle>Earnings are unavailable for this session</AlertTitle>
          <AlertDescription>An authenticated owner session is required to read Provider earnings.</AlertDescription>
        </Alert>
      )
    case 'error_source':
      return (
        <Alert variant="destructive">
          <AlertTitle>Earnings source is unavailable</AlertTitle>
          <AlertDescription>Source earnings and payout data could not be read. Try again later.</AlertDescription>
        </Alert>
      )
    case 'not_found':
      return (
        <AeEmptyState
          title="No earnings have been recorded"
          description="This provider does not have an earnings account yet. Setup or test calls do not create earnings."
        />
      )
    case 'empty_accounts':
      return (
        <AeEmptyState
          title="No earnings have been recorded"
          description="No provider earnings account exists yet. Setup or test calls do not create earnings."
        />
      )
    default: {
      const _exhaustive: never = props
      return _exhaustive
    }
  }
}
