import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'

import type { EarningsEmptyStateProps } from '../earnings-card.contracts'

export type EarningsEmptyStateComponentProps = EarningsEmptyStateProps

export function EarningsEmptyState(props: EarningsEmptyStateComponentProps) {
  switch (props.variant) {
    case 'error_unauthenticated':
      return (
        <AeEmptyState
          role="alert"
          title="Earnings are unavailable for this session."
          description="An authenticated owner session is required to read provider earnings."
        />
      )
    case 'error_source':
      return (
        <AeEmptyState
          role="alert"
          title="Earnings source is unavailable."
          description="We could not read source earnings and payout data. Try again later."
        />
      )
    case 'not_found':
      return (
        <AeEmptyState
          title="No earnings have been recorded."
          description="This provider does not have an earnings account yet. Setup or test calls do not create earnings."
        />
      )
    case 'empty_accounts':
      return (
        <AeEmptyState
          title="No earnings have been recorded."
          description="No provider earnings account exists yet. Setup or test calls do not create earnings."
        />
      )
    default: {
      const _exhaustive: never = props
      return _exhaustive
    }
  }
}
