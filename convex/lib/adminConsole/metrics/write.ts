import { v, type Infer } from 'convex/values'
import type { MarketplaceMetricDay } from '@/lib/operator/admin-console/metrics.contracts'

import type { MutationCtx } from '../../../_generated/server'

export const marketplaceEntityKindValue = v.union(
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
  money: v.union(v.literal('settled_only'), v.literal('not_configured')),
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
const ENTITY_DAY_LIMIT = 1_000

async function rowsForDay(
  ctx: MutationCtx,
  day: string,
  entityKind: MarketplaceEntity['entityKind'],
) {
  const rows = await ctx.db.query('marketplaceEntityDays')
    .withIndex('by_day_and_entityKind', (query) => query.eq('day', day).eq('entityKind', entityKind))
    .take(ENTITY_DAY_LIMIT + 1)
  if (rows.length > ENTITY_DAY_LIMIT) throw new Error('marketplace_entity_day_limit_exceeded')
  return rows
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
  }>,
): Promise<null> {
  if (args.replace) {
    const existingByKind = await Promise.all(ENTITY_KINDS.map(async (kind) => await rowsForDay(ctx, args.day, kind)))
    for (const rows of existingByKind) {
      for (const row of rows) await ctx.db.delete(row._id)
    }
  }
  for (const entity of args.entities) {
    await ctx.db.insert('marketplaceEntityDays', { day: args.day, ...entity })
  }
  if (args.counts === undefined) return null

  const [workspaces, providers] = await Promise.all([
    rowsForDay(ctx, args.day, 'workspace'),
    rowsForDay(ctx, args.day, 'provider'),
  ])
  const workspacePrior = await Promise.all(workspaces.map(async (row) => (
    await hadPriorActivity(ctx, args.day, 'workspace', row.entityRef)
  )))
  const providerPrior = await Promise.all(providers.map(async (row) => (
    await hadPriorActivity(ctx, args.day, 'provider', row.entityRef)
  )))
  const returningWorkspaces = workspacePrior.filter(Boolean).length
  const newTransactingProviders = providerPrior.filter((prior) => !prior).length
  const existing = await ctx.db.query('marketplaceMetricDays')
    .withIndex('by_day', (query) => query.eq('day', args.day))
    .unique()
  const metric: MarketplaceMetricDay = {
    day: args.day,
    computedAt: Date.now(),
    version: 1,
    ...args.counts,
    returningWorkspaces,
    newTransactingWorkspaces: workspaces.length - returningWorkspaces,
    newTransactingProviders,
  }
  if (existing === null) await ctx.db.insert('marketplaceMetricDays', metric)
  else await ctx.db.replace(existing._id, metric)
  return null
}
