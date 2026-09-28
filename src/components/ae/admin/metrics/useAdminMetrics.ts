import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import type {
  MarketplaceMetricDay,
  MarketplaceMetricsRange,
  MarketplaceMetricsReport,
} from '@/lib/operator/admin-console/metrics.contracts'
import { formatCount, formatPercent } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  ADMIN_METRICS_COPY,
  type AdminMetricDayRow,
  type AdminMetricsDataState,
} from './metrics.contracts'

const signedPercentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'always',
})

export function useAdminMetrics(range: MarketplaceMetricsRange): AdminMetricsDataState {
  const report = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range })
  if (report === undefined) return { kind: 'loading' }
  if ('kind' in report) return { kind: 'refused' }
  const requestedDays = range === 'last_7' ? 7 : range === 'last_30' ? 30 : 90
  if (report.headline === null || report.ratios === null || report.wow === null) return {
    kind: 'ready',
    coverageComplete: false,
    coverageDescription: ADMIN_METRICS_COPY.incompleteRange(report.days.length, requestedDays),
    cards: [],
    ratios: [],
    days: report.days.map(toDayRow),
    partialDays: report.partialDays,
  }
  return {
    kind: 'ready',
    coverageComplete: report.coverageComplete,
    coverageDescription: ADMIN_METRICS_COPY.incompleteRange(report.days.length, requestedDays),
    cards: [
      {
        label: ADMIN_METRICS_COPY.settledCallValue,
        value: moneyLabel(report.headline.money, report.headline.settledCallValue),
        delta: ADMIN_METRICS_COPY.noComparison,
      },
      {
        label: ADMIN_METRICS_COPY.settledCalls,
        value: formatCount(report.headline.settledCalls),
        delta: deltaLabel(report.wow.settledCalls),
      },
      {
        label: ADMIN_METRICS_COPY.successRate,
        value: ratioLabel(report.headline.successRate),
        delta: ADMIN_METRICS_COPY.noComparison,
      },
      {
        label: ADMIN_METRICS_COPY.transactingWorkspaces,
        value: formatCount(report.headline.transactingWorkspaces),
        delta: deltaLabel(report.wow.transactingWorkspaces),
      },
    ],
    ratios: [
      { label: ADMIN_METRICS_COPY.successRate, value: ratioLabel(report.ratios.successRate) },
      { label: ADMIN_METRICS_COPY.quoteConversion, value: ratioLabel(report.ratios.quoteConversion) },
      { label: ADMIN_METRICS_COPY.returningWorkspaceRate, value: ratioLabel(report.ratios.returningWorkspaceRate) },
      { label: ADMIN_METRICS_COPY.resolutionCoverage, value: ratioLabel(report.ratios.resolutionCoverage) },
    ],
    days: report.days.map(toDayRow),
    partialDays: report.partialDays,
  }
}

function moneyLabel(
  money: NonNullable<MarketplaceMetricsReport['headline']>['money'],
  amount: NonNullable<MarketplaceMetricsReport['headline']>['settledCallValue'],
): string {
  return money === 'no_settled_usage' || amount === null
    ? ADMIN_METRICS_COPY.noSettledUsage
    : formatCurrencyAmount(amount)
}

function ratioLabel(value: number | null): string {
  return value === null ? ADMIN_METRICS_COPY.notAvailable : formatPercent(value)
}

function deltaLabel(value: number | null): string {
  return value === null ? ADMIN_METRICS_COPY.noComparison : signedPercentFormatter.format(value)
}

function toDayRow(day: MarketplaceMetricDay): AdminMetricDayRow {
  return {
    day: day.day,
    settledCallValue: moneyLabel(day.money, day.settledCallValue),
    money: day.money === 'settled_only' ? ADMIN_METRICS_COPY.settledOnly : ADMIN_METRICS_COPY.noSettledUsage,
    settledCalls: formatCount(day.settledCalls),
    attemptedCalls: formatCount(day.attemptedCalls),
    completedCalls: formatCount(day.completedCalls),
    uncertainCalls: formatCount(day.uncertainCalls),
    quotesCreated: formatCount(day.quotesCreated),
    quotesConvertedAtClose: formatCount(day.quotesConvertedAtClose),
    transactingWorkspaces: formatCount(day.transactingWorkspaces),
    transactingAgents: formatCount(day.transactingAgents),
    transactingProviders: formatCount(day.transactingProviders),
    transactingTools: formatCount(day.transactingTools),
    returningWorkspaces: formatCount(day.returningWorkspaces),
    terminalCalls: formatCount(day.terminalCalls),
    terminalCallsWithResolution: formatCount(day.terminalCallsWithResolution),
  }
}
