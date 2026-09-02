import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import type {
  MoneyFormanceManagedCallBooking,
  MoneyFormanceResult,
} from './moneyFormance'

type TransitionResult =
  | { kind: 'accepted'; state: string; replayed: boolean }
  | { kind: 'refused'; code: string }

type ManagedCallMaterial =
  | {
      kind: 'available'
      booking: MoneyFormanceManagedCallBooking
      financialState?: 'reservation_pending' | 'reserved' | 'possibly_submitted'
        | 'outcome_unknown' | 'released' | 'settled'
      reservationRefs?: string[]
      releaseRefs?: string[]
      settlementRefs?: string[]
    }
  | { kind: 'not_found' }

const transitionResult = v.union(
  v.object({ kind: v.literal('accepted'), state: v.string(), replayed: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

export const readReservation = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(v.object({
    reservationRef: v.string(),
    commitmentRef: v.string(),
    decisionAudUnits: v.string(),
    journalTransactionRef: v.string(),
    treasuryReservationRef: v.optional(v.string()),
    state: v.string(),
  }), v.null()),
  handler: async (ctx, args) => {
    const invocation = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (invocation === null
      || invocation.commitmentRef === undefined
      || invocation.formanceReservationRefs === undefined) return null
    const commitment = await ctx.db.query('capabilityOperationCommitments')
      .withIndex('by_commitmentRef', (query) => query.eq('commitmentRef', invocation.commitmentRef!))
      .unique()
    if (commitment === null) return null
    const [audRef, usdcRef] = invocation.formanceReservationRefs
    if (audRef === undefined || usdcRef === undefined) return null
    return {
      reservationRef: audRef,
      commitmentRef: commitment.commitmentRef,
      decisionAudUnits: commitment.decisionAudUnits,
      journalTransactionRef: audRef,
      treasuryReservationRef: usdcRef,
      state: invocation.formanceFinancialState ?? 'reservation_pending',
    }
  },
})

export const markPossiblySubmitted = internalMutation({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (row === null || row.formanceReservationRefs === undefined) {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (row.formanceFinancialState === 'possibly_submitted'
      || row.formanceFinancialState === 'outcome_unknown') {
      return { kind: 'accepted' as const, state: row.formanceFinancialState, replayed: true }
    }
    if (row.formanceFinancialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'possibly_submitted',
      updatedAt: args.now,
    })
    return { kind: 'accepted' as const, state: 'possibly_submitted', replayed: false }
  },
})

export const markOutcomeUnknown = internalMutation({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (row === null || row.formanceReservationRefs === undefined) {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (row.formanceFinancialState === 'outcome_unknown') {
      return { kind: 'accepted' as const, state: 'outcome_unknown', replayed: true }
    }
    if (row.formanceFinancialState !== 'reserved'
      && row.formanceFinancialState !== 'possibly_submitted') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'outcome_unknown',
      updatedAt: args.now,
    })
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (obligation !== null) await ctx.db.patch(obligation._id, { state: 'held', updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'outcome_unknown', replayed: false }
  },
})

export const finalizeRelease = internalMutation({
  args: { invocationRef: v.string(), transactionRefs: v.array(v.string()), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (row === null || args.transactionRefs.length !== 2) {
      return { kind: 'refused' as const, code: 'managed_call_release_invalid' }
    }
    if (row.formanceFinancialState === 'released') {
      return JSON.stringify(row.formanceReleaseRefs) === JSON.stringify(args.transactionRefs)
        ? { kind: 'accepted' as const, state: 'released', replayed: true }
        : { kind: 'refused' as const, code: 'managed_call_release_conflict' }
    }
    if (row.formanceFinancialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'released',
      formanceReleaseRefs: [...args.transactionRefs],
      updatedAt: args.now,
    })
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (obligation !== null) await ctx.db.patch(obligation._id, { state: 'reversed', updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'released', replayed: false }
  },
})

export const finalizeSettlement = internalMutation({
  args: { invocationRef: v.string(), transactionRefs: v.array(v.string()), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (row === null || args.transactionRefs.length !== 2) {
      return { kind: 'refused' as const, code: 'managed_call_settlement_invalid' }
    }
    if (row.formanceFinancialState === 'settled') {
      return JSON.stringify(row.formanceSettlementRefs) === JSON.stringify(args.transactionRefs)
        ? { kind: 'accepted' as const, state: 'settled', replayed: true }
        : { kind: 'refused' as const, code: 'managed_call_settlement_conflict' }
    }
    if (row.formanceFinancialState !== 'possibly_submitted'
      && row.formanceFinancialState !== 'outcome_unknown') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'settled',
      formanceSettlementRefs: [...args.transactionRefs],
      updatedAt: args.now,
    })
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    if (obligation !== null) {
      await ctx.db.patch(obligation._id, { state: 'settled', settledAt: args.now, updatedAt: args.now })
    }
    return { kind: 'accepted' as const, state: 'settled', replayed: false }
  },
})

