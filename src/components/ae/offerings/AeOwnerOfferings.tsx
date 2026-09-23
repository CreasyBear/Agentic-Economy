import {
  OwnerOfferingsEmptyState,
  OwnerOfferingsProjectionGate,
} from './owner-offerings/components/OwnerOfferingsGate'
import { OwnerOfferingsTable } from './owner-offerings/components/OwnerOfferingsTable'
import type { AeOwnerOfferingsListProps } from './owner-offerings/owner-offerings.contracts'
import { useOwnerOfferings } from './owner-offerings/useOwnerOfferings'

export {
  TACTILE_PRESS_CLASS,
  type OwnerOfferingSummary,
} from './owner-offerings/owner-offerings.contracts'
export {
  matchesOwnerOfferingInventory,
  toOwnerOfferingSummary,
} from './owner-offerings/useOwnerOfferings'

export function AeOwnerOfferingsList({
  offerings,
  projectionState = 'current',
  onRetryProjection,
  loading = false,
  hideEmptyState = false,
  filterValue,
  onFilterChange,
  sorting,
  onSortingChange,
  activeRowActionId,
  onActiveRowActionIdChange,
  restoreRowActionFocus = false,
}: AeOwnerOfferingsListProps) {
  const state = useOwnerOfferings({
    offerings,
    ...(filterValue === undefined ? {} : { filterValue }),
    ...(sorting === undefined ? {} : { sorting }),
    ...(activeRowActionId === undefined ? {} : { activeRowActionId }),
    restoreRowActionFocus,
  })

  return (
    <div className="grid gap-4">
      <OwnerOfferingsProjectionGate
        projectionState={projectionState}
        {...(onRetryProjection === undefined ? {} : { onRetryProjection })}
      />
      {offerings.length === 0 && !loading ? (
        hideEmptyState ? null : <OwnerOfferingsEmptyState />
      ) : (
        <OwnerOfferingsTable
          offerings={offerings}
          loading={loading}
          {...(filterValue === undefined ? {} : { filterValue })}
          {...(onFilterChange === undefined ? {} : { onFilterChange })}
          {...(sorting === undefined ? {} : { sorting })}
          {...(onSortingChange === undefined ? {} : { onSortingChange })}
          {...(activeRowActionId === undefined ? {} : { activeRowActionId })}
          {...(onActiveRowActionIdChange === undefined ? {} : { onActiveRowActionIdChange })}
          restoreRowActionFocus={restoreRowActionFocus}
          state={state}
        />
      )}
    </div>
  )
}
