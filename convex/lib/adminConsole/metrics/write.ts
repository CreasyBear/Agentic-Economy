import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricDay } from '@/lib/operator/admin-console/metrics.contracts'
import { marketplaceFundingValue } from '@/modules/observability/public'

import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'


const exactAmountOrNullValue = v.union(v.null(), v.object({
  units: v.string(),
  exponent: v.number(),
  currency: v.string(),
}))

export const marketplaceMetricCountsValue = v.object({
  funding: v.optional(marketplaceFundingValue),
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
  terminalCalls: v.number(),
  terminalCallsWithResolution: v.number(),
})

export type MarketplaceMetricCounts = Infer<typeof marketplaceMetricCountsValue>

const BATCH_SIZE = 500

async function clearEntityBatch(ctx: MutationCtx, day: string, refsOnly = false): Promise<boolean> {
  let deleted = 0
  const kinds = refsOnly
    ? ['call', 'terminal', 'resolved'] as const
    : ['workspace', 'agent', 'provider', 'tool', 'call', 'terminal', 'resolved', 'buyer'] as const
  for (const kind of kinds) {
    const rows = await ctx.db.query('marketplaceEntityDays')
      .withIndex('by_day_and_entityKind', (query) => query.eq('day', day).eq('entityKind', kind))
      .take(BATCH_SIZE - deleted)
    for (const row of rows) await ctx.db.delete(row._id)
    deleted += rows.length
    if (deleted === BATCH_SIZE) return true
  }
  return false
}

export async function hadPriorActivity(
  ctx: MutationCtx,
  day: string,
  entityKind: 'workspace' | 'provider',
  entityRef: string,
): Promise<boolean> {
  const rows = await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_entityKind_and_entityRef_and_day', (query) => query
      .eq('entityKind', entityKind).eq('entityRef', entityRef).lt('day', day))
    .take(101)
  for (const row of rows) {
    const published = await ctx.db.query('marketplaceMetricDays')
      .withIndex('by_day', (query) => query.eq('day', row.day.slice(0, 10))).unique()
    if (published !== null && published.complete !== false && (published.entityDay ?? published.day) === row.day) return true
  }
  if (rows.length > 100) throw new Error('marketplace_metrics_prior_activity_limit')
  return false
}

export async function writeMarketplaceMetricsDayHandler(
  ctx: MutationCtx,
  args: Readonly<{
    day: string
    entityDay: string
    sourceStartedAt?: number
    counts?: MarketplaceMetricCounts & Readonly<{
      returningWorkspaces: number
      newTransactingWorkspaces: number
      newTransactingProviders: number
    }>
    phase: 'publish' | 'cleanup' | 'refs'
  }>,
): Promise<null> {
  if (args.phase === 'cleanup' || args.phase === 'refs') {
    const current = await ctx.db.query('marketplaceMetricDays')
      .withIndex('by_day', (query) => query.eq('day', args.day)).unique()
    const active = current !== null && current.complete !== false && (current.entityDay ?? current.day) === args.entityDay
    if (args.phase === 'cleanup' && active) return null
    if (args.phase === 'refs' && !active) return null
    const remaining = await clearEntityBatch(ctx, args.entityDay, args.phase === 'refs')
    if (remaining) await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day: args.day, entityDay: args.entityDay, phase: args.phase,
    })
    if (args.phase === 'cleanup') {
      const build = await ctx.db.query('marketplaceMetricBuilds')
        .withIndex('by_entityDay', (query) => query.eq('entityDay', args.entityDay)).unique()
      if (build !== null) await ctx.db.delete(build._id)
    }
    return null
  }
  if (args.counts === undefined) throw new Error('marketplace_metrics_counts_required')
  const existing = await ctx.db.query('marketplaceMetricDays')
    .withIndex('by_day', (query) => query.eq('day', args.day)).unique()
  if (existing?.sourceStartedAt !== undefined && (args.sourceStartedAt === undefined || args.sourceStartedAt < existing.sourceStartedAt)) {
    await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.writeMarketplaceMetricsDay, { day: args.day, entityDay: args.entityDay, phase: 'cleanup' })
    return null
  }
  const metric: MarketplaceMetricDay & { entityDay: string; sourceStartedAt?: number } = {
    day: args.day,
    entityDay: args.entityDay,
    ...(args.sourceStartedAt === undefined ? {} : { sourceStartedAt: args.sourceStartedAt }),
    computedAt: Date.now(),
    version: 1,
    complete: true,
    ...args.counts,
  }
  if (existing === null) await ctx.db.insert('marketplaceMetricDays', metric)
  else await ctx.db.replace(existing._id, metric)
  const obsoleteDay = existing?.entityDay ?? existing?.day ?? args.day
  if (obsoleteDay !== args.entityDay) {
    await ctx.scheduler.runAfter(0, internal.adminConsoleMetrics.writeMarketplaceMetricsDay, {
      day: args.day, entityDay: obsoleteDay, phase: 'cleanup',
    })
  }
  return null
}
