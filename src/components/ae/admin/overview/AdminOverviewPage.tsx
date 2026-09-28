import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminObjectSearchForm } from '../object-search/components/AdminObjectSearchForm'
import { useAdminObjectSearch } from '../object-search/useAdminObjectSearch'
import { AdminOverviewPageSkeleton } from './AdminOverviewPageSkeleton'
import { ConfigurationBanner } from './components/ConfigurationBanner'
import { HeadlineStrip } from './components/HeadlineStrip'
import { OldestExceptions } from './components/OldestExceptions'
import { RecentlyViewed } from './components/RecentlyViewed'
import { ADMIN_OVERVIEW_COPY, type AdminOverviewPageProps } from './overview.contracts'
import { useAdminOverview } from './useAdminOverview'

export function AdminOverviewPage({ formance }: AdminOverviewPageProps) {
  const data = useAdminOverview(formance)
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
          <ConfigurationBanner configuration={data.configuration} />
          <AeSection title={ADMIN_OVERVIEW_COPY.searchTitle} description={ADMIN_OVERVIEW_COPY.searchDescription}>
            <AdminObjectSearchForm state={search.state} onSubmit={(input) => void search.submit(input)} />
          </AeSection>
          <OldestExceptions rows={data.exceptions} unavailable={data.exceptionsUnavailable} />
          <HeadlineStrip headline={data.headline} />
          <RecentlyViewed rows={data.recent} />
        </div>
      )}
    </AeOperatorPage>
  )
}
