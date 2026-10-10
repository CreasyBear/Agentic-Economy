import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { MetricsDashboard } from '@/components/ae/shared/arc-pro/marketplace-dashboard/metrics-dashboard'
import { ExpandableCard } from '@/components/arc/expandable-card/expandable-card'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { AePageState } from '@/components/ae/layout/AePageState'
import type { MarketplaceMetricsRange, MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { formatCurrencyAmount } from '@/modules/money/public'
import { formatTimestamp } from '@/lib/ui/format-time'
import { adminActivityHref } from '@/lib/operator/admin-console/activity'
import { ADMIN_METRICS_COPY } from './metrics.contracts'
import { MarketplaceSignalCharts } from './components/MarketplaceSignalCharts'
import { marketplaceDashboardMetrics } from './marketplace-dashboard'

type MarketplaceActivityProps = Readonly<{
  range: MarketplaceMetricsRange
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>

export function MarketplaceActivity({ range, onRangeChange }: MarketplaceActivityProps) {
  const report = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range })
  if (report !== undefined && 'kind' in report) {
    return <AePageState title="Admin access required" description={ADMIN_METRICS_COPY.accessDeniedDescription} tone="danger" />
  }
  return <MarketplaceActivityView report={report} range={range} onRangeChange={onRangeChange} />
}

export function MarketplaceActivityView({ report, range, onRangeChange }: MarketplaceActivityProps & Readonly<{ report: MarketplaceMetricsReport | undefined }>) {
  const requestedDays = { last_7: 7, last_30: 30, last_90: 90 }[range]
  const environment = report?.environment === 'production' ? 'Production' : report?.environment === 'sandbox' ? 'Sandbox' : 'Environment not verified'
  const period = report?.latestDay == null ? 'Waiting for verified daily snapshots' : `Through ${report.latestDay} · Completed Perth days`
  const latestComputedAt = report !== undefined && report.days.length > 0 ? Math.max(...report.days.map(day => day.computedAt)) : null

  return (
    <div className="ae-arc arc-market grid min-w-0 gap-related">
      <MetricsDashboard
        metrics={marketplaceDashboardMetrics(report, range)}
        range={range}
        onRangeChange={onRangeChange}
        loading={report === undefined}
        description={report === undefined ? 'Loading the selected reporting period…' : `${environment} · ${period}`}
        {...(report === undefined || report.coverageComplete ? {} : { notice: ADMIN_METRICS_COPY.incompleteRange(report.days.filter(day => day.complete).length, requestedDays) })}
        exportHref={`/api/admin/metrics-export?range=${range}`}
      />
      {report !== undefined ? <p className="text-xs text-muted-foreground">
        Purchased-credit activity can include internal use. It is not verified external Customer traction or revenue.
        {latestComputedAt === null ? '' : ` Updated ${formatTimestamp(latestComputedAt, 'Australia/Perth')}.`}
      </p> : null}
      {report?.coverageComplete && report.funding != null ? <FundingSummary funding={report.funding} range={range} /> : null}
      <MarketplaceSignalCharts report={report} />
      <ExpandableCard title="How to read these numbers" description="The story behind the signal">
        <p>Snapshots group purchases by initiation day. Later refunds and delivery changes are reconciled nightly; purchase records show current status. Repeat buying means two or more delivered, customer-funded purchases by the same Account during this period.</p>
      </ExpandableCard>
    </div>
  )
}

function FundingSummary({ funding, range }: Readonly<{
  funding: NonNullable<MarketplaceMetricsReport['funding']>
  range: MarketplaceMetricsRange
}>) {
  const measures = [
    { label: 'Repeat buying Accounts', value: funding.accountCoverageComplete ? String(funding.repeatBuyingAccounts) : 'Unavailable',
      href: adminActivityHref({ range, funding: 'customer', status: 'completed' }), action: 'Inspect funded purchases' },
    { label: 'Promotional credit used', value: formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: funding.promotionalUnits }),
      href: adminActivityHref({ range, funding: 'promotional' }), action: 'Inspect promotional activity' },
    { label: 'Refunded purchased credit', value: formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: funding.refundedPurchasedUnits }),
      href: adminActivityHref({ range, status: 'refunded' }), action: 'Inspect refunded purchases' },
  ]
  return (
    <div className="grid gap-related">
      <dl className="grid divide-y divide-border rounded-lg border border-border bg-card text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {measures.map(measure => (
          <div className="min-w-0 p-related" key={measure.label}>
            <dt className="text-muted-foreground">{measure.label}</dt>
            <dd className="mt-intra text-lg font-medium tabular-nums">{measure.value}</dd>
            <dd className="mt-intra text-xs"><a className="inline-flex min-h-touch items-center underline underline-offset-4" href={measure.href}>{measure.action}</a></dd>
          </div>
        ))}
      </dl>
      {funding.unclassifiedCalls > 0 ? (
        <Alert tone="warning" title="Funding needs classification">
          {funding.unclassifiedCalls} Calls are excluded from customer-funded measures.{' '}
          <a className="underline underline-offset-4" href={adminActivityHref({ range, funding: 'unclassified' })}>Review their evidence</a>
        </Alert>
      ) : null}
    </div>
  )
}

export function OverviewMarketplaceActivity() {
  const [range, setRange] = useState<MarketplaceMetricsRange>('last_7')
  return <MarketplaceActivity range={range} onRangeChange={setRange} />
}
