import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'

const obligationValue = v.object({
  obligationRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
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
    v.literal('settled'),
    v.literal('reversed'),
    v.literal('disputed'),
  ),
  payoutEligibility: v.literal('ineligible_x402'),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  settledAt: v.optional(v.number()),
})

export const listOwnerObligations = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(obligationValue),
  handler: async (ctx, args) => {
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
  },
})

export const markDisputed = internalMutation({
  args: { obligationRef: v.string(), evidenceRef: v.string(), observedAt: v.number() },
  returns: v.object({ kind: v.union(v.literal('disputed'), v.literal('replayed')), obligationRef: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (index) => index.eq('obligationRef', args.obligationRef))
      .unique()
    if (row === null) throw new Error('provider_obligation_not_found')
    if (row.payoutEligibility !== 'ineligible_x402') throw new Error('provider_obligation_payout_eligibility_invalid')
    if (row.state === 'disputed') return { kind: 'replayed' as const, obligationRef: row.obligationRef }
    if (row.state !== 'settled') throw new Error('provider_obligation_dispute_state_invalid')
    await ctx.db.patch(row._id, {
      state: 'disputed',
      evidenceRefs: [...row.evidenceRefs, args.evidenceRef].slice(-32),
      updatedAt: args.observedAt,
    })
    const call = await ctx.db.query('capabilityOperationCallProjections')
      .withIndex('by_callRef', (index) => index.eq('callRef', row.invocationRef))
      .unique()
    if (call !== null) await ctx.db.patch(call._id, {
      providerObligationState: 'disputed',
      updatedAt: args.observedAt,
    })
    return { kind: 'disputed' as const, obligationRef: row.obligationRef }
  },
})

export const resolveDispute = internalMutation({
  args: { obligationRef: v.string(), evidenceRef: v.string(), observedAt: v.number() },
  returns: v.object({ kind: v.union(v.literal('settled'), v.literal('replayed')), obligationRef: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (index) => index.eq('obligationRef', args.obligationRef))
      .unique()
    if (row === null) throw new Error('provider_obligation_not_found')
    if (row.state === 'settled') return { kind: 'replayed' as const, obligationRef: row.obligationRef }
    if (row.state !== 'disputed') throw new Error('provider_obligation_dispute_state_invalid')
    await ctx.db.patch(row._id, {
      state: 'settled',
      evidenceRefs: [...row.evidenceRefs, args.evidenceRef].slice(-32),
      updatedAt: args.observedAt,
    })
    const call = await ctx.db.query('capabilityOperationCallProjections')
      .withIndex('by_callRef', (index) => index.eq('callRef', row.invocationRef))
      .unique()
    if (call !== null) await ctx.db.patch(call._id, {
      providerObligationState: 'settled',
      updatedAt: args.observedAt,
    })
    return { kind: 'settled' as const, obligationRef: row.obligationRef }
  },
})
