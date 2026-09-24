import { v } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { correlationStorageRef, requireStripeAccountContext, validateCorrelationRef } from './authority'

export const observeStripePaymentMandateArgs = {
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
    expectedRevision: v.number(),
}

export const observeStripePaymentMandateResult = v.union(
  v.object({
    kind: v.literal('updated'),
    revision: v.number(),
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
  }),
  v.object({
    kind: v.literal('replayed'),
    revision: v.number(),
    mandateState: v.union(v.literal('ready'), v.literal('missing')),
  }),
)

type ObserveStripePaymentMandateReceipt = Readonly<
  | { kind: 'updated'; revision: number; mandateState: 'ready' | 'missing' }
  | { kind: 'replayed'; revision: number; mandateState: 'ready' | 'missing' }
>

type ObserveStripePaymentMandateArgs = Readonly<{
  mandateState: 'ready' | 'missing'
  correlationRef: string
  idempotencyRef: string
  expectedRevision: number
}>

export async function observeStripePaymentMandateHandler(ctx: MutationCtx, args: ObserveStripePaymentMandateArgs): Promise<ObserveStripePaymentMandateReceipt> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireStripeAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)

    const existing = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (existing === null) {
      throw new InteractiveAuthorityError('payment_binding_invalid')
    }

    const correlationMarker = correlationStorageRef(args.correlationRef)
    if (
      existing.setupExternalRef === correlationMarker
      && existing.mandateState === args.mandateState
    ) {
      return {
        kind: 'replayed',
        revision: existing.revision,
        mandateState: args.mandateState,
      }
    }

    if (args.expectedRevision !== existing.revision) {
      throw new InteractiveAuthorityError('payment_binding_revision_conflict')
    }

    const nextRevision = existing.revision + 1
    const now = Date.now()
    await ctx.db.patch(existing._id, {
      mandateState: args.mandateState,
      revision: nextRevision,
      setupExternalRef: correlationMarker,
      updatedAt: now,
    })

    return {
      kind: 'updated',
      revision: nextRevision,
      mandateState: args.mandateState,
    }
}
