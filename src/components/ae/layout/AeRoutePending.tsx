import { useLocation } from '@tanstack/react-router'

import { AeOperatorPage, useOperatorShellChrome } from '@/components/ae/layout/AeOperatorPage'
import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import { operatorRoleForPath } from '@/lib/operator/roles'

import type { OperatorRouteSkeletonPreset } from './route-states.contracts'
import './RouteLoadingComposition.css'

export function RoutePending({
  title = 'Loading page',
  description = 'Loading the latest available information.',
}: { title?: string; description?: string } = {}) {
  return <AePageSkeleton title={title} description={description} />
}

export function inferOperatorSkeletonPreset(pathname: string): OperatorRouteSkeletonPreset {
  if (pathname === '/owner/workspace') return 'overview-cards'

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
      <span className="arc-loading-line arc-loading-heading" />
      <span className="arc-loading-line arc-loading-field" />
      <div
        data-testid="skeleton-table"
        className="arc-loading-table"
      >
        <div className="arc-loading-table-row">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={`header-${index}`} className="arc-loading-line" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, rowIndex) => (
          <div
            key={rowIndex}
            data-testid="skeleton-table-row"
            className="arc-loading-table-row"
          >
            {Array.from({ length: 4 }, (_, colIndex) => (
              <span
                key={`${rowIndex}-${colIndex}`}
                className="arc-loading-line arc-loading-field"
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
    <div className="arc-loading-stack" aria-hidden="true">
      <div className="arc-loading-intro">
        <span className="arc-loading-line arc-loading-heading" />
        <span className="arc-loading-line" />
      </div>
      <div className="arc-loading-metrics">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            data-testid="skeleton-metric-card"
            className="arc-loading-metric"
          >
            <span className="arc-loading-line arc-loading-label" />
            <span className="arc-loading-line arc-loading-value" />
          </div>
        ))}
      </div>
      <div
        data-testid="skeleton-overview-primary"
        className="arc-loading-well"
      />
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
        <span className="arc-loading-line arc-loading-label" />
        <span className="arc-loading-line arc-loading-field" />
        <span className="arc-loading-line arc-loading-field" />
      </div>
      <div
        data-testid="skeleton-split-panel"
        className="arc-loading-pane"
      >
        <span className="arc-loading-line arc-loading-heading" />
        <div className="arc-loading-well" />
        <span className="arc-loading-line arc-loading-field" />
      </div>
    </div>
  )
}

function FormRecordSkeleton() {
  return (
    <div className="arc-loading-form" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} data-testid="skeleton-form-field" className="arc-loading-intro">
          <span className="arc-loading-line arc-loading-label" />
          <span className="arc-loading-line arc-loading-field" />
        </div>
      ))}
      <span data-testid="skeleton-form-action" className="arc-loading-line arc-loading-action" />
    </div>
  )
}

function DefaultSkeleton() {
  return (
    <div data-testid="skeleton-default-body" className="arc-loading-rows" aria-hidden="true">
      <div className="arc-loading-record"><span className="arc-loading-line arc-loading-heading" /></div>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="arc-loading-record"><span className="arc-loading-line arc-loading-label" /><span className="arc-loading-line" /></div>
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
      className="arc-market arc-route-loading"
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
