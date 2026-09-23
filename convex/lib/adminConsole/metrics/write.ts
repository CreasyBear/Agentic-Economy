import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricDay } from '@/lib/operator/admin-console/metrics.contracts'

import type { MutationCtx } from '../../../_generated/server'

const marketplaceEntityKindValue = v.union(
  v.literal('workspace'),
  v.literal('agent'),
  v.literal('provider'),
  v.literal('tool'),
)

export const marketplaceEntityValue = v.object({
  entityKind: marketplaceEntityKindValue,
  entityRef: v.string(),
})

const exactAmountOrNullValue = v.union(v.null(), v.object({
  units: v.string(),
  exponent: v.number(),
  currency: v.string(),
}))

export const marketplaceMetricCountsValue = v.object({
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

export type MarketplaceEntity = Infer<typeof marketplaceEntityValue>
export type MarketplaceMetricCounts = Infer<typeof marketplaceMetricCountsValue>

const ENTITY_KINDS: readonly MarketplaceEntity['entityKind'][] = ['workspace', 'agent', 'provider', 'tool']
const BATCH_SIZE = 500

async function clearEntityBatch(ctx: MutationCtx, day: string): Promise<boolean> {
  let deleted = 0
  for (const kind of ENTITY_KINDS) {
    const rows = await ctx.db.query('marketplaceEntityDays')
      .withIndex('by_day_and_entityKind', (query) => query.eq('day', day).eq('entityKind', kind))
      .take(BATCH_SIZE - deleted)
    for (const row of rows) await ctx.db.delete(row._id)
    deleted += rows.length
    if (deleted === BATCH_SIZE) return true
  }
  return false
}

async function hadPriorActivity(
  ctx: MutationCtx,
  day: string,
  entityKind: 'workspace' | 'provider',
  entityRef: string,
): Promise<boolean> {
  return await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_entityKind_and_entityRef_and_day', (query) => query
      .eq('entityKind', entityKind)
      .eq('entityRef', entityRef)
      .lt('day', day))
    .first() !== null
}

export async function writeMarketplaceMetricsDayHandler(
  ctx: MutationCtx,
  args: Readonly<{
    day: string
    entities: readonly MarketplaceEntity[]
    counts?: MarketplaceMetricCounts
    replace: boolean
    complete: boolean
  }>,
): Promise<boolean> {
  if (args.replace) {
    if (args.counts !== undefined) {
      const metric: MarketplaceMetricDay = {
        day: args.day,
        computedAt: Date.now(),
        version: 1,
        complete: false,
        ...args.counts,
        returningWorkspaces: 0,
        newTransactingWorkspaces: 0,
        newTransactingProviders: 0,
      }
      const existing = await ctx.db.query('marketplaceMetricDays')
        .withIndex('by_day', (query) => query.eq('day', args.day)).unique()
      if (existing === null) await ctx.db.insert('marketplaceMetricDays', metric)
      else await ctx.db.replace(existing._id, metric)
    }
    return await clearEntityBatch(ctx, args.day)
  }
  const metric = await ctx.db.query('marketplaceMetricDays')
    .withIndex('by_day', (query) => query.eq('day', args.day)).unique()
  if (metric === null || metric.complete) throw new Error('marketplace_metrics_snapshot_not_in_progress')
  const returning = await Promise.all(args.entities.map(async (entity) =>
    entity.entityKind === 'workspace' || entity.entityKind === 'provider'
      ? await hadPriorActivity(ctx, args.day, entity.entityKind, entity.entityRef)
      : false))
  for (const entity of args.entities) {
    await ctx.db.insert('marketplaceEntityDays', { day: args.day, ...entity })
  }
  const returningWorkspaces = args.entities.filter((entity, index) => entity.entityKind === 'workspace' && returning[index]).length
  await ctx.db.patch(metric._id, {
    complete: args.complete,
    returningWorkspaces: metric.returningWorkspaces + returningWorkspaces,
    newTransactingWorkspaces: metric.newTransactingWorkspaces
      + args.entities.filter((entity) => entity.entityKind === 'workspace').length - returningWorkspaces,
    newTransactingProviders: metric.newTransactingProviders
      + args.entities.filter((entity, index) => entity.entityKind === 'provider' && !returning[index]).length,
  })
  return false
}
