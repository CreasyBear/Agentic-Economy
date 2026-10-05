import type { ExactAmount } from '@/modules/money/public'
import type { MarketplaceFunding } from '@/modules/observability/public'

export type MarketplaceMetricsRange = 'last_7' | 'last_30' | 'last_90'
export type MarketplaceMetricsSnapshotRefusalCode =
  | 'malformed_day'
  | 'multiple_currencies'
  | 'unsupported_currency'
  | 'environment_unavailable'

export type MarketplaceMetricDay = Readonly<{
  day: string
  computedAt: number
  version: 1
  complete: boolean
  funding?: MarketplaceFunding
  settledCallValue: ExactAmount | null
  money: 'settled_only' | 'no_settled_usage'
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
  environment?: 'sandbox' | 'production' | null
  funding?: (MarketplaceFunding & Readonly<{ repeatBuyingAccounts: number; accountCoverageComplete: boolean }>) | null
  days: MarketplaceMetricDay[]
  coverageComplete: boolean
  partialDays: string[]
  latestDay: string | null
  headline: Readonly<{
    settledCallValue: ExactAmount | null
    money: 'settled_only' | 'no_settled_usage'
    settledCalls: number
    successRate: number | null
    transactingWorkspaces: number
  }> | null
  ratios: Readonly<{
    successRate: number | null
    quoteConversion: number | null
    returningWorkspaceRate: number | null
    resolutionCoverage: number | null
  }> | null
  wow: Readonly<Record<
    'settledCalls' | 'attemptedCalls' | 'completedCalls' | 'transactingWorkspaces' | 'quotesCreated',
    number | null
  >> | null
}>
