import { AeFactList } from '@/components/ae/data/AeFactList'

import type { EarningsFactsListProps } from '../earnings-card.contracts'

export type EarningsFactsListComponentProps = EarningsFactsListProps

export function EarningsFactsList({
  currency,
  facts,
}: EarningsFactsListComponentProps) {
  return (
    <>
      <div className="grid gap-1">
        <h4 className="font-semibold text-foreground">
          {currency} earnings
        </h4>
        <p className="text-sm text-muted-foreground">
          Source-recorded provider earnings and payout state.
        </p>
      </div>
      <AeFactList facts={[...facts]} />
    </>
  )
}
