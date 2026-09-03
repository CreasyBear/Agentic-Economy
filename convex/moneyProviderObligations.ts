import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalMutation, query, type MutationCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { clerkConsequenceProofValue } from './lib/consequenceProof'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import type { MoneyFormanceManagedCallBooking, MoneyFormanceResult } from './moneyFormance'

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

const providerReversalArgsValue = v.object({
  obligationRef: v.string(),
  invocationRef: v.string(),
  settlementTransactionRef: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  expectedUpdatedAt: v.number(),
  confirmation: v.string(),
  commandRef: v.string(),
  idempotencyKey: v.string(),
  proof: v.optional(clerkConsequenceProofValue),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
const providerReversalResultValue = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    obligationRef: v.string(),
    transactionRef: v.string(),
  }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.literal(false) }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.string(),
    submissionProvenAbsent: v.literal(true),
  }),
  v.object({ kind: v.literal('outcome_unknown'), reference: v.string(), statusRef: v.string() }),
)
const prepareProviderReversalResultValue = v.union(
  v.object({ kind: v.literal('prepared') }),
  providerReversalResultValue,
)

type ProviderReversalArgs = Infer<typeof providerReversalArgsValue>
type ProviderReversalResult = Infer<typeof providerReversalResultValue>
type ManagedCallMaterial = Readonly<
  | {
      kind: 'available'
      booking: MoneyFormanceManagedCallBooking
      financialState?: 'reservation_pending' | 'reserved' | 'possibly_submitted'
        | 'outcome_unknown' | 'released' | 'settled'
      settlementRefs?: string[]
    }
  | { kind: 'not_found' | 'not_required' }
>

const BOUNDED_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const SHA256 = /^sha256:[a-f0-9]{64}$/u

function reversalRefused(code: string): ProviderReversalResult {
  return { kind: 'refused', code, retryable: false }
}

async function markProviderObligationDisputed(
  ctx: MutationCtx,
  row: NonNullable<Awaited<ReturnType<typeof readObligation>>>,
  args: Readonly<{ evidenceRef: string }>,
): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'disputed',
    evidenceRefs: [...new Set([...row.evidenceRefs, args.evidenceRef])].slice(-32),
    updatedAt: Date.now(),
  })
  const call = await ctx.db.query('capabilityOperationCallProjections')
    .withIndex('by_callRef', (index) => index.eq('callRef', row.invocationRef))
    .unique()
  if (call !== null) await ctx.db.patch(call._id, {
    providerObligationState: 'disputed',
    updatedAt: Date.now(),
  })
}

async function readObligation(ctx: MutationCtx, obligationRef: string) {
  return await ctx.db.query('moneyProviderObligations')
    .withIndex('by_obligationRef', (index) => index.eq('obligationRef', obligationRef))
    .unique()
}

async function prepareProviderReversal(
  ctx: MutationCtx,
  args: ProviderReversalArgs,
): Promise<Infer<typeof prepareProviderReversalResultValue>> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'billing')
  if (sourceWrite.kind === 'rejected') return reversalRefused('source_write_denied')
  if (![args.obligationRef, args.invocationRef, args.settlementTransactionRef,
    args.evidenceRef, args.commandRef, args.idempotencyKey].every((value) => BOUNDED_REF.test(value))
    || !SHA256.test(args.evidenceDigest)
    || !Number.isSafeInteger(args.expectedUpdatedAt)
    || args.expectedUpdatedAt < 0
    || args.confirmation !== args.obligationRef) {
    return reversalRefused('provider_reversal_input_invalid')
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return reversalRefused('authentication_required')
  const row = await readObligation(ctx, args.obligationRef)
  if (row === null
    || row.buyerAccountRef !== actor.canonicalAccountRef
    || row.invocationRef !== args.invocationRef
    || row.settlementTransactionRef !== args.settlementTransactionRef
    || row.payoutEligibility !== 'ineligible_x402') {
    return reversalRefused('provider_obligation_not_found')
  }
  if (row.state === 'reversed') {
    const sameRequest = row.reversalCommandRef === args.commandRef
      && row.reversalIdempotencyKey === args.idempotencyKey
      && row.reversalEvidenceDigest === args.evidenceDigest
      && row.reversalTransactionRef !== undefined
    if (sameRequest) return {
      kind: 'replayed',
      obligationRef: row.obligationRef,
      transactionRef: row.reversalTransactionRef!,
    }
    await markProviderObligationDisputed(ctx, row, args)
    return reversalRefused('provider_reversal_conflict')
  }
  if (row.reversalState !== undefined) {
    const sameRequest = row.reversalCommandRef === args.commandRef
      && row.reversalIdempotencyKey === args.idempotencyKey
      && row.reversalEvidenceDigest === args.evidenceDigest
    if (sameRequest) return { kind: 'prepared' }
    await markProviderObligationDisputed(ctx, row, args)
    return reversalRefused('provider_reversal_conflict')
  }
  if (row.state !== 'settled' || row.updatedAt !== args.expectedUpdatedAt) {
    return reversalRefused('provider_reversal_state_changed')
  }
  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'provider_obligation.reverse',
    target: {
      targetType: 'provider_obligation',
      targetRef: row.obligationRef,
      targetRevision: Math.max(1, row.updatedAt),
    },
    requiredScopes: ['billing'],
    resourceRefs: [`provider-obligation:${row.obligationRef}`],
    budgetAmount: 0,
    consequenceSummary: `Reverse the settled Provider obligation ${row.obligationRef}.`,
    statusReadbackRef: '/owner/credit',
    command: {
      version: 'ae.provider-obligation-reversal:v1',
      obligationRef: row.obligationRef,
      invocationRef: row.invocationRef,
      settlementTransactionRef: row.settlementTransactionRef,
      providerAmountUnits: row.providerAmountUnits,
      evidenceRef: args.evidenceRef,
      evidenceDigest: args.evidenceDigest,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now: Date.now(),
  })
  if (consequence.kind === 'refused') return reversalRefused(consequence.code)
  await ctx.db.patch(row._id, {
    reversalCommandRef: args.commandRef,
    reversalIdempotencyKey: args.idempotencyKey,
    reversalEvidenceDigest: args.evidenceDigest,
    reversalState: 'pending',
    evidenceRefs: [...new Set([...row.evidenceRefs, args.evidenceRef])].slice(-32),
    updatedAt: Date.now(),
  })
  return { kind: 'prepared' }
}

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

