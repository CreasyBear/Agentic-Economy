import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { upsertCallProjection, type OperationDispatchProjectionShape } from './lib/operationInvocations/dispatch'

const callValue = v.object({
  callRef: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  credentialRef: v.string(),
  operationRef: v.string(),
  providerRef: v.string(),
  operationLabel: v.string(),
  state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown')),
  deliveryState: v.union(v.literal('delivered'), v.literal('not_delivered'), v.literal('unknown')),
  paymentState: v.union(v.literal('settled'), v.literal('released'), v.literal('unknown'), v.literal('not_applicable')),
  providerObligationState: v.optional(v.union(
    v.literal('accrued'), v.literal('held'), v.literal('settled'), v.literal('reversed'), v.literal('disputed'),
  )),
  providerAmountUnits: v.optional(v.string()),
  audAmountUnits: v.optional(v.string()),
  receiptRef: v.optional(v.string()),
  recoveryRef: v.optional(v.string()),
  latencyMs: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const listOwnerCalls = query({
  args: {
    principalRef: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(callValue),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error('call_history_page_size_invalid')
    }
    const principalRef = args.principalRef
    const rows = principalRef === undefined
      ? ctx.db.query('capabilityOperationCallProjections')
          .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
      : ctx.db.query('capabilityOperationCallProjections')
          .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
            .eq('accountRef', actor.canonicalAccountRef)
            .eq('principalRef', principalRef))
    const page = await rows.order('desc').paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map(({ _id, _creationTime, ...call }) => call),
    }
  },
})

export const rebuild = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), rebuilt: v.number() }),
  handler: async (ctx, args) => {
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
      throw new Error('call_projection_rebuild_page_size_invalid')
    }
    const page = await ctx.db.query('capabilityOperationInvocations')
      .order('asc')
      .paginate(args.paginationOpts)
    let rebuilt = 0
    for (const row of page.page) {
      if (
        row.sellerOnboardingCanary !== undefined
        || row.result === undefined
        || row.dispatchState === undefined
        || row.state === 'pending'
        || row.state === 'cancelled'
      ) continue
      await upsertCallProjection(ctx, row, {
        state: row.state,
        result: row.result,
        ...(row.usage === undefined ? {} : { usage: row.usage }),
        ...(row.evidenceHash === undefined ? {} : { evidenceHash: row.evidenceHash }),
        ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
        dispatchState: row.dispatchState,
      } as OperationDispatchProjectionShape, row.updatedAt)
      rebuilt += 1
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, rebuilt }
  },
})
