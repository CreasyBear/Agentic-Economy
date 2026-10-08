import { v, type Infer } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

export const ownerProviderEarningsArgs = {}
const obligationValue = v.object({
  obligationRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  currency: v.literal('USDC'),
  exponent: v.literal(6),
  amountUnits: v.string(),
  state: v.union(
    v.literal('accrued'), v.literal('held'), v.literal('payable'),
    v.literal('settled'), v.literal('reversed'), v.literal('disputed'),
  ),
  settlementTransactionRef: v.optional(v.string()),
  createdAt: v.number(),
  settledAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
})
const transferValue = v.object({
  payoutRef: v.string(),
  currency: v.string(),
  exponent: v.number(),
  amountUnits: v.string(),
  state: v.union(
    v.literal('review'), v.literal('held_kyc'), v.literal('held_threshold'),
    v.literal('transfer_pending'), v.literal('paid'), v.literal('reversed'),
    v.literal('failed'), v.literal('outcome_unknown'),
  ),
  transferStatus: v.optional(v.union(
    v.literal('pending'), v.literal('succeeded'), v.literal('failed'),
    v.literal('reversed'), v.literal('outcome_unknown'),
  )),
  stripeTransferId: v.optional(v.string()),
  transferEvidenceDigest: v.optional(v.string()),
  transferObservedAt: v.optional(v.number()),
  createdAt: v.number(),
})
export const ownerProviderEarningsResultValue = v.union(
  v.object({ kind: v.literal('available'), businessId: v.string(), obligations: v.array(obligationValue), truncated: v.boolean(), transfers: v.array(transferValue), transfersTruncated: v.boolean() }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict'), code: v.union(v.literal('multiple_businesses'), v.literal('payout_owner_mismatch')) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)
export const agentProviderEarningsArgs = {
  agentPrincipal: agentAccessPrincipalValue,
  currency: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
export const agentProviderEarningsResultValue = v.object({
  kind: v.literal('error'),
  code: v.literal('capability_unsupported'),
  capability: v.literal('supply.earnings'),
  retryable: v.literal(false),
  detail: v.literal('Agent Provider earnings readback is not supported. The Business owner can review recorded Provider obligations in the owner earnings view.'),
})

export async function readOwnerProviderEarningsHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc').take(2)
  if (businesses.length === 0) return { kind: 'not_found' as const }
  if (businesses.length > 1) return { kind: 'conflict' as const, code: 'multiple_businesses' as const }
  const business = businesses[0]
  if (business === undefined) return { kind: 'not_found' as const }
  const rows = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_providerRef_and_createdAt', (query) => query.eq('providerRef', business._id))
    .order('desc').take(101)
  return {
    kind: 'available' as const,
    businessId: business._id,
    truncated: rows.length > 100,
    transfersTruncated: false,
    transfers: [],
    obligations: rows.slice(0, 100).map(ownerObligation),
  }
}

export async function readAgentProviderEarningsHandler() {
  return {
    kind: 'error' as const,
    code: 'capability_unsupported' as const,
    capability: 'supply.earnings' as const,
    retryable: false as const,
    detail: 'Agent Provider earnings readback is not supported. The Business owner can review recorded Provider obligations in the owner earnings view.' as const,
  }
}

function ownerObligation(row: Doc<'moneyProviderObligations'>) {
  return {
      obligationRef: row.obligationRef,
      callRef: row.callRef,
      toolRef: row.toolRef,
      currency: row.providerAsset,
      exponent: row.providerExponent,
      amountUnits: row.providerAmountUnits,
      state: row.state,
      ...(row.settlementTransactionRef === undefined ? {} : { settlementTransactionRef: row.settlementTransactionRef }),
      createdAt: row.createdAt,
      ...(row.settledAt === undefined ? {} : { settledAt: row.settledAt }),
      ...(row.reversedAt === undefined ? {} : { reversedAt: row.reversedAt }),
  }
}

export const ownerProviderEarningsPageArgs = { paginationOpts: paginationOptsValidator }
export const ownerProviderEarningsPageResultValue = v.union(
  v.object({ kind: v.literal('available'), businessId: v.string(), obligations: v.array(obligationValue), truncated: v.boolean(), transfers: v.array(transferValue), transfersTruncated: v.boolean(), isDone: v.boolean(), continueCursor: v.string() }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict'), code: v.union(v.literal('multiple_businesses'), v.literal('payout_owner_mismatch')) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

export async function readOwnerProviderEarningsPageHandler(ctx: QueryCtx, args: { paginationOpts: Infer<typeof paginationOptsValidator> }) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', query => query.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc').take(2)
  if (businesses.length > 1) return { kind: 'conflict' as const, code: 'multiple_businesses' as const }
  const business = businesses[0]
  if (business === undefined) return { kind: 'not_found' as const }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new Error('provider_earnings_page_size_invalid')
  const page = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_providerRef_and_createdAt', query => query.eq('providerRef', business._id))
    .order('desc').paginate(args.paginationOpts)
  return { kind: 'available' as const, businessId: business._id, obligations: page.page.map(ownerObligation),
    truncated: !page.isDone, transfers: [], transfersTruncated: false, isDone: page.isDone, continueCursor: page.continueCursor }
}
