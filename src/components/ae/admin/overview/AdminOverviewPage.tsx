import { ErrorBoundary } from '@sentry/react'
import { Link } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AlphaLearning } from './AlphaLearning'
import { Button } from '@/components/arc/button/button'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import { Accordion } from '@/components/arc/accordion/accordion'
import { AdminObjectSearchForm } from '../object-search/components/AdminObjectSearchForm'
import { useAdminObjectSearch } from '../object-search/useAdminObjectSearch'
import { OverviewMarketplaceActivity } from '../metrics/MarketplaceActivity'
import { PurchaseActivity, PurchaseActivityTable } from '../activity/PurchaseActivity'
import { AdminOverviewPageSkeleton } from './AdminOverviewPageSkeleton'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { OverviewExceptionsSection } from './components/OverviewExceptionsSection'
import { FounderDestinations } from './components/FounderDestinations'
import { RecentlyViewed } from './components/RecentlyViewed'
import { ADMIN_OVERVIEW_COPY, type AdminOverviewDataState } from './overview.contracts'
import { useAdminOverview, useOverviewExceptions } from './useAdminOverview'

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
        <AePageState title={ADMIN_OVERVIEW_COPY.accessDeniedTitle} description={ADMIN_OVERVIEW_COPY.accessDeniedDescription} tone="danger" />
      ) : (
        <div className="grid min-w-0 gap-section pb-page">
          <ConfigurationBanner readiness={data.paymentReadiness} compact />
          <PurchasesNeedingAttention attention={data.attention} />
          <div className="grid min-w-0 items-start gap-section xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ErrorBoundary fallback={
              <AeSection title="Marketplace activity">
                <p role="status">{ADMIN_OVERVIEW_COPY.metricsUnavailable}</p>
                <Link to="/admin/metrics" className={`arc-market ${arcButtonStyles.button} ${arcButtonStyles.secondary} ${arcButtonStyles.md}`}>Open Metrics</Link>
              </AeSection>
            }>
              <OverviewMarketplaceActivity />
            </ErrorBoundary>
            <FounderDestinations />
          </div>
          <PurchaseActivity search={{ range: 'today' }} compact />
          <ErrorBoundary fallback={
            <AeSection title={ADMIN_OVERVIEW_COPY.exceptionsTitle}>
              <p role="status">{ADMIN_OVERVIEW_COPY.exceptionsUnavailable}</p>
              <Link to="/admin/exceptions" className={`arc-market ${arcButtonStyles.button} ${arcButtonStyles.secondary} ${arcButtonStyles.md}`}>Open queues</Link>
            </AeSection>
          }>
            <OverviewExceptionsContainer />
          </ErrorBoundary>
          <ErrorBoundary fallback={({ resetError }) => (
            <AeSection title="Alpha learning">
              <p role="status">Learning signals are unavailable.</p>
              <Button type="button" variant="secondary" onClick={resetError}>Retry learning signals</Button>
            </AeSection>
          )}>
            <AlphaLearning />
          </ErrorBoundary>
          <div className="ae-arc min-w-0">
            <Accordion defaultOpen={-1} items={[
              { title: 'Find an exact record', content: (
                <div className="grid gap-related">
                  <p className="text-sm text-muted-foreground">{ADMIN_OVERVIEW_COPY.searchDescription}</p>
                  <AdminObjectSearchForm state={search.state} onSubmit={input => void search.submit(input)} />
                </div>
              ) },
              { title: 'Recently viewed records', content: <RecentlyViewed rows={data.recent} /> },
            ]} />
          </div>
        </div>
      )}
    </AeOperatorPage>
  )
}

function PurchasesNeedingAttention({ attention }: Readonly<{
  attention: Extract<AdminOverviewDataState, { kind: 'ready' }>['attention']
}>) {
  if (attention === undefined || (attention.complete && attention.purchases.length === 0)) return null
  return (
    <AeSection title="Purchases need attention" description="Delivery or payment is unconfirmed. Inspect the evidence before authorizing another attempt.">
      <PurchaseActivityTable rows={attention.purchases} />
      <div className="mt-related flex flex-wrap gap-related text-sm">
        <a className="underline underline-offset-4" href="/admin/exceptions?kind=uncertain_call">
          {attention.complete ? 'Open recovery queues' : 'More records may need review · open recovery queues'}
        </a>
        <a className="underline underline-offset-4" href="/admin/treasury">Review money exposure and purchase controls</a>
      </div>
    </AeSection>
  )
}

function OverviewExceptionsContainer() {
  const state = useOverviewExceptions()
  if (state.kind !== 'ready' || state.rows.length > 0 || state.unavailable) {
    return <OverviewExceptionsSection state={state} />
  }
  return (
    <details className="rounded-card border border-border p-related">
      <summary className="min-h-touch cursor-pointer text-sm font-medium">Supply and policy reviews · no open cases observed</summary>
      <OverviewExceptionsSection state={state} />
    </details>
  )
}
