import type { DashboardMetric } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import type { MarketplaceMetricsRange, MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { adminActivityHref } from '@/lib/operator/admin-console/activity'
import { formatCurrencyAmount } from '@/modules/money/public'

const chartMoney = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 })

/** Complete snapshots only. Missing observations remain gaps; range totals require complete coverage. */
export function marketplaceDashboardMetrics(report: MarketplaceMetricsReport | undefined, range: MarketplaceMetricsRange = 'last_7'): readonly [DashboardMetric, ...DashboardMetric[]] {
  const days = (report?.days ?? []).filter((day) => day.complete).toSorted((a, b) => a.day.localeCompare(b.day))
  const first = days[0]?.day
  const last = days.at(-1)?.day
  const dates: string[] = []
  if (first !== undefined && last !== undefined) {
    for (let cursor = Date.parse(`${first}T00:00:00Z`); cursor <= Date.parse(`${last}T00:00:00Z`); cursor += 86_400_000) {
      dates.push(new Date(cursor).toISOString().slice(0, 10))
    }
  }
  const byDate = new Map(days.map((day) => [day.day, day]))
  const complete = report !== undefined && report.coverageComplete && report.headline !== null
  const total = (field: 'completedCalls' | 'quotesCreated') => complete
    ? days.reduce((sum, day) => sum + day[field], 0) : null
  const points = (field: 'completedCalls' | 'settledCalls' | 'transactingWorkspaces' | 'quotesCreated') => dates.map((date) => ({
    date, value: byDate.get(date)?.[field] ?? null,
  }))
  const funding = complete ? report.funding : null
  const fundingPoints = (field: 'buyingAccounts' | 'completedCustomerFundedCalls' | 'purchasedUnits') => dates.map(date => {
    const observed = byDate.get(date)?.funding
    return { date, value: observed === undefined ? null : field === 'purchasedUnits' ? Number(observed.purchasedUnits) / 1_000_000 : observed[field] }
  })
  const purchases = adminActivityHref({ range, funding: 'customer', status: 'completed' })
  return [
    { key: 'customers', label: 'Buying Accounts', value: funding?.accountCoverageComplete ? funding.buyingAccounts : null,
      description: 'Distinct Accounts with delivered, customer-funded purchases', points: fundingPoints('buyingAccounts'), detailHref: purchases },
    { key: 'completed', label: 'Delivered purchases', value: funding?.completedCustomerFundedCalls ?? null,
      description: 'Completed Calls using purchased credit', points: fundingPoints('completedCustomerFundedCalls'), detailHref: purchases },
    { key: 'settled', label: 'Purchased credit spent', value: funding == null ? null : Number(funding.purchasedUnits) / 1_000_000,
      ...(funding == null ? {} : { displayValue: formatCurrencyAmount({ currency: 'AUD', exponent: 6, units: funding.purchasedUnits }) }),
      formatPoint: value => chartMoney.format(value), description: 'Settled spend · promotional credit excluded', points: fundingPoints('purchasedUnits'),
      detailHref: adminActivityHref({ range, funding: 'customer' }) },
    { key: 'quotes', label: 'Quotes created', value: total('quotesCreated'),
      description: 'Priced opportunities · not a count of customers', points: points('quotesCreated') },
  ]
}
