import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '../src/modules/money/public'
import { parsePublishedToolSnapshot } from '../src/modules/capability-supply/public'

const transactionRefsValue = v.array(v.string())
const bookingValue = v.object({
  callRef: v.string(),
  quoteRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  toolRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  quoteDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
})

function bookingFromRows(
  call: Doc<'capabilityCalls'>,
  quote: Doc<'capabilityQuotes'>,
) {
  const tool = parsePublishedToolSnapshot(quote.toolJson)
  if (tool === undefined
    || call.quoteRef !== quote.quoteRef
    || call.ownerId !== quote.accountRef
    || call.principalId !== quote.principalId
    || call.toolRef !== quote.toolRef
    || quote.formanceSchemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
    || quote.sourceUsdcUnits === undefined
    || quote.x402RequirementDigest === undefined
    || quote.rateEvidenceDigest === undefined
    || quote.treasuryCustodyRef === undefined
    || quote.treasuryCustodyGeneration === undefined
    || quote.treasuryEvidenceDigest === undefined) return null
  return {
    callRef: call.callRef,
    quoteRef: quote.quoteRef,
    idempotencyKey: call.idempotencyKey,
    accountRef: quote.accountRef,
    principalRef: quote.principalId,
    agentBudgetGeneration: quote.budgetGeneration,
    legalCustomerRef: quote.legalCustomerRef,
    legalCustomerGeneration: quote.legalCustomerGeneration,
    treasuryRef: quote.treasuryCustodyRef,
    treasuryGeneration: quote.treasuryCustodyGeneration,
    toolRef: quote.toolRef,
    providerRef: tool.identity.businessId,
    authorityGeneration: quote.grantGeneration,
    policyGeneration: quote.policyGeneration,
    buyerAmountUnits: quote.decisionAudUnits,
    buyerRevenueUnits: quote.buyerRevenueUnits,
    buyerTaxUnits: quote.buyerTaxUnits,
    providerAmountUnits: quote.sourceUsdcUnits,
    quoteDigest: quote.evidenceDigest,
    inputDigest: quote.inputDigest,
    policyDigest: quote.commercialPolicyDigest,
    rateEvidenceDigest: quote.rateEvidenceDigest,
    treasuryEvidenceDigest: quote.treasuryEvidenceDigest,
    x402RequirementDigest: quote.x402RequirementDigest,
  }
}

async function loadRows(ctx: MutationCtx, callRef: string) {
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (call === null || call.quoteRef === undefined) return null
  const quote = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', call.quoteRef!))
    .unique()
  return quote === null ? null : { call, quote }
}

export const readBooking = internalQuery({
  args: { callRef: v.string() },
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
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (call === null || call.quoteRef === undefined) return { kind: 'not_found' as const }
    const quote = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', call.quoteRef!))
      .unique()
    if (quote === null) return { kind: 'not_found' as const }
    const booking = bookingFromRows(call, quote)
    if (booking === null) {
      return quote.sourceUsdcUnits === undefined && quote.decisionAudUnits === '0'
        ? { kind: 'not_required' as const }
        : { kind: 'not_found' as const }
    }
    const scopes = [
      ['account', booking.accountRef],
      ['legal_customer', booking.legalCustomerRef],
      ['treasury_pool', booking.treasuryRef],
      ['tool', booking.toolRef],
      ['provider_obligation', `provider-obligation:${booking.callRef}`],
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
      ...(call.formanceFinancialState === undefined
        ? {}
        : { financialState: call.formanceFinancialState }),
      ...(call.formanceReservationRefs === undefined
        ? {}
        : { reservationRefs: call.formanceReservationRefs }),
      ...(call.formanceReleaseRefs === undefined
        ? {}
        : { releaseRefs: call.formanceReleaseRefs }),
      ...(call.formanceSettlementRefs === undefined
        ? {}
        : { settlementRefs: call.formanceSettlementRefs }),
    }
  },
})

export const attachReservation = internalMutation({
  args: { callRef: v.string(), transactionRefs: transactionRefsValue },
  returns: v.union(
    v.object({ kind: v.literal('attached'), replayed: v.boolean() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const rows = await loadRows(ctx, args.callRef)
    if (rows === null || args.transactionRefs.length !== 3) {
      return { kind: 'refused' as const, code: 'formance_reservation_invalid' }
    }
    const digest = canonicalDigest({
      format: 'ae.formance-managed-call-reservation:v1',
      callRef: args.callRef,
      transactionRefs: args.transactionRefs,
    })
    if (rows.call.formanceReservationDigest !== undefined) {
      return rows.call.formanceReservationDigest === digest
        ? { kind: 'attached' as const, replayed: true }
        : { kind: 'refused' as const, code: 'formance_reservation_conflict' }
    }
    if (rows.call.state !== 'pending' || rows.quote.state !== 'consumed') {
      return { kind: 'refused' as const, code: 'formance_reservation_state_conflict' }
    }
    const booking = bookingFromRows(rows.call, rows.quote)
    if (booking === null) {
      return { kind: 'refused' as const, code: 'formance_reservation_material_invalid' }
    }
    const now = Date.now()
    const obligationRef = `provider-obligation:${args.callRef}`
    const existingObligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef))
      .unique()
    if (existingObligation !== null) {
      const sameObligation = existingObligation.callRef === args.callRef
        && existingObligation.toolRef === booking.toolRef
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
        callRef: args.callRef,
        toolRef: booking.toolRef,
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
          booking.quoteRef,
          ...args.transactionRefs,
        ],
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.patch(rows.call._id, {
      formanceFinancialState: 'reserved',
      formanceReservationRefs: [...args.transactionRefs],
      formanceReservationDigest: digest,
      updatedAt: now,
    })
    return { kind: 'attached' as const, replayed: false }
  },
})

export const markReservationUnknown = internalMutation({
  args: { callRef: v.string(), reference: v.string(), statusRef: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const rows = await loadRows(ctx, args.callRef)
    if (rows === null) return false
    await ctx.db.patch(rows.call._id, {
      formanceFinancialState: 'outcome_unknown',
      formanceUnknownReference: args.reference,
      formanceUnknownStatusRef: args.statusRef,
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        callRef: rows.call.callRef,
        toolRef: rows.call.toolRef,
        evidence: {
          attemptRef: `formance-reservation:${rows.call.callRef}`,
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
