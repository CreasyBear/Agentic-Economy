import { Link } from '@tanstack/react-router'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import { BotIcon, Link2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  BusinessOfferingProjection,
  BusinessOfferingStatus,
  PublicOfferingSupplyProjection,
} from '@/modules/catalog/public'

export type OwnerOfferingSummary = Readonly<{
  offering: BusinessOfferingProjection
  status: BusinessOfferingStatus
  accessPathCount: number
  support?: PublicOfferingSupplyProjection['support']
  lifecycleLabel?: string
  availability?: 'available' | 'unavailable' | 'unknown'
  blocker?: string
  continuation?: Readonly<{ label: string; href: string }>
  lifecyclePending?: boolean
}>

export function toOwnerOfferingSummary(
  projection: PublicOfferingSupplyProjection,
  status: BusinessOfferingStatus = 'published',
): OwnerOfferingSummary {
  return {
    offering: projection.offering,
    status,
    accessPathCount: projection.accessPaths.length,
    support: projection.support,
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
  const compactOfferings = useMemo(() => {
    const query = filterValue?.trim().toLocaleLowerCase() ?? ''
    const filtered = query.length === 0
      ? [...offerings]
      : offerings.filter((item) => [
          item.offering.name,
          item.offering.summary,
          item.lifecycleLabel,
          item.availability,
          item.blocker,
        ].some((value) => value?.toLocaleLowerCase().includes(query) === true))
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
  }, [filterValue, offerings, sorting])

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
      header: ({ column }) => <AeOperatorSortableHeader label="Operation" column={column} />,
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
      header: ({ column }) => <AeOperatorSortableHeader label="Lifecycle" column={column} />,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <Badge variant="outline">
            {row.original.lifecyclePending ? 'Loading…' : row.original.lifecycleLabel ?? statusLabel(row.original.status)}
          </Badge>
          {row.original.availability === undefined ? null : (
            <span className="text-xs text-muted-foreground">{availabilityLabel(row.original.availability)}</span>
          )}
        </div>
      ),
    },
    {
      id: 'blocker',
      accessorFn: (item) => item.blocker ?? '',
      header: 'Blocker',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.blocker ?? '—'}</span>,
    },
    {
      id: 'continuation',
      header: 'Next action',
      cell: ({ row }) => row.original.continuation === undefined ? null : (
        <Button asChild size="sm" variant="secondary" className="min-h-touch w-full whitespace-normal sm:w-auto">
          <a href={row.original.continuation.href}>{row.original.continuation.label}</a>
        </Button>
      ),
    },
    {
      id: 'routes',
      accessorFn: (item) => item.accessPathCount,
      header: 'Access',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2Icon className="size-3.5" aria-hidden="true" />
          {row.original.accessPathCount === 0
            ? 'No access route'
            : `${row.original.accessPathCount} ${row.original.accessPathCount === 1 ? 'route' : 'routes'}`}
        </span>
      ),
    },
    {
      id: 'ready',
      accessorFn: (item) => item.support?.routeable === true,
      header: 'Readiness',
      cell: ({ row }) => row.original.support?.routeable === true ? (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <BotIcon className="size-3.5" aria-hidden="true" /> Ready now
        </span>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
  ], [])

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
          title="No Operations yet"
          description="Connect a source and choose the exact Operation AE should validate."
          action={<Button asChild className="min-h-touch"><Link to="/owner/offerings/new">Add Operation</Link></Button>}
        />
      ) : (
        <AeRecordTable
          columns={columns}
          data={offerings}
          caption="Operations"
          countLabel="Operations"
          filterPlaceholder="Filter Operations…"
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
            compactContent: (
              <ul ref={compactRootRef} className="m-0 list-none divide-y divide-border p-0" data-testid="owner-operations-compact-list">
                {compactOfferings.map((item) => {
                  const action = item.continuation ?? {
                    label: 'Open Operation',
                    href: `/owner/supply/${encodeURIComponent(item.offering.offeringRef)}`,
                  }
                  return (
                    <li key={item.offering.offeringRef} className="grid min-w-0 gap-related py-related">
                      <div className="grid gap-1">
                        <h3 className="break-words font-semibold">{item.offering.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {item.lifecyclePending ? 'Loading lifecycle' : item.lifecycleLabel} / {item.availability === undefined ? 'Availability unknown' : availabilityLabel(item.availability)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.blocker ?? 'No blocker'}</p>
                      <Button asChild variant="secondary" className="min-h-touch w-full whitespace-normal">
                        <a
                          href={action.href}
                          data-ae-row-action-id={item.offering.offeringRef}
                          aria-label={`${action.label} for ${item.offering.name}`}
                          onFocus={() => onActiveRowActionIdChange?.(item.offering.offeringRef)}
                        >
                          {action.label}
                        </a>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ),
          } : {})}
          rowAction={{
            kind: 'link',
            label: 'Open',
            getHref: (item) => `/owner/supply/${encodeURIComponent(item.offering.offeringRef)}`,
            getAccessibleLabel: (item) => `Open ${item.offering.name}`,
          }}
        />
      )}
    </div>
  )
}

function statusLabel(status: BusinessOfferingStatus): string {
  return status[0]?.toUpperCase() + status.slice(1)
}

function availabilityLabel(value: 'available' | 'unavailable' | 'unknown'): string {
  if (value === 'available') return 'Available'
  if (value === 'unavailable') return 'Unavailable'
  return 'Availability unknown'
}

function compactSortValue(item: OwnerOfferingSummary, id: string): string {
  if (id === 'name') return item.offering.name
  if (id === 'status') return item.lifecycleLabel ?? statusLabel(item.status)
  if (id === 'blocker') return item.blocker ?? ''
  if (id === 'routes') return String(item.accessPathCount)
  if (id === 'ready') return String(item.support?.routeable === true)
  return item.offering.name
}
