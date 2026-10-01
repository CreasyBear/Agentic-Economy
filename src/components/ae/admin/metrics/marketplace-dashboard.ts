import type { DashboardMetric } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import type { MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'

/** Complete snapshots only. Missing observations remain gaps; range totals require complete coverage. */
export function marketplaceDashboardMetrics(report: MarketplaceMetricsReport): readonly [DashboardMetric, ...DashboardMetric[]] {
  const days = report.days.filter((day) => day.complete).toSorted((a, b) => a.day.localeCompare(b.day))
  const first = days[0]?.day
  const last = days.at(-1)?.day
  const dates: string[] = []
  if (first !== undefined && last !== undefined) {
    for (let cursor = Date.parse(`${first}T00:00:00Z`); cursor <= Date.parse(`${last}T00:00:00Z`); cursor += 86_400_000) {
      dates.push(new Date(cursor).toISOString().slice(0, 10))
    }
  }
  const byDate = new Map(days.map((day) => [day.day, day]))
  const complete = report.coverageComplete && report.headline !== null
  const total = (field: 'completedCalls' | 'quotesCreated') => complete
    ? days.reduce((sum, day) => sum + day[field], 0) : null
  const points = (field: 'completedCalls' | 'settledCalls' | 'transactingWorkspaces' | 'quotesCreated') => dates.map((date) => ({
    date, value: byDate.get(date)?.[field] ?? null,
  }))
  return [
    { key: 'customers', label: 'Transacting Accounts', value: complete ? report.headline?.transactingWorkspaces ?? null : null,
      description: 'Distinct Accounts in the selected period', points: points('transactingWorkspaces') },
    { key: 'completed', label: 'Completed Calls', value: total('completedCalls'),
      description: 'Delivery completed; payment tracked separately', points: points('completedCalls') },
    { key: 'settled', label: 'Settled Calls', value: complete ? report.headline?.settledCalls ?? null : null,
      description: 'Recorded settlements, including promotional usage', points: points('settledCalls') },
    { key: 'quotes', label: 'Quotes created', value: total('quotesCreated'),
      description: 'Priced purchase opportunities', points: points('quotesCreated') },
  ]
}
