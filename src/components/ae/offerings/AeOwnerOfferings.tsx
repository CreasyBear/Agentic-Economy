import { Link } from '@tanstack/react-router'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import { useEffect, useMemo, useRef } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import {
  ownerToolAvailabilityPresentation,
  ownerToolLifecycleVariant,
  ownerToolProtocolBadgeVariant,
  type OwnerOfferingSummary,
} from '@/components/ae/offerings/provider-workspace-projection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  BusinessOfferingProjection,
  BusinessOfferingStatus,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'

export const TACTILE_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type { OwnerOfferingSummary } from '@/components/ae/offerings/provider-workspace-projection'

export function matchesOwnerOfferingInventory(item: OwnerOfferingSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase()
  if (normalized.length === 0) return true
  const availabilityPresentation = ownerToolAvailabilityPresentation(item.availability)
  const candidates = [
    item.offering.name,
    item.offering.summary,
    item.protocolLabel,
    item.offering.offeringRef,
    item.slug,
    item.lifecycleLabel,
    availabilityPresentation?.label,
    item.availability,
    item.blocker,
  ]
  return candidates.some((value) => value?.toLocaleLowerCase().includes(normalized) === true)
}

export function toOwnerOfferingSummary(
  projection: PublicOfferingSupplyProjection,
  status: BusinessOfferingStatus = 'published',
): OwnerOfferingSummary {
  const offeringWithSlug = projection.offering as BusinessOfferingProjection & { slug?: string }
  return {
    offering: projection.offering,
    status,
    accessPathCount: projection.accessPaths.length,
    support: projection.support,
    ...(offeringWithSlug.slug === undefined ? {} : { slug: offeringWithSlug.slug }),
  }
}

