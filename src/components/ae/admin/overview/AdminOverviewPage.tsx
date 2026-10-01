import { ErrorBoundary } from '@sentry/react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminObjectSearchForm } from '../object-search/components/AdminObjectSearchForm'
import { useAdminObjectSearch } from '../object-search/useAdminObjectSearch'
import { AdminOverviewPageSkeleton } from './AdminOverviewPageSkeleton'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { OverviewExceptionsSection } from './components/OverviewExceptionsSection'
import { OverviewMarketplaceActivity } from '../metrics/MarketplaceActivity'
import { FounderDestinations } from './components/FounderDestinations'
import { RecentlyViewed } from './components/RecentlyViewed'
import { ADMIN_OVERVIEW_COPY } from './overview.contracts'
import { useAdminOverview, useOverviewExceptions } from './useAdminOverview'
import { PurchaseActivity, PurchaseActivityTable } from '../activity/PurchaseActivity'

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
        <div className="grid gap-section">
          <ConfigurationBanner readiness={data.paymentReadiness} compact />
          {data.attention !== undefined && (data.attention.purchases.length > 0 || !data.attention.complete) ? (
            <AeSection title="Purchases need attention" description="Delivery or payment is unconfirmed. Inspect the evidence before authorizing another attempt.">
              <PurchaseActivityTable rows={data.attention.purchases} />
              <div className="mt-related flex flex-wrap gap-related text-sm">
                <a className="underline underline-offset-4" href="/admin/exceptions?kind=uncertain_call">{data.attention.complete ? 'Open recovery queues' : 'More records may need review · open recovery queues'}</a>
                <a className="underline underline-offset-4" href="/admin/treasury">Review money exposure and purchase controls</a>
              </div>
            </AeSection>
          ) : null}
          <ErrorBoundary fallback={<AeSection title={ADMIN_OVERVIEW_COPY.metricsTitle}><p role="status">{ADMIN_OVERVIEW_COPY.metricsUnavailable}</p><Link to="/admin/metrics">Open Metrics</Link></AeSection>}>
            <OverviewMarketplaceActivity />
          </ErrorBoundary>
          <PurchaseActivity search={{ range: 'today' }} compact />
          <ErrorBoundary fallback={<AeSection title={ADMIN_OVERVIEW_COPY.exceptionsTitle}><p role="status">{ADMIN_OVERVIEW_COPY.exceptionsUnavailable}</p><Link to="/admin/exceptions">Open queues</Link></AeSection>}>
            <OverviewExceptionsContainer />
          </ErrorBoundary>
          <FounderDestinations />
          <details className="rounded-card border border-border p-related">
          <summary className="min-h-touch cursor-pointer text-sm font-medium">Find an exact record</summary>
          <AeSection title={ADMIN_OVERVIEW_COPY.searchTitle} description={ADMIN_OVERVIEW_COPY.searchDescription}>
            <AdminObjectSearchForm state={search.state} onSubmit={(input) => void search.submit(input)} />
          </AeSection>
          <RecentlyViewed rows={data.recent} />
          </details>
        </div>
      )}
    </AeOperatorPage>
  )
}

function OverviewExceptionsContainer() {
  const state = useOverviewExceptions()
  if (state.kind !== 'ready' || state.rows.length > 0 || state.unavailable) return <OverviewExceptionsSection state={state} />
  return <details className="rounded-card border border-border p-related"><summary className="min-h-touch cursor-pointer text-sm font-medium">Supply and policy reviews · no open cases observed</summary><OverviewExceptionsSection state={state} /></details>
}
