import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ownerToolLifecycleVariant,
  ownerToolProtocolBadgeVariant,
  type OwnerOfferingSummary,
} from '@/components/ae/offerings/provider-workspace-projection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import {
  OWNER_OFFERINGS_COPY,
  TACTILE_PRESS_CLASS,
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
        <div className="grid min-w-[12rem] gap-0.5">
          <span className="font-medium">{row.original.offering.name}</span>
          <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.offering.summary}</span>
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
        <span className="font-mono text-xs tabular-nums text-foreground">
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
        <span className="font-mono text-xs tabular-nums text-foreground">
          {formatOwnerOfferingCalls(row.original)}
        </span>
      ),
    },
    {
      id: 'quickActions',
      enableSorting: false,
      enableGlobalFilter: false,
      header: () => <span className="sr-only">Quick actions</span>,
      cell: ({ row }) => {
        const item = row.original
        const testRunHref = `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`
        return (
          <div className="flex items-center gap-1">
            <Link
              to={testRunHref}
              aria-label={`Test Run for ${item.offering.name}`}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'min-h-touch items-center px-2 text-xs sm:min-h-8',
                TACTILE_PRESS_CLASS,
              )}
            >
              Test Run
            </Link>
            <Link
              to="/activity"
              aria-label={`View logs for ${item.offering.name}`}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'min-h-touch items-center px-2 text-xs sm:min-h-8',
                TACTILE_PRESS_CLASS,
              )}
            >
              Activity
            </Link>
          </div>
        )
      },
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
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <span>No tools match &apos;{trimmedFilter}&apos;</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={TACTILE_PRESS_CLASS}
              onClick={() => onFilterChange?.('')}
            >
              Reset filter
            </Button>
          </div>
        ) : (
          <ul ref={compactRootRef} className="m-0 list-none divide-y divide-border p-0" data-testid="provider-workspace-compact-list">
            {compactOfferings.map((item) => {
              const action = item.continuation ?? {
                label: 'Open Tool',
                href: `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`,
              }
              const testRunHref = `/owner/operations/${encodeURIComponent(item.slug ?? item.offering.offeringRef)}`
              return (
                <li key={item.offering.offeringRef} className="grid min-w-0 gap-related py-related">
                  <div className="grid gap-2">
                    <h3 className="break-words font-medium">{item.offering.name}</h3>
                    <OwnerOfferingStatusCluster item={item} />
                    <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                      <span>{item.pricingLabel ?? '—'}</span>
                      <span>·</span>
                      <span>{formatOwnerOfferingCalls(item)}</span>
                    </div>
                    {item.blocker === undefined ? null : (
                      <span className="text-xs text-muted-foreground">{item.blocker}</span>
                    )}
                  </div>
                  <a
                    href={action.href}
                    data-ae-row-action-id={item.offering.offeringRef}
                    aria-label={`${action.label} for ${item.offering.name}`}
                    onFocus={() => onActiveRowActionIdChange?.(item.offering.offeringRef)}
                    className={cn(
                      buttonVariants({ variant: 'secondary' }),
                      'min-h-touch w-full whitespace-normal',
                      TACTILE_PRESS_CLASS,
                    )}
                  >
                    {action.label}
                  </a>
                  <div className="flex gap-2">
                    <Link
                      to={testRunHref}
                      aria-label={`Test Run for ${item.offering.name}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), TACTILE_PRESS_CLASS)}
                    >
                      Test Run
                    </Link>
                    <Link
                      to="/activity"
                      aria-label={`View logs for ${item.offering.name}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), TACTILE_PRESS_CLASS)}
                    >
                      Activity
                    </Link>
                  </div>
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
    <div className="flex flex-wrap items-center gap-1.5">
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
        <span className="text-xs text-muted-foreground">{item.blocker}</span>
      ) : null}
    </div>
  )
}
