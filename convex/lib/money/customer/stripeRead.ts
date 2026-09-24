import { v, type Infer } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { requireStripeAccountContext } from './authority'

export const readStripeCustomerBindingArgs = {}
export const readStripeCustomerBindingResult = v.object({
  accountRef: v.string(),
  binding: v.union(
    v.null(),
    v.object({
      legalCustomerRef: v.string(),
      stripeCustomerId: v.string(),
      mandateState: v.union(
        v.literal('missing'),
        v.literal('ready'),
        v.literal('authentication_required'),
        v.literal('failed'),
      ),
      revision: v.number(),
    }),
  ),
})

export async function readStripeCustomerBindingHandler(ctx: QueryCtx): Promise<Infer<typeof readStripeCustomerBindingResult>> {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef } = await requireStripeAccountContext(ctx.db, identity)
    const row = await ctx.db
      .query('moneyStripeCustomerBindings')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
      .unique()
    if (row === null) {
      return { accountRef: canonicalAccountRef, binding: null }
    }
    return {
      accountRef: canonicalAccountRef,
      binding: {
        legalCustomerRef: row.legalCustomerRef,
        stripeCustomerId: row.stripeCustomerId,
        mandateState: row.mandateState,
        revision: row.revision,
    }
    }
}
