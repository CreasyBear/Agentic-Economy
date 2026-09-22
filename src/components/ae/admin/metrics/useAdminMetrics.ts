import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import type {
  MarketplaceMetricDay,
  MarketplaceMetricsRange,
  MarketplaceMetricsReport,
} from '@/lib/operator/admin-console/metrics.contracts'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  ADMIN_METRICS_COPY,
  type AdminMetricDayRow,
  type AdminMetricsDataState,
} from './metrics.contracts'

const numberFormatter = new Intl.NumberFormat('en-AU')
const percentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const signedPercentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'always',
})

export function useAdminMetrics(range: MarketplaceMetricsRange): AdminMetricsDataState {
  const report = useQuery(api.adminConsoleMetrics.readMarketplaceMetrics, { range })
  if (report === undefined) return { kind: 'loading' }
  if ('kind' in report) return { kind: 'refused' }
  return {
    kind: 'ready',
    cards: [
      {
        label: ADMIN_METRICS_COPY.settledCallValue,
        value: moneyLabel(report.headline.money, report.headline.settledCallValue),
        delta: ADMIN_METRICS_COPY.noComparison,
      },
      {
        label: ADMIN_METRICS_COPY.settledCalls,
        value: numberFormatter.format(report.headline.settledCalls),
        delta: deltaLabel(report.wow.settledCalls),
      },
      {
        label: ADMIN_METRICS_COPY.successRate,
        value: ratioLabel(report.headline.successRate),
        delta: ADMIN_METRICS_COPY.noComparison,
      },
      {
        label: ADMIN_METRICS_COPY.transactingWorkspaces,
        value: numberFormatter.format(report.headline.transactingWorkspaces),
        delta: deltaLabel(report.wow.transactingWorkspaces),
      },
    ],
    ratios: [
      { label: ADMIN_METRICS_COPY.successRate, value: ratioLabel(report.ratios.successRate) },
      { label: ADMIN_METRICS_COPY.quoteConversion, value: ratioLabel(report.ratios.quoteConversion) },
      { label: ADMIN_METRICS_COPY.returningWorkspaceRate, value: ratioLabel(report.ratios.returningWorkspaceRate) },
      { label: ADMIN_METRICS_COPY.resolutionCoverage, value: ratioLabel(report.ratios.resolutionCoverage) },
      { label: ADMIN_METRICS_COPY.takeRate, value: ADMIN_METRICS_COPY.notConfigured },
    ],
    days: report.days.map(toDayRow),
  }
}

function moneyLabel(
  money: MarketplaceMetricsReport['headline']['money'],
  amount: MarketplaceMetricsReport['headline']['settledCallValue'],
): string {
  return money === 'not_configured' || amount === null
    ? ADMIN_METRICS_COPY.notConfigured
    : formatCurrencyAmount(amount)
}

function ratioLabel(value: number | null): string {
  return value === null ? ADMIN_METRICS_COPY.notAvailable : percentFormatter.format(value)
}

function deltaLabel(value: number | null): string {
  return value === null ? ADMIN_METRICS_COPY.noComparison : signedPercentFormatter.format(value)
}

function toDayRow(day: MarketplaceMetricDay): AdminMetricDayRow {
  return {
    day: day.day,
    settledCallValue: moneyLabel(day.money, day.settledCallValue),
    money: day.money === 'settled_only' ? ADMIN_METRICS_COPY.settledOnly : ADMIN_METRICS_COPY.notConfigured,
    settledCalls: numberFormatter.format(day.settledCalls),
    attemptedCalls: numberFormatter.format(day.attemptedCalls),
    completedCalls: numberFormatter.format(day.completedCalls),
    uncertainCalls: numberFormatter.format(day.uncertainCalls),
    quotesCreated: numberFormatter.format(day.quotesCreated),
    quotesConvertedAtClose: numberFormatter.format(day.quotesConvertedAtClose),
    transactingWorkspaces: numberFormatter.format(day.transactingWorkspaces),
    transactingAgents: numberFormatter.format(day.transactingAgents),
    transactingProviders: numberFormatter.format(day.transactingProviders),
    transactingTools: numberFormatter.format(day.transactingTools),
    returningWorkspaces: numberFormatter.format(day.returningWorkspaces),
    terminalCalls: numberFormatter.format(day.terminalCalls),
    terminalCallsWithResolution: numberFormatter.format(day.terminalCallsWithResolution),
  }
}
