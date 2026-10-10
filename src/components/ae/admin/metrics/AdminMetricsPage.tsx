import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Skeleton } from '@/components/ui/skeleton'
import { MarketplaceActivityView } from './MarketplaceActivity'
import { MetricsDayTable } from './components/MetricsDayTable'
import { MetricsDashboard } from '@/components/ae/shared/arc-pro/metrics-dashboard/metrics-dashboard'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { ADMIN_METRICS_COPY, type AdminMetricsPageProps } from './metrics.contracts'
import { useAdminMetrics } from './useAdminMetrics'

export function AdminMetricsPage({ range, rejected, onRangeChange }: AdminMetricsPageProps) {
  const data = useAdminMetrics(range)
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
          <MarketplaceActivityView report={data.kind === 'ready' ? data.report : undefined} range={range} onRangeChange={onRangeChange} />
          {data.kind === 'loading' ? <Skeleton className="h-80 rounded-lg" /> : (
            <>
              {data.partialDays.map((day) => (
                <p key={day} role="status" className="text-sm text-muted-foreground">{ADMIN_METRICS_COPY.snapshotIncomplete(day)}</p>
              ))}
              <details className="rounded-lg border border-border p-related">
                <summary className="min-h-touch cursor-pointer text-sm font-medium">Operational Call metrics</summary>
                <MetricsDashboard cards={data.cards} ratios={data.ratios} dailyCalls={data.dailyCalls}
                  controls={null}
                  {...(data.coverageComplete ? {} : { coverageDescription: data.coverageDescription, withheldMetricLabels: [ADMIN_METRICS_COPY.settledCallValue, ADMIN_METRICS_COPY.successRate] })} />
              </details>
              <MetricsDayTable rows={data.days} />
            </>
          )}
        </div>
      )}
    </AeOperatorPage>
  )
}
