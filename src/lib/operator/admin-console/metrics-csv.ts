import { formatCsvRow } from '@/lib/export/csv-export'
import type { MarketplaceMetricDay } from './metrics.contracts'

const CSV_HEADERS = [
  'day', 'settledCallValueUnits', 'settledCallValueExponent',
  'settledCallValueCurrency', 'money', 'settledCalls', 'attemptedCalls',
  'completedCalls', 'uncertainCalls', 'quotesCreated',
  'quotesConvertedAtClose', 'transactingWorkspaces', 'transactingAgents',
  'transactingProviders', 'transactingTools', 'returningWorkspaces',
  'terminalCalls', 'terminalCallsWithResolution',
] as const
export const ADMIN_METRICS_CSV_HEADER = formatCsvRow(CSV_HEADERS)

export function metricsCsvRow(day: MarketplaceMetricDay): string {
  return formatCsvRow([
    day.day,
    day.settledCallValue?.units,
    day.settledCallValue?.exponent,
    day.settledCallValue?.currency,
    day.money,
    day.settledCalls,
    day.attemptedCalls,
    day.completedCalls,
    day.uncertainCalls,
    day.quotesCreated,
    day.quotesConvertedAtClose,
    day.transactingWorkspaces,
    day.transactingAgents,
    day.transactingProviders,
    day.transactingTools,
    day.returningWorkspaces,
    day.terminalCalls,
    day.terminalCallsWithResolution,
  ])
}
