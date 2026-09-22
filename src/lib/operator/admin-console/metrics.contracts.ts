import type { ExactAmount } from '@/modules/money/public'

export type MarketplaceMetricsRange = 'last_7' | 'last_30' | 'last_90'

export type MarketplaceMetricDay = Readonly<{
  day: string
  computedAt: number
  version: 1
  settledCallValue: ExactAmount | null
  money: 'settled_only' | 'not_configured'
  settledCalls: number
  attemptedCalls: number
  completedCalls: number
  uncertainCalls: number
  uncertainCallsOpenAtClose: number
  quotesCreated: number
  quotesConvertedAtClose: number
  transactingWorkspaces: number
  transactingAgents: number
  transactingProviders: number
  transactingTools: number
  returningWorkspaces: number
  newTransactingWorkspaces: number
  newTransactingProviders: number
  terminalCalls: number
  terminalCallsWithResolution: number
}>

export type MarketplaceMetricsReport = Readonly<{
  days: MarketplaceMetricDay[]
  latestDay: string | null
  headline: Readonly<{
    settledCallValue: ExactAmount | null
    money: 'settled_only' | 'not_configured'
    settledCalls: number
    successRate: number | null
    transactingWorkspaces: number
  }>
  ratios: Readonly<{
    successRate: number | null
    quoteConversion: number | null
    returningWorkspaceRate: number | null
    resolutionCoverage: number | null
    takeRate: null
  }>
  wow: Readonly<Record<
    'settledCalls' | 'attemptedCalls' | 'completedCalls' | 'transactingWorkspaces' | 'quotesCreated',
    number | null
  >>
}>
