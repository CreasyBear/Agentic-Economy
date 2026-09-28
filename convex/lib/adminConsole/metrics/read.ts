import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v } from 'convex/values'

import type {
  MarketplaceMetricDay,
  MarketplaceMetricsRange,
  MarketplaceMetricsReport,
} from '@/lib/operator/admin-console/metrics.contracts'
import { addExactAmounts, type ExactAmount } from '@/modules/money/public'
import type { Doc } from '../../../_generated/dataModel'
import { internal } from '../../../_generated/api'
import type { QueryCtx } from '../../../_generated/server'
import { previousPerthDay, shiftPerthDay } from './dayWindow'

export const marketplaceMetricsRangeValue = v.union(
  v.literal('last_7'),
  v.literal('last_30'),
  v.literal('last_90'),
)

const exactAmountOrNullValue = v.union(v.null(), v.object({
  units: v.string(),
  exponent: v.number(),
  currency: v.string(),
}))
const marketplaceMetricDayValue = v.object({
  day: v.string(),
  computedAt: v.number(),
  version: v.literal(1),
  complete: v.boolean(),
  settledCallValue: exactAmountOrNullValue,
  money: v.union(v.literal('settled_only'), v.literal('no_settled_usage')),
  settledCalls: v.number(),
  attemptedCalls: v.number(),
  completedCalls: v.number(),
  uncertainCalls: v.number(),
  uncertainCallsOpenAtClose: v.number(),
  quotesCreated: v.number(),
  quotesConvertedAtClose: v.number(),
  transactingWorkspaces: v.number(),
  transactingAgents: v.number(),
  transactingProviders: v.number(),
  transactingTools: v.number(),
  returningWorkspaces: v.number(),
  newTransactingWorkspaces: v.number(),
  newTransactingProviders: v.number(),
  terminalCalls: v.number(),
  terminalCallsWithResolution: v.number(),
})
const ratioValue = v.union(v.number(), v.null())

export const marketplaceMetricsReportValue = v.object({
  days: v.array(marketplaceMetricDayValue),
  partialDays: v.array(v.string()),
  coverageComplete: v.boolean(),
  latestDay: v.union(v.string(), v.null()),
  headline: v.union(v.null(), v.object({
    settledCallValue: exactAmountOrNullValue,
    money: v.union(v.literal('settled_only'), v.literal('no_settled_usage')),
    settledCalls: v.number(),
    successRate: ratioValue,
    transactingWorkspaces: v.number(),
  })),
  ratios: v.union(v.null(), v.object({
    successRate: ratioValue,
    quoteConversion: ratioValue,
    returningWorkspaceRate: ratioValue,
    resolutionCoverage: ratioValue,
  })),
  wow: v.union(v.null(), v.object({
    settledCalls: ratioValue,
    attemptedCalls: ratioValue,
    completedCalls: ratioValue,
    transactingWorkspaces: ratioValue,
    quotesCreated: ratioValue,
  })),
})

const RANGE_DAYS: Readonly<Record<MarketplaceMetricsRange, number>> = {
  last_7: 7,
  last_30: 30,
  last_90: 90,
}

function projectDay(row: Doc<'marketplaceMetricDays'>): MarketplaceMetricDay {
  return {
    day: row.day,
    computedAt: row.computedAt,
    complete: row.complete !== false,
    version: row.version,
    settledCallValue: row.settledCallValue,
    money: row.money === 'not_configured' ? 'no_settled_usage' : row.money,
    settledCalls: row.settledCalls,
    attemptedCalls: row.attemptedCalls,
    completedCalls: row.completedCalls,
    uncertainCalls: row.uncertainCalls,
    uncertainCallsOpenAtClose: row.uncertainCallsOpenAtClose,
    quotesCreated: row.quotesCreated,
    quotesConvertedAtClose: row.quotesConvertedAtClose,
    transactingWorkspaces: row.transactingWorkspaces,
    transactingAgents: row.transactingAgents,
    transactingProviders: row.transactingProviders,
    transactingTools: row.transactingTools,
    returningWorkspaces: row.returningWorkspaces,
    newTransactingWorkspaces: row.newTransactingWorkspaces,
    newTransactingProviders: row.newTransactingProviders,
    terminalCalls: row.terminalCalls,
    terminalCallsWithResolution: row.terminalCallsWithResolution,
  }
}

