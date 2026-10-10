import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import { useMemo } from 'react'
import { appendOwnerInventoryReturnContext } from '@/lib/operator/owner-inventory-return'

import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ownerToolLifecycleVariant,
  type OwnerOfferingSummary,
} from '@/components/ae/offerings/provider-workspace-projection'
import { Badge } from '@/components/arc/badge/badge'

import {
  OWNER_OFFERINGS_COPY,
  type OwnerOfferingStatusClusterProps,
  type OwnerOfferingsTableProps,
} from '../owner-offerings.contracts'
import {
  matchesOwnerOfferingInventory,
  statusLabel,
} from '../useOwnerOfferings'
import {
  formatOwnerOfferingCalls,
  ownerOfferingAvailabilityPresentation,
} from '../owner-offerings.view-model'
import './OwnerInventoryComposition.css'

const inventoryFilter: FilterFn<AeRecordTableFeatures, OwnerOfferingSummary> = (row, _columnId, filterValue) =>
  matchesOwnerOfferingInventory(row.original, String(filterValue))

export function OwnerOfferingsTable({
  offerings,
  loading,
  serverControlled = false,
  toolbar,
  inventoryQuery,
  emptyMessage,
  filterValue,
  onFilterChange,
  sorting,
  onSortingChange,
  activeRowActionId,
  onActiveRowActionIdChange,
  restoreRowActionFocus,
  state,
}: OwnerOfferingsTableProps) {
  const { filterEmptyMessage } = state
  const columns = useMemo<ColumnDef<AeRecordTableFeatures, OwnerOfferingSummary, unknown>[]>(() => [
    {
      id: 'name',
      meta: { label: 'Tool' },
      accessorFn: (item) => item.offering.name,
      enableGlobalFilter: true,
      header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
      cell: ({ row }) => (
        <div className="arc-owner-inventory-tool">
          <span className="arc-owner-inventory-name" title={row.original.offering.name}>{row.original.offering.name}</span>
          <span className="arc-owner-inventory-summary" title={row.original.offering.summary}>{row.original.offering.summary}</span>
          {row.original.protocolLabel === undefined ? null : <span className="arc-owner-inventory-blocker">{row.original.protocolLabel}</span>}
        </div>
      ),
    },
    {
      id: 'status',
      meta: { label: 'Status' },
      accessorFn: (item) => item.lifecycleLabel ?? statusLabel(item.status),
      enableGlobalFilter: false,
      enableSorting: !serverControlled,
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => <OwnerOfferingStatusCluster item={row.original} showBlocker />,
    },
    {
      id: 'price',
      meta: { label: 'Price', numeric: true },
      accessorFn: (item) => item.pricingLabel ?? '—',
      enableGlobalFilter: false,
      // This projection supplies display text, not a comparable exact price.
      enableSorting: false,
      header: ({ column }) => <AeOperatorSortableHeader label="Price" column={column} />,
      cell: ({ row }) => (
        <span className="font-mono arc-owner-inventory-metric">
          {row.original.pricingLabel ?? '—'}
        </span>
      ),
    },
    {
      id: 'activity',
      meta: { label: OWNER_OFFERINGS_COPY.callsColumn, numeric: true },
      accessorFn: (item) => item.callsCount ?? 0,
      enableGlobalFilter: false,
      enableSorting: !serverControlled,
      header: ({ column }) => <AeOperatorSortableHeader label={OWNER_OFFERINGS_COPY.callsColumn} column={column} />,
      cell: ({ row }) => (
        <span className="font-mono arc-owner-inventory-metric">
          {formatOwnerOfferingCalls(row.original)}
        </span>
      ),
    },
  ], [serverControlled])

  return (
    <AeRecordTable
      columns={columns}
      serverControlled={serverControlled}
      hideFilter={serverControlled}
      {...(toolbar === undefined ? {} : { action: toolbar })}
      data={offerings}
      caption="Tools"
      countLabel="Tools"
      filterPlaceholder="Search name, protocol, or ID…"
      {...(emptyMessage !== undefined ? { emptyMessage } : filterEmptyMessage !== undefined ? { emptyMessage: filterEmptyMessage } : serverControlled ? { emptyMessage: 'No Tools in this inventory page.' } : {})}
      getRowId={(item) => item.offering.offeringRef}
      loading={loading}
      {...(filterValue === undefined ? {} : { filterValue })}
      {...(onFilterChange === undefined ? {} : { onFilterChange })}
      globalFilterFn={inventoryFilter}
      {...(sorting === undefined ? {} : { sorting })}
      {...(onSortingChange === undefined ? {} : { onSortingChange })}
      rowActionFocus={{
        ...(activeRowActionId === undefined ? {} : { currentId: activeRowActionId }),
        ...(onActiveRowActionIdChange === undefined ? {} : { onCurrentIdChange: onActiveRowActionIdChange }),
        restore: restoreRowActionFocus,
      }}
      rowAction={{
        kind: 'link',
        label: 'Next action',
        getLabel: (item) => item.continuation?.label ?? 'Open Tool',
        getHref: (item) => appendOwnerInventoryReturnContext(item.continuation?.href ?? `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`, inventoryQuery),
        getAccessibleLabel: (item) => `${item.continuation?.label ?? 'Open Tool'} for ${item.offering.name}`,
      }}
    />
  )
}

function OwnerOfferingStatusCluster({
  item,
  showBlocker = false,
}: OwnerOfferingStatusClusterProps) {
  const lifecycle = ownerToolLifecycleVariant(
    item.lifecycleLabel ?? statusLabel(item.status),
    item.lifecyclePending,
  )
  const availability = ownerOfferingAvailabilityPresentation(item.availability)
  return (
    <div className="arc-market arc-owner-inventory-status">
      <Badge tone={lifecycle.variant}>{lifecycle.label}</Badge>
      {availability === undefined ? null : <span className="arc-owner-inventory-blocker">{availability.label}</span>}
      {showBlocker && item.blocker !== undefined ? (
        <span className="arc-owner-inventory-blocker">{item.blocker}</span>
      ) : null}
    </div>
  )
}
