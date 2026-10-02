import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AdminMetricsPageSkeleton } from './AdminMetricsPageSkeleton'
import { MetricsControls } from './components/MetricsControls'
import { MetricsDayTable } from './components/MetricsDayTable'
import { MetricsDashboard } from './MetricsDashboard'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { ADMIN_METRICS_COPY, type AdminMetricsPageProps } from './metrics.contracts'
import { useAdminMetrics } from './useAdminMetrics'

export function AdminMetricsPage({ range, rejected, onRangeChange }: AdminMetricsPageProps) {
  const data = useAdminMetrics(range)
  if (data.kind === 'loading') return <AdminMetricsPageSkeleton />
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_METRICS_COPY.title}
      description={ADMIN_METRICS_COPY.description}
      currentPath="/admin/metrics"
      breadcrumbs={[
        { label: ADMIN_METRICS_COPY.adminBreadcrumb, href: '/admin' },
        { label: ADMIN_METRICS_COPY.title },
      ]}
      stickyHeader
    >
      <AdminSearchNotice rejected={rejected} />
      {data.kind === 'refused' ? (
        <AePageState
          title={ADMIN_METRICS_COPY.accessDeniedTitle}
          description={ADMIN_METRICS_COPY.accessDeniedDescription}
          tone="danger"
        />
      ) : (
        <div className="grid gap-section">
          {data.partialDays.map((day) => (
            <p key={day} role="status" className="text-sm text-muted-foreground">{ADMIN_METRICS_COPY.snapshotIncomplete(day)}</p>
          ))}
          {data.coverageComplete ? (
            <MetricsDashboard
              cards={data.cards}
              ratios={data.ratios}
              dailyCalls={data.dailyCalls}
              controls={<MetricsControls range={range} onRangeChange={onRangeChange} />}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-related">
              <p role="status" className="text-sm text-muted-foreground">{data.coverageDescription}</p>
              <MetricsControls range={range} onRangeChange={onRangeChange} />
            </div>
          )}
          <MetricsDayTable rows={data.days} />
        </div>
      )}
    </AeOperatorPage>
  )
}
