import { ErrorBoundary } from '@sentry/react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import { AdminObjectSearchForm } from '../object-search/components/AdminObjectSearchForm'
import { useAdminObjectSearch } from '../object-search/useAdminObjectSearch'
import { AdminOverviewPageSkeleton } from './AdminOverviewPageSkeleton'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { OverviewExceptionsSection } from './components/OverviewExceptionsSection'
import { OverviewMetricsSection } from './components/OverviewMetricsSection'
import { RecentlyViewed } from './components/RecentlyViewed'
import { AlphaLearning } from './AlphaLearning'
import { ADMIN_OVERVIEW_COPY } from './overview.contracts'
import { useAdminOverview, useOverviewExceptions, useOverviewMetrics } from './useAdminOverview'
import './OverviewComposition.css'

export function AdminOverviewPage() {
  const data = useAdminOverview()
  const search = useAdminObjectSearch()
  if (data.kind === 'loading') return <AdminOverviewPageSkeleton />
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_OVERVIEW_COPY.title}
      description={ADMIN_OVERVIEW_COPY.description}
      currentPath="/admin"
      breadcrumbs={[{ label: ADMIN_OVERVIEW_COPY.adminBreadcrumb }]}
      stickyHeader
    >
      {data.kind === 'refused' ? (
        <AePageState
          title={ADMIN_OVERVIEW_COPY.accessDeniedTitle}
          description={ADMIN_OVERVIEW_COPY.accessDeniedDescription}
          tone="danger"
        />
      ) : (
        <div className="arc-market arc-admin-overview">
          <ConfigurationBanner readiness={data.paymentReadiness} />
          <AeSection className="arc-admin-overview-search" title={ADMIN_OVERVIEW_COPY.searchTitle} description={ADMIN_OVERVIEW_COPY.searchDescription}>
            <AdminObjectSearchForm state={search.state} onSubmit={(input) => void search.submit(input)} />
          </AeSection>
          <div className="arc-admin-overview-region">
            <ErrorBoundary fallback={(
              <AeSection className="arc-admin-overview-feedback" title={ADMIN_OVERVIEW_COPY.exceptionsTitle}>
                <p role="status">{ADMIN_OVERVIEW_COPY.exceptionsUnavailable}</p>
                <Link to="/admin/exceptions" className={`arc-market ${arcButtonStyles.button} ${arcButtonStyles.secondary} ${arcButtonStyles.md}`}>Open queues</Link>
              </AeSection>
            )}>
              <OverviewExceptionsContainer />
            </ErrorBoundary>
          </div>
          <div className="arc-admin-overview-region">
            <ErrorBoundary fallback={(
              <AeSection className="arc-admin-overview-feedback" title={ADMIN_OVERVIEW_COPY.metricsTitle}>
                <p role="status">{ADMIN_OVERVIEW_COPY.metricsUnavailable}</p>
                <Link to="/admin/metrics" className={`arc-market ${arcButtonStyles.button} ${arcButtonStyles.secondary} ${arcButtonStyles.md}`}>Open Metrics</Link>
              </AeSection>
            )}>
              <OverviewMetricsContainer />
            </ErrorBoundary>
          </div>
          <RecentlyViewed rows={data.recent} />
          <AlphaLearning />
        </div>
      )}
    </AeOperatorPage>
  )
}

function OverviewExceptionsContainer() {
  const state = useOverviewExceptions()
  return <OverviewExceptionsSection state={state} />
}

function OverviewMetricsContainer() {
  const state = useOverviewMetrics()
  return <OverviewMetricsSection state={state} />
}
