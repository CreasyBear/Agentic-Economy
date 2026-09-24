import { v } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { resolveAndBindLegalCustomer } from '../legalCustomer/binding'
import { correlationStorageRef, requireStripeAccountContext, validateCorrelationRef } from './authority'

const STRIPE_CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9_]+$/u

export const upsertStripeCustomerBindingArgs = {
    stripeCustomerId: v.string(),
    correlationRef: v.string(),
    idempotencyRef: v.string(),
}

export const upsertStripeCustomerBindingResult = v.union(
  v.object({ kind: v.literal('updated'), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), revision: v.number() }),
)

type UpsertStripeCustomerBindingReceipt = Readonly<
  | { kind: 'updated'; revision: number }
  | { kind: 'replayed'; revision: number }
>

type UpsertStripeCustomerBindingArgs = Readonly<{
  stripeCustomerId: string
  correlationRef: string
  idempotencyRef: string
}>

function validateStripeCustomerId(value: string): void {
  if (!STRIPE_CUSTOMER_ID_PATTERN.test(value)) throw new InteractiveAuthorityError('payment_binding_invalid')
}


export async function upsertStripeCustomerBindingHandler(ctx: MutationCtx, args: UpsertStripeCustomerBindingArgs): Promise<UpsertStripeCustomerBindingReceipt> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireStripeAccountContext(ctx.db, identity)

    validateCorrelationRef(args.correlationRef)
    validateStripeCustomerId(args.stripeCustomerId)

    const existing = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()

    const currentRevision = existing?.revision ?? 0
    const correlationMarker = correlationStorageRef(args.correlationRef)

    if (
      existing !== null
      && existing.setupExternalRef === correlationMarker
      && existing.stripeCustomerId === args.stripeCustomerId
    ) {
      return { kind: 'replayed', revision: currentRevision }
    }

    const now = Date.now()
    const legalCustomerResult = await resolveAndBindLegalCustomer(ctx, canonicalAccountRef, now)
    if (legalCustomerResult.kind === 'refused') {
      throw new InteractiveAuthorityError(legalCustomerResult.code)
    }
    const legalCustomerRef = legalCustomerResult.legalCustomerRef

    const nextRevision = currentRevision + 1

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        legalCustomerRef,
        mandateState: 'missing',
        revision: nextRevision,
        setupExternalRef: correlationMarker,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('moneyStripeCustomerBindings', {
        accountRef: canonicalAccountRef,
        legalCustomerRef,
        stripeCustomerId: args.stripeCustomerId,
        mandateState: 'missing',
        revision: nextRevision,
        setupExternalRef: correlationMarker,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { kind: 'updated', revision: nextRevision }
}
