import { TableAggregate } from '@convex-dev/aggregate'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { DataModel, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from './workloadCron'

const PRESENCE_REFRESH_PAGE_SIZE = 20

const activeTools = new TableAggregate<{
  Key: null
  DataModel: DataModel
  TableName: 'marketActiveTools'
}>(components.marketActiveTools, { sortKey: () => null })

const activeProviders = new TableAggregate<{
  Key: null
  DataModel: DataModel
  TableName: 'marketActiveProviders'
}>(components.marketActiveProviders, { sortKey: () => null })

export async function syncMarketToolPresence(
  ctx: MutationCtx,
  input: Readonly<{
    toolRef: string
    businessId: Id<'businesses'>
    active: boolean
    now: number
  }>,
): Promise<void> {
  const existing = await ctx.db.query('marketActiveTools')
    .withIndex('by_toolRef', (index) => index.eq('toolRef', input.toolRef))
    .unique()
  if (input.active && existing === null) {
    const id = await ctx.db.insert('marketActiveTools', {
      toolRef: input.toolRef,
      businessId: input.businessId,
      activatedAt: input.now,
    })
    const row = await ctx.db.get(id)
    if (row === null) throw new Error('market_active_tool_missing_after_insert')
    await activeTools.insert(ctx, row)
  }
  if (!input.active && existing !== null) {
    await ctx.db.delete(existing._id)
    await activeTools.delete(ctx, existing)
  }
  await syncProviderPresence(ctx, input.businessId, input.now)
}

async function syncProviderPresence(ctx: MutationCtx, businessId: Id<'businesses'>, now: number): Promise<void> {
  const [tool, provider] = await Promise.all([
    ctx.db.query('marketActiveTools').withIndex('by_businessId', (index) => index.eq('businessId', businessId)).first(),
    ctx.db.query('marketActiveProviders').withIndex('by_businessId', (index) => index.eq('businessId', businessId)).unique(),
  ])
  if (tool !== null && provider === null) {
    const id = await ctx.db.insert('marketActiveProviders', { businessId, activatedAt: now })
    const row = await ctx.db.get(id)
    if (row === null) throw new Error('market_active_provider_missing_after_insert')
    await activeProviders.insert(ctx, row)
  }
  if (tool === null && provider !== null) {
    await ctx.db.delete(provider._id)
    await activeProviders.delete(ctx, provider)
  }
}

export async function countMarketPresence(ctx: QueryCtx): Promise<{ tools: number; providers: number }> {
  const [tools, providers] = await Promise.all([
    activeTools.count(ctx),
    activeProviders.count(ctx),
  ])
  return { tools: tools ?? 0, providers: providers ?? 0 }
}

/**
 * Re-evaluates time-bounded readiness so the current gauges cannot retain an
 * Tool after its readiness window expires without another publication.
 */
export const refresh = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    workload: workloadCronSnapshotValue,
  },
  returns: v.object({ processed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(
      ctx,
      'refresh current market presence',
      parseWorkloadCronSnapshot(args.workload),
    )
    const now = Date.now()
    const page = await ctx.db.query('capabilityPublications').paginate({
      cursor: args.cursor,
      numItems: PRESENCE_REFRESH_PAGE_SIZE,
    })
    for (const publication of page.page) {
      await syncMarketToolPresence(ctx, {
        toolRef: publication.toolRef,
        businessId: publication.businessId,
        active: publication.disposition === 'current'
          && publication.sourceAuthorityState !== 'review_required'
          && publication.credentialState === 'ready'
          && publication.healthState === 'healthy'
          && (publication.readinessValidUntil ?? 0) > now,
        now,
      })
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.workloadCron.refreshCurrentMarketPresence, {
        cursor: page.continueCursor,
      })
    }
    return { processed: page.page.length, complete: page.isDone }
  },
})
