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
import { formatCurrencyAmount } from '@/modules/money/public'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { adminActivityHref } from '@/lib/operator/admin-console/activity'

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
      metrics={marketplaceDashboardMetrics(report, range)} range={range} onRangeChange={onRangeChange}
      description={`${report.environment === 'production' ? 'Production' : report.environment === 'sandbox' ? 'Sandbox' : 'Environment not verified'} · ${report.latestDay === null ? 'Waiting for verified daily snapshots' : `Through ${report.latestDay} · Completed Perth days`}`}
      {...(report.coverageComplete ? {} : { notice: ADMIN_METRICS_COPY.incompleteRange(report.days.filter((day) => day.complete).length, requested) })}
      exportHref={`/api/admin/metrics-export?range=${range}`}
    />
    <p className="mt-related text-xs text-muted-foreground">Snapshots group purchases by initiation day. Later refunds and delivery changes are reconciled nightly; purchase records show current status.
      {report.days.length > 0 ? ` Latest snapshot computed ${formatPerthTimestamp(Math.max(...report.days.map(day => day.computedAt)))}.` : ''}
      {' '}Purchased-credit activity can include internal production use; it is not verified external Customer traction or revenue.</p>
    {report.coverageComplete && report.funding != null ? <div className="mt-related grid gap-related rounded-card border border-border bg-card p-related text-sm sm:grid-cols-3">
      <div><p className="text-muted-foreground">Repeat buying Accounts</p><p className="mt-1 font-semibold tabular-nums">{report.funding.accountCoverageComplete ? report.funding.repeatBuyingAccounts : 'Unavailable'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Two or more delivered, customer-funded purchases in this period.</p></div>
      <div><p className="text-muted-foreground">Promotional credit used</p><p className="mt-1 font-semibold tabular-nums">{formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: report.funding.promotionalUnits })}</p>
        <a className="mt-1 inline-block text-xs underline underline-offset-4" href={adminActivityHref({ range, funding: 'promotional' })}>Inspect promotional activity</a></div>
      <div><p className="text-muted-foreground">Refunded purchased credit</p><p className="mt-1 font-semibold tabular-nums">{formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: report.funding.refundedPurchasedUnits })}</p>
        <a className="mt-1 inline-block text-xs underline underline-offset-4" href={adminActivityHref({ range, status: 'refunded' })}>Inspect refunded purchases</a></div>
      {report.funding.unclassifiedCalls > 0 ? <p className="text-xs text-warning sm:col-span-3">{report.funding.unclassifiedCalls} Calls have unclassified funding and are excluded from customer-funded measures. <a className="underline underline-offset-4" href={adminActivityHref({ range, funding: 'unclassified' })}>Review their evidence</a></p> : null}
    </div> : null}
  </div>
}

export function OverviewMarketplaceActivity() {
  const [range, setRange] = useState<MarketplaceMetricsRange>('last_7')
  return <MarketplaceActivity range={range} onRangeChange={setRange} />
}
