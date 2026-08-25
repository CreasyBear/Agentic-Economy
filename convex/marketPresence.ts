import { TableAggregate } from '@convex-dev/aggregate'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { DataModel, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'

const PRESENCE_REFRESH_PAGE_SIZE = 20

const activeOperations = new TableAggregate<{
  Key: null
  DataModel: DataModel
  TableName: 'marketActiveOperations'
}>(components.marketActiveOperations, { sortKey: () => null })

const activeSuppliers = new TableAggregate<{
  Key: null
  DataModel: DataModel
  TableName: 'marketActiveSuppliers'
}>(components.marketActiveSuppliers, { sortKey: () => null })

export async function syncMarketOperationPresence(
  ctx: MutationCtx,
  input: Readonly<{
    operationRef: string
    businessId: Id<'businesses'>
    active: boolean
    now: number
  }>,
): Promise<void> {
  const existing = await ctx.db.query('marketActiveOperations')
    .withIndex('by_operationRef', (index) => index.eq('operationRef', input.operationRef))
    .unique()
  if (input.active && existing === null) {
    const id = await ctx.db.insert('marketActiveOperations', {
      operationRef: input.operationRef,
      businessId: input.businessId,
      activatedAt: input.now,
    })
    const row = await ctx.db.get(id)
    if (row === null) throw new Error('market_active_operation_missing_after_insert')
    await activeOperations.insert(ctx, row)
  }
  if (!input.active && existing !== null) {
    await ctx.db.delete(existing._id)
    await activeOperations.delete(ctx, existing)
  }
  await syncSupplierPresence(ctx, input.businessId, input.now)
}

async function syncSupplierPresence(ctx: MutationCtx, businessId: Id<'businesses'>, now: number): Promise<void> {
  const [operation, supplier] = await Promise.all([
    ctx.db.query('marketActiveOperations').withIndex('by_businessId', (index) => index.eq('businessId', businessId)).first(),
    ctx.db.query('marketActiveSuppliers').withIndex('by_businessId', (index) => index.eq('businessId', businessId)).unique(),
  ])
  if (operation !== null && supplier === null) {
    const id = await ctx.db.insert('marketActiveSuppliers', { businessId, activatedAt: now })
    const row = await ctx.db.get(id)
    if (row === null) throw new Error('market_active_supplier_missing_after_insert')
    await activeSuppliers.insert(ctx, row)
  }
  if (operation === null && supplier !== null) {
    await ctx.db.delete(supplier._id)
    await activeSuppliers.delete(ctx, supplier)
  }
}

export async function countMarketPresence(ctx: QueryCtx): Promise<{ operations: number; suppliers: number }> {
  const [operations, suppliers] = await Promise.all([
    activeOperations.count(ctx),
    activeSuppliers.count(ctx),
  ])
  return { operations: operations ?? 0, suppliers: suppliers ?? 0 }
}

/**
 * Re-evaluates time-bounded readiness so the current gauges cannot retain an
 * Operation after its readiness window expires without another publication.
 */
export const refresh = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ processed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const page = await ctx.db.query('capabilityPublications').paginate({
      cursor: args.cursor,
      numItems: PRESENCE_REFRESH_PAGE_SIZE,
    })
    for (const publication of page.page) {
      await syncMarketOperationPresence(ctx, {
        operationRef: publication.operationRef,
        businessId: publication.businessId,
        active: publication.disposition === 'current'
          && publication.credentialState === 'ready'
          && publication.healthState === 'healthy'
          && (publication.readinessValidUntil ?? 0) > now,
        now,
      })
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.marketPresence.refresh, { cursor: page.continueCursor })
    }
    return { processed: page.page.length, complete: page.isDone }
  },
})
