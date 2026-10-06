import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import { useMemo } from 'react'

import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ownerToolLifecycleVariant,
  ownerToolProtocolBadgeVariant,
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

const inventoryFilter: FilterFn<OwnerOfferingSummary> = (row, _columnId, filterValue) =>
  matchesOwnerOfferingInventory(row.original, String(filterValue))

export function OwnerOfferingsTable({
  offerings,
  loading,
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
  const columns = useMemo<ColumnDef<OwnerOfferingSummary, unknown>[]>(() => [
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
        </div>
      ),
    },
    {
      id: 'status',
      meta: { label: 'Status' },
      accessorFn: (item) => item.lifecycleLabel ?? statusLabel(item.status),
      enableGlobalFilter: false,
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => <OwnerOfferingStatusCluster item={row.original} showBlocker />,
    },
    {
      id: 'price',
      meta: { label: 'Price' },
      accessorFn: (item) => item.pricingLabel ?? '—',
      enableGlobalFilter: false,
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
      header: ({ column }) => <AeOperatorSortableHeader label={OWNER_OFFERINGS_COPY.callsColumn} column={column} />,
      cell: ({ row }) => (
        <span className="font-mono arc-owner-inventory-metric">
          {formatOwnerOfferingCalls(row.original)}
        </span>
      ),
    },
  ], [])

  return (
    <AeRecordTable
      columns={columns}
      data={offerings}
      caption="Tools"
      countLabel="Tools"
      filterPlaceholder="Search name, protocol, or ID…"
      {...(filterEmptyMessage === undefined ? {} : { emptyMessage: filterEmptyMessage })}
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
        getHref: (item) => item.continuation?.href ?? `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`,
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
      {availability === undefined ? null : (
        <Badge tone={availability.variant} className="gap-1.5">
          {availability.hasDot ? (
            <span
              className={`size-1.5 rounded-full ${availability.variant === 'success' ? 'bg-success' : 'bg-destructive'}`}
            />
          ) : null}
          {availability.label}
        </Badge>
      )}
      {item.protocolLabel === undefined ? null : (
        <Badge tone={ownerToolProtocolBadgeVariant(item.protocolLabel)}>{item.protocolLabel}</Badge>
      )}
      {showBlocker && item.blocker !== undefined ? (
        <span className="arc-owner-inventory-blocker">{item.blocker}</span>
      ) : null}
    </div>
  )
}