export function AeOwnerOfferingsList({
  offerings,
  projectionState = 'current',
  onRetryProjection,
  loading = false,
  filterValue,
  onFilterChange,
  sorting,
  onSortingChange,
  activeRowActionId,
  onActiveRowActionIdChange,
  restoreRowActionFocus = false,
}: {
  offerings: readonly OwnerOfferingSummary[]
  projectionState?: 'current' | 'projection_pending'
  onRetryProjection?: () => void
  loading?: boolean
  filterValue?: string
  onFilterChange?: (value: string) => void
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  activeRowActionId?: string
  onActiveRowActionIdChange?: (id: string) => void
  restoreRowActionFocus?: boolean
}) {
  const compactRootRef = useRef<HTMLUListElement>(null)
  const hasLifecyclePresentation = offerings.some((item) => item.lifecycleLabel !== undefined)
  const trimmedFilter = filterValue?.trim() ?? ''
  const compactOfferings = useMemo(() => {
    const filtered = trimmedFilter.length === 0
      ? [...offerings]
      : offerings.filter((item) => matchesOwnerOfferingInventory(item, trimmedFilter))
    const rule = sorting?.[0]
    if (rule === undefined) return filtered
    return filtered.sort((left, right) => {
      const comparison = compactSortValue(left, rule.id).localeCompare(
        compactSortValue(right, rule.id),
        undefined,
        { numeric: true },
      )
      return rule.desc ? -comparison : comparison
    })
  }, [offerings, sorting, trimmedFilter])

  useEffect(() => {
    if (!hasLifecyclePresentation || !restoreRowActionFocus || activeRowActionId === undefined) return
    const action = Array.from(compactRootRef.current?.querySelectorAll<HTMLElement>('[data-ae-row-action-id]') ?? [])
      .find((element) => element.dataset.aeRowActionId === activeRowActionId)
    if (action === undefined) return
    const frame = window.requestAnimationFrame(() => action.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [activeRowActionId, compactOfferings, hasLifecyclePresentation, restoreRowActionFocus])

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
      header: ({ column }) => <AeOperatorSortableHeader label="Usage" column={column} />,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-foreground">
          {formatOwnerOfferingUsage(row.original)}
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
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={`h-8 px-2 text-xs ${TACTILE_PRESS_CLASS}`}
            >
              <Link to={testRunHref} aria-label={`Test Run for ${item.offering.name}`}>
                Test Run
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={`h-8 px-2 text-xs ${TACTILE_PRESS_CLASS}`}
            >
              <Link to="/activity" aria-label={`View logs for ${item.offering.name}`}>
                Activity
              </Link>
            </Button>
          </div>
        )
      },
    },
  ], [])

  const filterEmptyMessage = trimmedFilter.length > 0
    ? `No tools match '${trimmedFilter}'`
    : undefined

  return (
    <div className="grid gap-4">
      {projectionState === 'current' ? null : (
        <Alert>
          <AlertTitle>Your public page is still updating</AlertTitle>
          <AlertDescription>
            <p>Your changes are saved. People still see the last safe page until this update finishes.</p>
            {onRetryProjection === undefined ? null : (
              <Button type="button" variant="secondary" className="min-h-touch" onClick={onRetryProjection}>
                Refresh public status
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {offerings.length === 0 && !loading ? (
        <AeEmptyState
          title="No Tools yet"
          description="Connect a source and choose the exact Tool AE should validate."
          action={<Button asChild className="min-h-touch"><Link to="/owner/operations/new">Add Tool</Link></Button>}
        />
      ) : (
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
                        <h3 className="break-words font-semibold">{item.offering.name}</h3>
                        <OwnerOfferingStatusCluster item={item} />
                        <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
                          <span>{item.pricingLabel ?? '—'}</span>
                          <span>·</span>
                          <span>{formatOwnerOfferingUsage(item)}</span>
                        </div>
                        {item.blocker === undefined ? null : (
                          <span className="text-xs text-muted-foreground">{item.blocker}</span>
                        )}
                      </div>
                      <Button asChild variant="secondary" className={`min-h-touch w-full whitespace-normal ${TACTILE_PRESS_CLASS}`}>
                        <a
                          href={action.href}
                          data-ae-row-action-id={item.offering.offeringRef}
                          aria-label={`${action.label} for ${item.offering.name}`}
                          onFocus={() => onActiveRowActionIdChange?.(item.offering.offeringRef)}
                        >
                          {action.label}
                        </a>
                      </Button>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm" className={TACTILE_PRESS_CLASS}>
                          <Link to={testRunHref} aria-label={`Test Run for ${item.offering.name}`}>
                            Test Run
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className={TACTILE_PRESS_CLASS}>
                          <Link to="/activity" aria-label={`View logs for ${item.offering.name}`}>
                            Activity
                          </Link>
                        </Button>
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
      )}
    </div>
  )
}

function OwnerOfferingStatusCluster({
  item,
  showBlocker = false,
}: {
  item: OwnerOfferingSummary
  showBlocker?: boolean
}) {
  const lifecycle = ownerToolLifecycleVariant(
    item.lifecycleLabel ?? statusLabel(item.status),
    item.lifecyclePending,
  )
  const availability = ownerToolAvailabilityPresentation(item.availability)
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

function formatOwnerOfferingUsage(item: OwnerOfferingSummary): string {
  if (item.callsCount !== undefined) {
    return `${item.callsCount.toLocaleString('en-AU')} calls`
  }
  return `${item.accessPathCount.toLocaleString('en-AU')} access path${item.accessPathCount === 1 ? '' : 's'}`
}

function statusLabel(status: BusinessOfferingStatus): string {
  return status[0]?.toUpperCase() + status.slice(1)
}

function compactSortValue(item: OwnerOfferingSummary, id: string): string {
  if (id === 'name') return item.offering.name
  if (id === 'status') return item.lifecycleLabel ?? statusLabel(item.status)
  if (id === 'price') return item.pricingLabel ?? ''
  if (id === 'activity') return String(item.callsCount ?? item.accessPathCount)
  return item.offering.name
}