export const releaseBeforeSubmission = internalAction({
  args: { invocationRef: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args): Promise<TransitionResult> => {
    const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
      invocationRef: args.invocationRef,
    })
    if (material.kind === 'not_found') {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (material.financialState === 'released') {
      return { kind: 'accepted' as const, state: 'released', replayed: true }
    }
    if (material.financialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    const result: MoneyFormanceResult = await ctx.runAction(internal.moneyFormance.releaseManagedCall, {
      booking: material.booking,
      externalEvidenceDigest: material.booking.commitmentDigest,
      submissionProvenAbsent: true,
    })
    if (result.kind !== 'completed') {
      return {
        kind: 'refused' as const,
        code: result.kind === 'outcome_unknown'
          ? 'managed_call_release_unknown'
          : result.code,
      }
    }
    return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      invocationRef: args.invocationRef,
      transactionRefs: [...result.transactionRefs],
      now: args.now,
    })
  },
})

export const settle = internalAction({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args): Promise<TransitionResult> => {
    const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
      invocationRef: args.invocationRef,
    })
    if (material.kind === 'not_found') {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (material.financialState === 'settled') {
      return { kind: 'accepted' as const, state: 'settled', replayed: true }
    }
    if (material.financialState !== 'possibly_submitted'
      && material.financialState !== 'outcome_unknown') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    const result: MoneyFormanceResult = await ctx.runAction(internal.moneyFormance.settleManagedCall, {
      booking: material.booking,
      externalEvidenceDigest: args.evidenceDigest,
    })
    if (result.kind !== 'completed') {
      return {
        kind: 'refused' as const,
        code: result.kind === 'outcome_unknown'
          ? 'managed_call_settlement_unknown'
          : result.code,
      }
    }
    return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      invocationRef: args.invocationRef,
      transactionRefs: [...result.transactionRefs],
      now: args.now,
    })
  },
})

export const validateX402ReleaseProof = internalQuery({
  args: {
    invocationRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
    operationRef: v.string(), inputDigest: v.string(), reservationRef: v.string(),
    paymentIdentifier: v.string(), challengeDigest: v.string(), evidenceRef: v.string(),
    evidenceDigest: v.string(), paymentResponseDigest: v.string(),
    transportObservationDigest: v.string(), transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(), observedAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const [invocation, payment] = await Promise.all([
      ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique(),
      ctx.db.query('moneyX402PaymentAttempts')
        .withIndex('by_attemptRef_and_effectGeneration', (query) => query
          .eq('attemptRef', args.attemptRef).eq('effectGeneration', args.effectGeneration)).unique(),
    ])
    return invocation !== null
      && invocation.formanceFinancialState === 'reserved'
      && invocation.formanceReservationRefs?.includes(args.reservationRef) === true
      && payment !== null
      && payment.dispatchRef === args.invocationRef
      && payment.operationRef === args.operationRef
      && payment.inputDigest === args.inputDigest
      && payment.reservationRef === args.reservationRef
      && payment.paymentIdentifier === args.paymentIdentifier
      && payment.challengeDigest === args.challengeDigest
      && payment.paymentSignatureDigest === undefined
      && payment.submissionStartedAt === undefined
  },
})

export const releaseBeforeSubmissionWithX402Proof = internalAction({
  args: {
    invocationRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
    operationRef: v.string(), inputDigest: v.string(), reservationRef: v.string(),
    paymentIdentifier: v.string(), challengeDigest: v.string(), evidenceRef: v.string(),
    evidenceDigest: v.string(), paymentResponseDigest: v.string(),
    transportObservationDigest: v.string(), transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(), observedAt: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args): Promise<TransitionResult> => {
    const valid = await ctx.runQuery(internal.moneyManagedCallLifecycle.validateX402ReleaseProof, args)
    if (!valid) return { kind: 'refused' as const, code: 'managed_call_recovery_identity_mismatch' }
    return await ctx.runAction(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
      invocationRef: args.invocationRef,
      now: args.observedAt,
    })
  },
})
