import { z } from 'zod'

import type { MarketplaceMetricsRange } from '@/lib/operator/admin-console/metrics.contracts'
import { ADMIN_ACCESS_REFUSED_COPY } from '@/lib/operator/admin-console/contracts'

export const adminMetricsSearchSchema = z.strictObject({
  range: z.enum(['last_7', 'last_30', 'last_90']).optional(),
})
export type AdminMetricsSearch = z.infer<typeof adminMetricsSearchSchema>
export type AdminMetricCard = Readonly<{ label: string; value: string; delta: string }>
export type AdminMetricRatio = Readonly<{ label: string; value: string }>
export type AdminMetricDayRow = Readonly<{
  day: string
  settledCallValue: string
  money: string
  settledCalls: string
  attemptedCalls: string
  completedCalls: string
  uncertainCalls: string
  quotesCreated: string
  quotesConvertedAtClose: string
  transactingWorkspaces: string
  transactingAgents: string
  transactingProviders: string
  transactingTools: string
  returningWorkspaces: string
  terminalCalls: string
  terminalCallsWithResolution: string
}>
export type AdminMetricsDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | Readonly<{
      kind: 'ready'
      cards: readonly AdminMetricCard[]
      ratios: readonly AdminMetricRatio[]
      coverageComplete: boolean
      coverageDescription: string
      partialDays: readonly string[]
      days: readonly AdminMetricDayRow[]
    }>
export type AdminMetricsPageProps = Readonly<{
  range: MarketplaceMetricsRange
  rejected?: string
  onRangeChange: (range: MarketplaceMetricsRange) => void
}>

export const ADMIN_METRICS_RANGES: readonly Readonly<{
  value: MarketplaceMetricsRange
  label: string
}>[] = [
  { value: 'last_7', label: '7 days' },
  { value: 'last_30', label: '30 days' },
  { value: 'last_90', label: '90 days' },
]

export const ADMIN_METRICS_COPY = {
  title: 'Marketplace metrics',
  description: 'Observed marketplace activity, purchase quality and dated records.',
  adminBreadcrumb: 'Admin',
  rangeLabel: 'Reporting range',
  exportCsv: 'Export CSV',
  headlineTitle: 'Headline metrics',
  settledCallValue: 'Settled Call value',
  settledCalls: 'Settled Calls',
  successRate: 'Success rate',
  transactingWorkspaces: 'Transacting Workspaces',
  ratiosTitle: 'Purchase quality',
  quoteConversion: 'Quote conversion',
  returningWorkspaceRate: 'Returning activity share',
  resolutionCoverage: 'Purchase resolution coverage',
  dailyTitle: 'Daily metrics',
  noDays: 'No metrics days recorded yet.',
  noComparison: 'No prior comparison',
  noSettledUsage: 'No settled usage',
  notAvailable: 'Not available',
  settledOnly: 'Settled only',
  incompleteRange: (complete: number, requested: number) => `${complete} of ${requested} days have completed snapshots. Range totals are withheld.`,
  snapshotIncomplete: (day: string) => `Snapshot incomplete for ${day}`,
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: ADMIN_ACCESS_REFUSED_COPY,
  columns: {
    day: 'Day',
    settledValue: 'Settled value',
    money: 'Money basis',
    settledCalls: 'Settled Calls',
    attemptedCalls: 'Attempted Calls',
    completedCalls: 'Completed Calls',
    uncertainCalls: 'Uncertain Calls',
    quotesCreated: 'Quotes created',
    quotesConverted: 'Quotes converted',
    workspaces: 'Workspaces',
    agents: 'Agents',
    providers: 'Providers',
    tools: 'Tools',
    returningWorkspaces: 'Returning Workspaces',
    terminalCalls: 'Terminal Calls',
    resolvedCalls: 'Resolved Calls',
  },
} as const