function sum(days: readonly MarketplaceMetricDay[], field: 'settledCalls' | 'attemptedCalls' | 'completedCalls' | 'quotesCreated' | 'quotesConvertedAtClose' | 'returningWorkspaces' | 'transactingWorkspaces' | 'terminalCalls' | 'terminalCallsWithResolution'): number {
  return days.reduce((total, day) => total + day[field], 0)
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function wow(current: number, prior: number): number | null {
  return prior === 0 ? null : (current - prior) / prior
}

function sumMoney(days: readonly MarketplaceMetricDay[]): ExactAmount | null {
  let total: ExactAmount | null = null
  for (const day of days) {
    if (day.settledCallValue === null) continue
    if (total === null) {
      total = day.settledCallValue
      continue
    }
    const next = addExactAmounts(total, day.settledCallValue)
    if (next === undefined) throw new Error('marketplace_metrics_money_scale_mismatch')
    total = next
  }
  return total
}
export async function pageWorkspacesForDayHandler(
  ctx: QueryCtx,
  args: Readonly<{ day: string; paginationOpts: PaginationOptions }>,
): Promise<PaginationResult<string>> {
  const result = await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_day_and_entityKind', (query) => query.eq('day', args.day).eq('entityKind', 'workspace'))
    .paginate(args.paginationOpts)
  return { ...result, page: result.page.map((row) => row.entityRef) }
}

async function distinctWorkspaces(ctx: QueryCtx, days: readonly string[]): Promise<number> {
  const refs = new Set<string>()
  for (const day of days) {
    let cursor: string | null = null
    let done = false
    while (!done) {
      const result: PaginationResult<string> = await ctx.runQuery(
        internal.adminConsoleMetrics.pageWorkspacesForDay,
        { day, paginationOpts: { cursor, numItems: 500 } },
      )
      for (const ref of result.page) refs.add(ref)
      cursor = result.continueCursor
      done = result.isDone
    }
  }
  return refs.size
}


export async function readMarketplaceMetricsRange(
  ctx: QueryCtx,
  range: MarketplaceMetricsRange,
): Promise<MarketplaceMetricsReport> {
  const rangeDays = RANGE_DAYS[range]
  const lastDay = previousPerthDay(Date.now())
  const firstDay = shiftPerthDay(lastDay, -(rangeDays - 1))
  const wowFirstDay = shiftPerthDay(lastDay, -13)
  if (firstDay === null || wowFirstDay === null) throw new Error('marketplace_metrics_day_invariant')
  const queryFirstDay = firstDay < wowFirstDay ? firstDay : wowFirstDay
  const rows = await ctx.db.query('marketplaceMetricDays')
    .withIndex('by_day', (query) => query.gte('day', queryFirstDay).lte('day', lastDay))
    .take(101)
  if (rows.length > 100) throw new Error('marketplace_metric_day_limit_exceeded')
  const partialDays = rows.filter((row) => row.day >= firstDay && row.complete === false).map((row) => row.day)
  const allDays = rows.filter((row) => row.complete !== false).map(projectDay)
  const days = allDays.filter((day) => day.day >= firstDay)
  const coverageComplete = days.length === rangeDays && partialDays.length === 0
  if (!coverageComplete) return {
    days, partialDays, coverageComplete, latestDay: days.at(-1)?.day ?? null,
    headline: null, ratios: null, wow: null,
  }
  const headlineFirstDay = shiftPerthDay(lastDay, -6)
  const priorFirstDay = shiftPerthDay(lastDay, -13)
  if (headlineFirstDay === null || priorFirstDay === null) throw new Error('marketplace_metrics_day_invariant')
  const latest = allDays.filter((day) => day.day >= headlineFirstDay)
  const prior = allDays.filter((day) => day.day >= priorFirstDay && day.day < headlineFirstDay)
  const publishedEntityDay = (day: MarketplaceMetricDay) => rows.find((row) => row.day === day.day)?.entityDay ?? day.day
  const [headlineWorkspaces, priorWorkspaces] = await Promise.all([
    distinctWorkspaces(ctx, latest.map(publishedEntityDay)),
    distinctWorkspaces(ctx, prior.map(publishedEntityDay)),
  ])
  const headlineMoney = sumMoney(latest)
  const attempted = sum(days, 'attemptedCalls')
  const completed = sum(days, 'completedCalls')
  return {
    partialDays,
    coverageComplete,
    days,
    latestDay: days.at(-1)?.day ?? null,
    headline: {
      settledCallValue: headlineMoney,
      money: headlineMoney === null ? 'no_settled_usage' : 'settled_only',
      settledCalls: sum(latest, 'settledCalls'),
      successRate: ratio(sum(latest, 'completedCalls'), sum(latest, 'attemptedCalls')),
      transactingWorkspaces: headlineWorkspaces,
    },
    ratios: {
      successRate: ratio(completed, attempted),
      quoteConversion: ratio(sum(days, 'quotesConvertedAtClose'), sum(days, 'quotesCreated')),
      returningWorkspaceRate: ratio(sum(days, 'returningWorkspaces'), sum(days, 'transactingWorkspaces')),
      resolutionCoverage: ratio(sum(days, 'terminalCallsWithResolution'), sum(days, 'terminalCalls')),
    },
    wow: {
      settledCalls: wow(sum(latest, 'settledCalls'), sum(prior, 'settledCalls')),
      attemptedCalls: wow(sum(latest, 'attemptedCalls'), sum(prior, 'attemptedCalls')),
      completedCalls: wow(sum(latest, 'completedCalls'), sum(prior, 'completedCalls')),
      transactingWorkspaces: wow(headlineWorkspaces, priorWorkspaces),
      quotesCreated: wow(sum(latest, 'quotesCreated'), sum(prior, 'quotesCreated')),
    },
  }
}
