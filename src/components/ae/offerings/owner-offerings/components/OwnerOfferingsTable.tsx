import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ownerToolLifecycleVariant,
  ownerToolProtocolBadgeVariant,
  type OwnerOfferingSummary,
} from '@/components/ae/offerings/provider-workspace-projection'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Badge } from '@/components/ui/badge'

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
  const {
    compactRootRef,
    hasLifecyclePresentation,
    trimmedFilter,
    compactOfferings,
    filterEmptyMessage,
  } = state
  const columns = useMemo<ColumnDef<OwnerOfferingSummary, unknown>[]>(() => [
    {
      id: 'name',
      accessorFn: (item) => item.offering.name,
      enableGlobalFilter: true,
      filterFn: (row, _columnId, filterVal) =>
        matchesOwnerOfferingInventory(row.original, String(filterVal)),
      header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
      cell: ({ row }) => (
        <div className="arc-owner-inventory-tool">
          <span className="arc-owner-inventory-name">{row.original.offering.name}</span>
          <span className="arc-owner-inventory-summary">{row.original.offering.summary}</span>
        </div>
      ),
    },
    {
      id: 'status',
      accessorFn: (item) => item.lifecycleLabel ?? statusLabel(item.status),
      enableGlobalFilter: false,
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => <OwnerOfferingStatusCluster item={row.original} showBlocker />,
    },
    {
      id: 'price',
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
      {...(sorting === undefined ? {} : { sorting })}
      {...(onSortingChange === undefined ? {} : { onSortingChange })}
      rowActionFocus={{
        ...(activeRowActionId === undefined ? {} : { currentId: activeRowActionId }),
        ...(onActiveRowActionIdChange === undefined ? {} : { onCurrentIdChange: onActiveRowActionIdChange }),
        restore: restoreRowActionFocus,
      }}
      {...(hasLifecyclePresentation ? {
        compactContent: compactOfferings.length === 0 && trimmedFilter.length > 0 ? (
          <div className="arc-market arc-owner-inventory-empty">
            <span>No tools match &apos;{trimmedFilter}&apos;</span>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="arc-owner-inventory-reset"
              onClick={() => onFilterChange?.('')}
            >
              Reset filter
            </Button>
          </div>
        ) : (
          <ul
            ref={compactRootRef}
            className="arc-market arc-owner-inventory-list"
            data-testid="provider-workspace-compact-list"
          >
            {compactOfferings.map((item) => {
              const action = item.continuation ?? {
                label: 'Open Tool',
                href: `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`,
              }
              return (
                <li key={item.offering.offeringRef} className="arc-owner-inventory-row">
                  <div className="arc-owner-inventory-row-content">
                    <h3 className="arc-owner-inventory-compact-name">{item.offering.name}</h3>
                    <OwnerOfferingStatusCluster item={item} />
                    <div className="arc-owner-inventory-meta font-mono">
                      <span>{item.pricingLabel ?? '—'}</span>
                      <span>·</span>
                      <span>{formatOwnerOfferingCalls(item)}</span>
                    </div>
                    {item.blocker === undefined ? null : (
                      <span className="arc-owner-inventory-blocker">{item.blocker}</span>
                    )}
                  </div>
                  <a
                    href={action.href}
                    data-ae-row-action-id={item.offering.offeringRef}
                    aria-label={`${action.label} for ${item.offering.name}`}
                    onFocus={() => onActiveRowActionIdChange?.(item.offering.offeringRef)}
                    className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md} arc-owner-inventory-action`}
                  >
                    {action.label}
                  </a>
                </li>
              )
            })}
          </ul>
        ),
      } : {})}
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
      <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
      {availability === undefined ? null : (
        <Badge variant={availability.variant} className="gap-1.5">
          {availability.hasDot ? (
            <span
              className={`size-1.5 rounded-full ${availability.variant === 'success' ? 'bg-success' : 'bg-destructive'}`}
            />
          ) : null}
          {availability.label}
        </Badge>
      )}
      {item.protocolLabel === undefined ? null : (
        <Badge variant={ownerToolProtocolBadgeVariant(item.protocolLabel)}>{item.protocolLabel}</Badge>
      )}
      {showBlocker && item.blocker !== undefined ? (
        <span className="arc-owner-inventory-blocker">{item.blocker}</span>
      ) : null}
    </div>
  )
}
