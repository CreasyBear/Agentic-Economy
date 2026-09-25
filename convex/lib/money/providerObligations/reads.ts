import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

const obligationValue = v.object({
  obligationRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  providerRef: v.string(),
  buyerAccountRef: v.string(),
  buyerAsset: v.literal('AUD'),
  buyerExponent: v.literal(6),
  buyerAmountUnits: v.string(),
  providerAsset: v.literal('USDC'),
  providerExponent: v.literal(6),
  providerAmountUnits: v.string(),
  settlementMethod: v.literal('managed_x402'),
  state: v.union(
    v.literal('accrued'),
    v.literal('held'),
    v.literal('payable'),
    v.literal('settled'),
    v.literal('reversed'),
    v.literal('disputed'),
  ),
  payoutEligibility: v.literal('ineligible_x402'),
  evidenceRefs: v.array(v.string()),
  settlementTransactionRef: v.optional(v.string()),
  reversalCommandRef: v.optional(v.string()),
  reversalIdempotencyKey: v.optional(v.string()),
  reversalEvidenceDigest: v.optional(v.string()),
  reversalState: v.optional(v.union(
    v.literal('pending'), v.literal('succeeded'), v.literal('outcome_unknown'),
  )),
  reversalTransactionRef: v.optional(v.string()),
  reversalStatusRef: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  settledAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
})

export const listOwnerObligationsArgs = { paginationOpts: paginationOptsValidator }
export const listOwnerObligationsResult = paginationResultValidator(obligationValue)
export const listOwnerObligationsHandler = async (ctx: QueryCtx, args: { paginationOpts: Infer<typeof paginationOptsValidator> }) => {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('provider_obligation_authentication_required')
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
    throw new Error('provider_obligation_page_size_invalid')
  }
  const page = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_buyerAccountRef_and_createdAt', (index) => index
      .eq('buyerAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .paginate(args.paginationOpts)
  return {
    ...page,
    page: page.page.map(({ _id, _creationTime, ...row }) => row),
  }
}
