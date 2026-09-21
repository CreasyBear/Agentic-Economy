import { useLocation } from '@tanstack/react-router'

import { AeOperatorPage, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorPage'
import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import { Skeleton } from '@/components/ui/skeleton'
import { operatorRoleForPath } from '@/lib/operator/roles'

import type { OperatorRouteSkeletonPreset } from './route-states.contracts'

export function RoutePending({
  title = 'Loading page',
  description = 'Loading the latest available information.',
}: { title?: string; description?: string } = {}) {
  return <AePageSkeleton title={title} description={description} />
}

const OVERVIEW_CARD_PATHS = new Set(['/owner', '/owner/workspace'])

export function inferOperatorSkeletonPreset(pathname: string): OperatorRouteSkeletonPreset {
  if (OVERVIEW_CARD_PATHS.has(pathname)) return 'overview-cards'

  if (pathname.includes('/settings') || pathname.endsWith('/new')) return 'form-record'

  if (
    pathname.includes('/activity')
    || (pathname.includes('/operations') && !pathname.includes('/new'))
    || pathname.includes('/credit')
    || pathname.includes('/table')
  ) {
    return 'table'
  }

  if (pathname.includes('/console') || pathname.includes('/t/')) return 'split-console'

  return 'default'
}

function TableSkeleton() {
  return (
    <div className="grid gap-related">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full rounded-md" />
      <div
        data-testid="skeleton-table"
        className="min-h-[14rem] overflow-hidden rounded-card border border-border bg-card/40"
      >
        <div className="grid grid-cols-4 gap-gutter border-b border-border p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={`header-${index}`} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, rowIndex) => (
          <div
            key={rowIndex}
            data-testid="skeleton-table-row"
            className="grid grid-cols-4 gap-gutter border-b border-border p-4 last:border-b-0"
          >
            {Array.from({ length: 4 }, (_, colIndex) => (
              <Skeleton
                key={`${rowIndex}-${colIndex}`}
                className="h-touch w-full"
                data-testid="skeleton-table-cell"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewCardsSkeleton() {
  return (
    <div className="grid gap-related">
      <div className="grid gap-intra">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60" />
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            data-testid="skeleton-metric-card"
            className="h-32 rounded-xl border border-border bg-card/60 p-4"
          >
            <Skeleton className="mb-3 h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      <div
        data-testid="skeleton-overview-primary"
        className="h-64 rounded-xl border border-border bg-card/40"
      />
    </div>
  )
}

function SplitConsoleSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div
        data-testid="skeleton-split-rail"
        className="h-96 rounded-xl border border-border p-4"
      >
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-touch w-full" />
        <Skeleton className="mt-intra h-touch w-full" />
      </div>
      <div
        data-testid="skeleton-split-panel"
        className="h-96 rounded-xl border border-border p-6"
      >
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-intra h-touch w-full" />
      </div>
    </div>
  )
}

function FormRecordSkeleton() {
  return (
    <div className="grid max-w-2xl gap-section">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} data-testid="skeleton-form-field" className="grid gap-intra">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      <Skeleton data-testid="skeleton-form-action" className="h-10 w-32 rounded-md" />
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div data-testid="skeleton-default-body" className="grid gap-related">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-touch w-full" />
      ))}
    </div>
  )
}

export function OperatorRoutePending({
  preset,
}: { preset?: OperatorRouteSkeletonPreset } = {}) {
  const { pathname } = useLocation()
  const parentShell = useOperatorShellChrome()
  const resolvedPreset = preset ?? inferOperatorSkeletonPreset(pathname)

  const body = (
    <div
      className="grid gap-related"
      aria-busy="true"
      aria-label="Loading workspace"
      data-skeleton-preset={resolvedPreset}
    >
      {resolvedPreset === 'table' && <TableSkeleton />}
      {resolvedPreset === 'overview-cards' && <OverviewCardsSkeleton />}
      {resolvedPreset === 'split-console' && <SplitConsoleSkeleton />}
      {resolvedPreset === 'form-record' && <FormRecordSkeleton />}
      {resolvedPreset === 'default' && <DefaultSkeleton />}
    </div>
  )

  if (parentShell !== null) return body

  return (
    <AeOperatorPage
      operatorRole={operatorRoleForPath(pathname) ?? 'owner'}
      title="Loading workspace"
      description="Fetching the latest marketplace and account details."
      currentPath={pathname}
      pending
    >
      {body}
    </AeOperatorPage>
  )
}
