import { useLocation } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { useOperatorShellChrome } from './OperatorChromeContext'
import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { operatorRoleForPath } from '@/lib/operator/roles'
import { appDestination, resolveAppDestination } from '@/lib/navigation/app-navigation'
import { ADMIN_NAVIGATION } from './app-shell/app-shell.contracts'

import type { OperatorRouteSkeletonPreset } from './route-states.contracts'
import './RouteLoadingComposition.css'

export function RoutePending({
  title = 'Loading page',
  description = 'Loading the latest available information.',
}: { title?: string; description?: string } = {}) {
  return <AePageSkeleton title={title} description={description} />
}

export function inferOperatorSkeletonPreset(pathname: string): OperatorRouteSkeletonPreset {
  if (pathname === '/owner/settings/workspace') return 'overview-cards'

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
    <div className="arc-loading-stack" aria-hidden="true">
      <Skeleton lines={1} className="arc-loading-heading" />
      <Skeleton lines={1} className="arc-loading-field" />
      <div
        data-testid="skeleton-table"
        className="arc-loading-table"
      >
        <div className="arc-loading-table-row">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={`header-${index}`} lines={1} />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, rowIndex) => (
          <div
            key={rowIndex}
            data-testid="skeleton-table-row"
            className="arc-loading-table-row"
          >
            {Array.from({ length: 4 }, (_, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                data-testid="skeleton-table-cell"
              >
                <Skeleton lines={1} className="arc-loading-field" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function OverviewCardsSkeleton() {
  return (
    <div className="arc-loading-stack" aria-hidden="true">
      <div className="arc-loading-intro">
        <Skeleton lines={2} />
      </div>
      <div className="arc-loading-metrics">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            data-testid="skeleton-metric-card"
            className="arc-loading-metric"
          >
            <Skeleton lines={2} />
          </div>
        ))}
      </div>
      <div
        data-testid="skeleton-overview-primary"
        className="arc-loading-well"
      ><Skeleton lines={6} /></div>
    </div>
  )
}

function SplitConsoleSkeleton() {
  return (
    <div className="arc-loading-split" aria-hidden="true">
      <div
        data-testid="skeleton-split-rail"
        className="arc-loading-pane"
      >
        <Skeleton lines={3} />
      </div>
      <div
        data-testid="skeleton-split-panel"
        className="arc-loading-pane"
      >
        <Skeleton lines={1} className="arc-loading-heading" />
        <div className="arc-loading-well"><Skeleton lines={6} /></div>
        <Skeleton lines={1} className="arc-loading-field" />
      </div>
    </div>
  )
}

function FormRecordSkeleton() {
  return (
    <div className="arc-loading-form" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} data-testid="skeleton-form-field" className="arc-loading-intro">
          <Skeleton lines={2} />
        </div>
      ))}
      <div data-testid="skeleton-form-action" className="arc-loading-action">
        <Skeleton lines={1} />
      </div>
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div data-testid="skeleton-default-body" className="arc-loading-rows" aria-hidden="true">
      <div className="arc-loading-record"><Skeleton lines={1} className="arc-loading-heading" /></div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="arc-loading-record"><Skeleton lines={2} /></div>
      ))}
    </div>
  )
}

function destinationTitle(pathname: string): string {
  const admin = [...ADMIN_NAVIGATION].sort((left, right) => right.href.length - left.href.length)
    .find(item => item.href === pathname || pathname.startsWith(`${item.href}/`))
  if (admin !== undefined) return admin.label
  const destination = resolveAppDestination(pathname)
  return destination === null ? 'Workspace' : appDestination(destination).label
}

export function OperatorRoutePending({
  preset,
}: { preset?: OperatorRouteSkeletonPreset } = {}) {
  const { pathname } = useLocation()
  const parentShell = useOperatorShellChrome()
  const resolvedPreset = preset ?? inferOperatorSkeletonPreset(pathname)

  const body = (
    <div
      className="arc-market arc-route-loading"
      role="status"
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
      title={destinationTitle(pathname)}
      description="Fetching the latest marketplace and account details."
      currentPath={pathname}
      pending
    >
      {body}
    </AeOperatorPage>
  )
}
