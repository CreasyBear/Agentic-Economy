import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { MetricsDashboard } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import '@/components/arc/foundation.css'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketplaceMetricsRange, MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { ADMIN_METRICS_COPY } from './metrics.contracts'
import { marketplaceDashboardMetrics } from './marketplace-dashboard'

export function MarketplaceActivity({ range, onRangeChange }: Readonly<{
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>) {
  const report = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range })
  if (report === undefined) return <div aria-label="Loading marketplace activity" role="status" className="grid gap-related"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
  if ('kind' in report) return <AePageState title="Admin access required" description={ADMIN_METRICS_COPY.accessDeniedDescription} tone="danger" />
  return <MarketplaceActivityView report={report} range={range} onRangeChange={onRangeChange} />
}

export function MarketplaceActivityView({ report, range, onRangeChange }: Readonly<{
  report: MarketplaceMetricsReport
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>) {
  const requested = range === 'last_7' ? 7 : range === 'last_30' ? 30 : 90
  return <div className="ae-arc">
    <MetricsDashboard
      metrics={marketplaceDashboardMetrics(report)} range={range} onRangeChange={onRangeChange}
      description={report.latestDay === null ? 'Waiting for the first completed daily snapshot' : `Through ${report.latestDay} · Completed days in Australia/Perth`}
      {...(report.coverageComplete ? {} : { notice: ADMIN_METRICS_COPY.incompleteRange(report.days.filter((day) => day.complete).length, requested) })}
      exportHref={`/api/admin/metrics-export?range=${range}`}
    />
  </div>
}

export function OverviewMarketplaceActivity() {
  const [range, setRange] = useState<MarketplaceMetricsRange>('last_7')
  return <MarketplaceActivity range={range} onRangeChange={setRange} />
}
