import {
  OwnerOfferingsEmptyState,
  OwnerOfferingsProjectionGate,
} from './owner-offerings/components/OwnerOfferingsGate'
import { OwnerOfferingsTable } from './owner-offerings/components/OwnerOfferingsTable'
import type { AeOwnerOfferingsListProps } from './owner-offerings/owner-offerings.contracts'
import { useOwnerOfferings } from './owner-offerings/useOwnerOfferings'

export type { OwnerOfferingSummary } from './owner-offerings/owner-offerings.contracts'
export {
  matchesOwnerOfferingInventory,
  toOwnerOfferingSummary,
} from './owner-offerings/useOwnerOfferings'

export function AeOwnerOfferingsList({
  offerings,
  projectionState = 'current',
  onRetryProjection,
  loading = false,
  serverControlled = false,
  toolbar,
  inventoryQuery,
  emptyMessage,
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
      {offerings.length === 0 && !loading && !serverControlled ? (
        hideEmptyState ? null : <OwnerOfferingsEmptyState />
      ) : (
        <OwnerOfferingsTable
          offerings={offerings}
          loading={loading}
          serverControlled={serverControlled}
          {...(inventoryQuery === undefined ? {} : { inventoryQuery })}
          {...(toolbar === undefined ? {} : { toolbar })}
          {...(emptyMessage === undefined ? {} : { emptyMessage })}
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
