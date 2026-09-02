import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '../src/modules/money/public'
import { parsePublishedOperationSnapshot } from '../src/modules/capability-supply/public'

const transactionRefsValue = v.array(v.string())
const bookingValue = v.object({
  invocationRef: v.string(),
  commitmentRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  operationRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  commitmentDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
})

function bookingFromRows(
  invocation: Doc<'capabilityOperationInvocations'>,
  commitment: Doc<'capabilityOperationCommitments'>,
) {
  const operation = parsePublishedOperationSnapshot(commitment.operationJson)
  if (operation === undefined
    || invocation.commitmentRef !== commitment.commitmentRef
    || invocation.ownerId !== commitment.accountRef
    || invocation.principalId !== commitment.principalId
    || invocation.operationRef !== commitment.operationRef
    || commitment.formanceSchemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
    || commitment.sourceUsdcUnits === undefined
    || commitment.x402RequirementDigest === undefined
    || commitment.rateEvidenceDigest === undefined
    || commitment.treasuryCustodyRef === undefined
    || commitment.treasuryCustodyGeneration === undefined
    || commitment.treasuryEvidenceDigest === undefined) return null
  return {
    invocationRef: invocation.invocationRef,
    commitmentRef: commitment.commitmentRef,
    idempotencyKey: invocation.idempotencyKey,
    accountRef: commitment.accountRef,
    principalRef: commitment.principalId,
    agentBudgetGeneration: commitment.budgetGeneration,
    legalCustomerRef: commitment.legalCustomerRef,
    legalCustomerGeneration: commitment.legalCustomerGeneration,
    treasuryRef: commitment.treasuryCustodyRef,
    treasuryGeneration: commitment.treasuryCustodyGeneration,
    operationRef: commitment.operationRef,
    providerRef: operation.identity.businessId,
    authorityGeneration: commitment.grantGeneration,
    policyGeneration: commitment.policyGeneration,
    buyerAmountUnits: commitment.decisionAudUnits,
    buyerRevenueUnits: commitment.buyerRevenueUnits,
    buyerTaxUnits: commitment.buyerTaxUnits,
    providerAmountUnits: commitment.sourceUsdcUnits,
    commitmentDigest: commitment.evidenceDigest,
    inputDigest: commitment.inputDigest,
    policyDigest: commitment.commercialPolicyDigest,
    rateEvidenceDigest: commitment.rateEvidenceDigest,
    treasuryEvidenceDigest: commitment.treasuryEvidenceDigest,
    x402RequirementDigest: commitment.x402RequirementDigest,
  }
}

async function loadRows(ctx: MutationCtx, invocationRef: string) {
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (invocation === null || invocation.commitmentRef === undefined) return null
  const commitment = await ctx.db.query('capabilityOperationCommitments')
    .withIndex('by_commitmentRef', (query) => query.eq('commitmentRef', invocation.commitmentRef!))
    .unique()
  return commitment === null ? null : { invocation, commitment }
}

export const readBooking = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(v.object({
    kind: v.literal('available'),
    booking: bookingValue,
    financialState: v.optional(v.union(
      v.literal('reservation_pending'),
      v.literal('reserved'),
      v.literal('possibly_submitted'),
      v.literal('outcome_unknown'),
      v.literal('released'),
      v.literal('settled'),
    )),
    reservationRefs: v.optional(transactionRefsValue),
    releaseRefs: v.optional(transactionRefsValue),
    settlementRefs: v.optional(transactionRefsValue),
    entryRefusalCode: v.optional(v.literal('financial_scope_locked')),
  }), v.object({ kind: v.literal('not_required') }), v.object({ kind: v.literal('not_found') })),
  handler: async (ctx, args) => {
    const invocation = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (invocation === null || invocation.commitmentRef === undefined) return { kind: 'not_found' as const }
    const commitment = await ctx.db.query('capabilityOperationCommitments')
      .withIndex('by_commitmentRef', (query) => query.eq('commitmentRef', invocation.commitmentRef!))
      .unique()
    if (commitment === null) return { kind: 'not_found' as const }
    const booking = bookingFromRows(invocation, commitment)
    if (booking === null) {
      return commitment.sourceUsdcUnits === undefined && commitment.decisionAudUnits === '0'
        ? { kind: 'not_required' as const }
        : { kind: 'not_found' as const }
    }
    const scopes = [
      ['account', booking.accountRef],
      ['legal_customer', booking.legalCustomerRef],
      ['treasury_pool', booking.treasuryRef],
      ['operation', booking.operationRef],
      ['provider_obligation', `provider-obligation:${booking.invocationRef}`],
    ] as const
    let financialScopeLocked = false
    for (const [scopeType, scopeRef] of scopes) {
      const openCase = await ctx.db.query('moneyReconciliationCases')
        .withIndex('by_scopeType_and_scopeRef_and_status', (index) => index
          .eq('scopeType', scopeType)
          .eq('scopeRef', scopeRef)
          .eq('status', 'open'))
        .first()
      if (openCase !== null) {
        financialScopeLocked = true
        break
      }
    }
    return {
      kind: 'available' as const,
      booking,
      ...(financialScopeLocked ? { entryRefusalCode: 'financial_scope_locked' as const } : {}),
      ...(invocation.formanceFinancialState === undefined
        ? {}
        : { financialState: invocation.formanceFinancialState }),
      ...(invocation.formanceReservationRefs === undefined
        ? {}
        : { reservationRefs: invocation.formanceReservationRefs }),
      ...(invocation.formanceReleaseRefs === undefined
        ? {}
        : { releaseRefs: invocation.formanceReleaseRefs }),
      ...(invocation.formanceSettlementRefs === undefined
        ? {}
        : { settlementRefs: invocation.formanceSettlementRefs }),
    }
  },
})

