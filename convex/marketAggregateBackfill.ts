import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from './workloadCron'
import { recordMarketEvidenceFact } from './marketEvidence'
import { syncMarketOperationPresence } from './marketPresence'

const projectionValue = v.union(
  v.literal('invocations'),
  v.literal('qualified_uses'),
  v.literal('x402_settlements'),
  v.literal('operation_presence'),
)
type Projection = 'invocations' | 'qualified_uses' | 'x402_settlements' | 'operation_presence'
const projections: readonly Projection[] = ['invocations', 'qualified_uses', 'x402_settlements', 'operation_presence']
const PAGE_SIZE = 20

export const run = internalMutation({
  args: { workload: v.optional(workloadCronSnapshotValue) },
  returns: v.object({ projection: v.union(projectionValue, v.null()), processed: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.workload !== undefined) {
      await reconcileWorkloadCronSnapshot(
        ctx,
        'continue market aggregate backfill',
        parseWorkloadCronSnapshot(args.workload),
      )
    }
    const states = await ctx.db.query('marketAggregateBackfills').take(projections.length)
    const stateByProjection = new Map(states.map((state) => [state.projection, state]))
    const projection = projections.find((candidate) => stateByProjection.get(candidate)?.completedAt === undefined)
    if (projection === undefined) return { projection: null, processed: 0, complete: true }
    const state = stateByProjection.get(projection)
    const result = await processPage(ctx, projection, state?.cursor ?? null)
    const now = Date.now()
    if (state === undefined) {
      await ctx.db.insert('marketAggregateBackfills', {
        projection,
        ...(result.isDone ? { completedAt: now } : { cursor: result.continueCursor }),
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(state._id, {
        cursor: result.isDone ? undefined : result.continueCursor,
        completedAt: result.isDone ? now : undefined,
        updatedAt: now,
      })
    }
    if (!result.isDone || projection !== projections.at(-1)) {
      await ctx.scheduler.runAfter(0, internal.workloadCron.continueMarketAggregateBackfill, {})
    }
    return { projection, processed: result.processed, complete: result.isDone && projection === projections.at(-1) }
  },
})

async function processPage(ctx: Parameters<typeof recordMarketEvidenceFact>[0], projection: Projection, cursor: string | null) {
  if (projection === 'invocations') {
    const page = await ctx.db.query('capabilityOperationInvocations').paginate({ cursor, numItems: PAGE_SIZE })
    for (const row of page.page) {
      await recordMarketEvidenceFact(ctx, 'ae_invocation', row.invocationRef, row.createdAt)
      if (row.state === 'completed') await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.invocationRef, row.updatedAt)
      if (row.state === 'reconciliation_required') await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', row.invocationRef, row.updatedAt)
    }
    return { ...page, processed: page.page.length }
  }
  if (projection === 'qualified_uses') {
    const page = await ctx.db.query('qualifiedUseReceipts').paginate({ cursor, numItems: PAGE_SIZE })
    for (const row of page.page) await recordMarketEvidenceFact(ctx, 'ae_qualified_use', row.qualifiedUseRef, row.qualifiedAt)
    return { ...page, processed: page.page.length }
  }
  if (projection === 'x402_settlements') {
    const page = await ctx.db.query('moneyX402PaymentAttempts').paginate({ cursor, numItems: PAGE_SIZE })
    for (const row of page.page) {
      const sourceRef = `${row.attemptRef}:${row.effectGeneration}`
      const occurredAt = row.observedAt ?? row.preparedAt
      if (row.settlementStatus === 'settled') await recordMarketEvidenceFact(ctx, 'ae_settlement', sourceRef, occurredAt)
      if (row.state === 'reconciliation_required' || row.settlementStatus === 'unknown') await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', sourceRef, occurredAt)
    }
    return { ...page, processed: page.page.length }
  }
  const now = Date.now()
  const page = await ctx.db.query('capabilityPublications').paginate({ cursor, numItems: PAGE_SIZE })
  for (const row of page.page) await syncMarketOperationPresence(ctx, {
    operationRef: row.operationRef,
    businessId: row.businessId,
    active: row.disposition === 'current' && row.credentialState === 'ready' && row.healthState === 'healthy' && (row.readinessValidUntil ?? 0) > now,
    now,
  })
  return { ...page, processed: page.page.length }
}
