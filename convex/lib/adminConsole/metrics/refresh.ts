import type { PaginationOptions, PaginationResult } from 'convex/server'
import { v } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { internal } from '../../../_generated/api'
import { env, type ActionCtx, type QueryCtx } from '../../../_generated/server'
import { previousPerthDay, shiftPerthDay } from './dayWindow'

const DAY_MS = 86_400_000
export const refreshContinuationValue = v.object({
  from: v.number(), toExclusive: v.number(), cursor: v.union(v.string(), v.null()), days: v.array(v.string()),
})

/** Refresh missing history and days affected by late delivery/refund changes.
 * Requires the declared environment; scans bounded pages with a fixed watermark.
 * Ensures at most 90 unique daily rebuilds, using the existing atomic publisher.
 * Duplicate scheduled work replaces a snapshot; it never adds counts or changes money.
 * A failed run leaves dated evidence; the next run overlaps two days and retries gaps. */
export async function refreshMarketplaceMetrics(ctx: ActionCtx, args: {
  continuation?: { from: number; toExclusive: number; cursor: string | null; days: string[] }
}): Promise<null> {
  const toExclusive = args.continuation?.toExclusive ?? Date.now()
  const from = args.continuation?.from ?? toExclusive - 2 * DAY_MS
  const lastDay = previousPerthDay(toExclusive)
  const firstDay = shiftPerthDay(lastDay, -89)
  if (firstDay === null || !Number.isSafeInteger(from) || !Number.isSafeInteger(toExclusive)
    || from >= toExclusive || toExclusive - from > 2 * DAY_MS) throw new Error('marketplace_refresh_window_invalid')
  const days = new Set(args.continuation?.days ?? await ctx.runQuery(internal.adminConsoleMetrics.missingMetricDays, { lastDay }))
  if (days.size > 90 || [...days].some(day => day < firstDay || day > lastDay)) throw new Error('marketplace_refresh_days_invalid')
  days.add(lastDay)
  let cursor = args.continuation?.cursor ?? null
  for (let pageNumber = 0; pageNumber < 8; pageNumber += 1) {
    const page = await ctx.runQuery(internal.adminConsoleMetrics.changedMetricDays, {
      from, toExclusive, paginationOpts: { cursor, numItems: 100 },
    })
    for (const day of page.page) if (day >= firstDay && day <= lastDay) days.add(day)
    if (page.isDone) {
      // Oldest first preserves the existing prior-activity calculation on a fresh deployment.
      for (const [index, day] of [...days].sort().entries()) {
        await ctx.scheduler.runAfter(index * 1_000, internal.adminConsoleMetrics.snapshotMarketplaceMetricsDay, { day })
      }
      return null
    }
    cursor = page.continueCursor
  }
  await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.refreshMarketplaceMetrics, {
    continuation: { from, toExclusive, cursor, days: [...days] },
  })
  return null
}

export async function missingMetricDays(ctx: QueryCtx, { lastDay }: { lastDay: string }): Promise<string[]> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  const firstDay = shiftPerthDay(lastDay, -89)
  if (firstDay === null) throw new Error('marketplace_refresh_day_invalid')
  const rows = await ctx.db.query('marketplaceMetricDays')
    .withIndex('by_day', q => q.gte('day', firstDay).lte('day', lastDay)).take(91)
  if (rows.length > 90) throw new Error('marketplace_metric_day_limit_exceeded')
  const complete = new Set(rows.filter(row => row.complete !== false && row.funding?.environment === environment).map(row => row.day))
  return Array.from({ length: 90 }, (_, index) => shiftPerthDay(lastDay, -index))
    .filter((day): day is string => day !== null && !complete.has(day))
}

export async function changedMetricDays(ctx: QueryCtx, args: { from: number; toExclusive: number; paginationOpts: PaginationOptions }): Promise<PaginationResult<string>> {
  const environment = deploymentPaymentEnvironment(env)
  if (environment === undefined) throw new Error('marketplace_metrics_environment_unavailable')
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_environment_and_updatedAt', q => q.eq('environment', environment).gte('updatedAt', args.from).lt('updatedAt', args.toExclusive))
    .paginate(args.paginationOpts)
  return { ...rows, page: [...new Set(rows.page.map(row => new Date(row.createdAt + 8 * 3_600_000).toISOString().slice(0, 10)))] }
}