export const prepareOwnerReversal = internalMutation({
  args: providerReversalArgsValue.fields,
  returns: prepareProviderReversalResultValue,
  handler: prepareProviderReversal,
})

export const reverseOwnerSettlement = action({
  args: providerReversalArgsValue.fields,
  returns: providerReversalResultValue,
  handler: async (ctx, args): Promise<ProviderReversalResult> => {
    const prepared = await ctx.runMutation(internal.moneyProviderObligations.prepareOwnerReversal, args)
    if (prepared.kind !== 'prepared') return prepared
    const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
      invocationRef: args.invocationRef,
    })
    if (material.kind !== 'available'
      || material.financialState !== 'settled'
      || material.settlementRefs?.[1] !== args.settlementTransactionRef) {
      return reversalRefused('provider_settlement_evidence_invalid')
    }
    const result: MoneyFormanceResult = await ctx.runAction(
      internal.moneyFormance.reverseProviderSettlement,
      {
        booking: material.booking,
        originalSettlementRef: args.settlementTransactionRef,
        correctionEvidenceDigest: args.evidenceDigest,
      },
    )
    if (result.kind === 'completed') {
      if (result.transactionRefs.length !== 1) {
        return reversalRefused('formance_reference_invalid')
      }
      return await ctx.runMutation(internal.moneyProviderObligations.finalizeOwnerReversal, {
        obligationRef: args.obligationRef,
        invocationRef: args.invocationRef,
        commandRef: args.commandRef,
        idempotencyKey: args.idempotencyKey,
        evidenceRef: args.evidenceRef,
        evidenceDigest: args.evidenceDigest,
        settlementTransactionRef: args.settlementTransactionRef,
        reversalTransactionRef: result.transactionRefs[0]!,
      })
    }
    if (result.kind === 'outcome_unknown') {
      await ctx.runMutation(internal.moneyProviderObligations.markOwnerReversalUnknown, {
        obligationRef: args.obligationRef,
        commandRef: args.commandRef,
        evidenceDigest: args.evidenceDigest,
        statusRef: result.statusRef,
      })
      return result
    }
    return result
  },
})

export const finalizeOwnerReversal = internalMutation({
  args: {
    obligationRef: v.string(),
    invocationRef: v.string(),
    commandRef: v.string(),
    idempotencyKey: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    settlementTransactionRef: v.string(),
    reversalTransactionRef: v.string(),
  },
  returns: providerReversalResultValue,
  handler: async (ctx, args): Promise<ProviderReversalResult> => {
    const row = await readObligation(ctx, args.obligationRef)
    if (row === null
      || row.invocationRef !== args.invocationRef
      || row.settlementTransactionRef !== args.settlementTransactionRef) {
      return reversalRefused('provider_obligation_not_found')
    }
    if (row.state === 'reversed') {
      return row.reversalTransactionRef === args.reversalTransactionRef
        && row.reversalCommandRef === args.commandRef
        && row.reversalEvidenceDigest === args.evidenceDigest
        ? { kind: 'replayed', obligationRef: row.obligationRef, transactionRef: args.reversalTransactionRef }
        : reversalRefused('provider_reversal_conflict')
    }
    if (row.state !== 'settled'
      || row.reversalState !== 'pending'
      || row.reversalCommandRef !== args.commandRef
      || row.reversalIdempotencyKey !== args.idempotencyKey
      || row.reversalEvidenceDigest !== args.evidenceDigest) {
      await markProviderObligationDisputed(ctx, row, args)
      return reversalRefused('provider_reversal_conflict')
    }
    const now = Date.now()
    await ctx.db.patch(row._id, {
      state: 'reversed',
      reversalState: 'succeeded',
      reversalTransactionRef: args.reversalTransactionRef,
      evidenceRefs: [...new Set([
        ...row.evidenceRefs,
        args.evidenceRef,
        args.reversalTransactionRef,
      ])].slice(-32),
      reversedAt: now,
      updatedAt: now,
    })
    const call = await ctx.db.query('capabilityOperationCallProjections')
      .withIndex('by_callRef', (index) => index.eq('callRef', row.invocationRef))
      .unique()
    if (call !== null) await ctx.db.patch(call._id, {
      providerObligationState: 'reversed',
      updatedAt: now,
    })
    return { kind: 'completed', obligationRef: row.obligationRef, transactionRef: args.reversalTransactionRef }
  },
})

export const markOwnerReversalUnknown = internalMutation({
  args: {
    obligationRef: v.string(),
    commandRef: v.string(),
    evidenceDigest: v.string(),
    statusRef: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await readObligation(ctx, args.obligationRef)
    if (row !== null
      && row.state === 'settled'
      && row.reversalCommandRef === args.commandRef
      && row.reversalEvidenceDigest === args.evidenceDigest) {
      await ctx.db.patch(row._id, {
        reversalState: 'outcome_unknown',
        reversalStatusRef: args.statusRef,
        updatedAt: Date.now(),
      })
    }
    return null
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