export const attachReservation = internalMutation({
  args: { invocationRef: v.string(), transactionRefs: transactionRefsValue },
  returns: v.union(
    v.object({ kind: v.literal('attached'), replayed: v.boolean() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const rows = await loadRows(ctx, args.invocationRef)
    if (rows === null || args.transactionRefs.length !== 3) {
      return { kind: 'refused' as const, code: 'formance_reservation_invalid' }
    }
    const digest = canonicalDigest({
      format: 'ae.formance-managed-call-reservation:v1',
      invocationRef: args.invocationRef,
      transactionRefs: args.transactionRefs,
    })
    if (rows.invocation.formanceReservationDigest !== undefined) {
      return rows.invocation.formanceReservationDigest === digest
        ? { kind: 'attached' as const, replayed: true }
        : { kind: 'refused' as const, code: 'formance_reservation_conflict' }
    }
    if (rows.invocation.state !== 'pending' || rows.commitment.state !== 'consumed') {
      return { kind: 'refused' as const, code: 'formance_reservation_state_conflict' }
    }
    const booking = bookingFromRows(rows.invocation, rows.commitment)
    if (booking === null) {
      return { kind: 'refused' as const, code: 'formance_reservation_material_invalid' }
    }
    const now = Date.now()
    const obligationRef = `provider-obligation:${args.invocationRef}`
    const existingObligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef))
      .unique()
    if (existingObligation !== null) {
      const sameObligation = existingObligation.invocationRef === args.invocationRef
        && existingObligation.operationRef === booking.operationRef
        && existingObligation.providerRef === booking.providerRef
        && existingObligation.buyerAccountRef === booking.accountRef
        && existingObligation.buyerAmountUnits === booking.buyerAmountUnits
        && existingObligation.providerAmountUnits === booking.providerAmountUnits
      if (!sameObligation) {
        return { kind: 'refused' as const, code: 'provider_obligation_identity_conflict' }
      }
    } else {
      await ctx.db.insert('moneyProviderObligations', {
        obligationRef,
        invocationRef: args.invocationRef,
        operationRef: booking.operationRef,
        providerRef: booking.providerRef,
        buyerAccountRef: booking.accountRef,
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: booking.buyerAmountUnits,
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: booking.providerAmountUnits,
        settlementMethod: 'managed_x402',
        state: 'accrued',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: [
          booking.commitmentRef,
          ...args.transactionRefs,
        ],
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.patch(rows.invocation._id, {
      formanceFinancialState: 'reserved',
      formanceReservationRefs: [...args.transactionRefs],
      formanceReservationDigest: digest,
      updatedAt: now,
    })
    return { kind: 'attached' as const, replayed: false }
  },
})

export const markReservationUnknown = internalMutation({
  args: { invocationRef: v.string(), reference: v.string(), statusRef: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await loadRows(ctx, args.invocationRef)
    if (rows === null) return false
    await ctx.db.patch(rows.invocation._id, {
      formanceFinancialState: 'outcome_unknown',
      formanceUnknownReference: args.reference,
      formanceUnknownStatusRef: args.statusRef,
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: rows.invocation.invocationRef,
        operationRef: rows.invocation.operationRef,
        evidence: {
          attemptRef: `formance-reservation:${rows.invocation.invocationRef}`,
          effectGeneration: 1,
          requiredAt: new Date().toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: args.statusRef,
        },
      },
      updatedAt: Date.now(),
    })
    return true
  },
})
