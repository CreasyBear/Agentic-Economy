import { v, type Infer } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import {
  eventAttributionValid,
  loadByAttempt,
  loadByCustody,
  type EventArgs,
  x402PaymentEventArgs,
  x402PaymentSettlementStatusValue,
} from './moneyX402PaymentAttemptsShared'
import { recordMarketEvidenceFact } from './marketEvidence'

export const observeX402PaymentAttemptArgs = {
  ...x402PaymentEventArgs,
  state: v.union(v.literal('observed'), v.literal('reconciliation_required')),
  evidenceRefs: v.array(v.string()),
}

export const observeX402PaymentAttemptReturns = v.null()

export const recordX402PaymentObservationArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  paymentIdentifier: v.string(),
  operationRef: v.string(),
  inputDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  settlementStatus: x402PaymentSettlementStatusValue,
  paymentResponseDigest: v.optional(v.string()),
  observedAt: v.number(),
}

export const recordX402PaymentObservationReturns = v.null()

export const reconcileX402PaymentAttemptArgs = {
  dispatchRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  operationRef: v.string(),
  inputDigest: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  reservationRef: v.string(),
  paymentIdentifier: v.string(),
  challengeDigest: v.string(),
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  amountUnits: v.string(),
  currency: v.string(),
  exponent: v.number(),
  paymentResponseDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  observedAt: v.number(),
}

export const reconcileX402PaymentAttemptReturns = v.union(
  v.object({
    kind: v.literal('settled'),
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  }),
  v.object({ kind: v.literal('reconciliation_required') }),
  v.object({ kind: v.literal('not_found') }),
)

type ObserveArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
  state: 'observed' | 'reconciliation_required'
  evidenceRefs: string[]
}
type RecordObservationArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  paymentIdentifier: string
  operationRef: string
  inputDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  settlementStatus: 'settled' | 'not_settled' | 'unknown'
  paymentResponseDigest?: string
  observedAt: number
}
type ReconcileArgs = {
  dispatchRef: string
  attemptRef: string
  effectGeneration: number
  operationRef: string
  inputDigest: string
  evidenceRef: string
  evidenceDigest: string
  reservationRef: string
  paymentIdentifier: string
  challengeDigest: string
  settlementStatus: 'settled' | 'not_settled'
  amountUnits: string
  currency: string
  exponent: number
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  observedAt: number
}
type ReconcileResult = Infer<typeof reconcileX402PaymentAttemptReturns>

export async function observeX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ObserveArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || !eventAttributionValid(row, args as EventArgs)) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    args.settlementStatus !== undefined
    && row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    args.settlementDigest !== undefined
    && row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.settlementDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : args.state
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    const sameEvidence = (
      row.state === targetState
      && (row.settlementStatus ?? undefined) === args.settlementStatus
      && (row.paymentResponseDigest ?? undefined) === args.settlementDigest
      && row.evidenceRefs.length === args.evidenceRefs.length
      && row.evidenceRefs.every((ref, index) => ref === args.evidenceRefs[index])
    )
    if (sameEvidence) return null
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  if (row.state !== 'possibly_submitted') {
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    ...(args.settlementStatus === undefined ? {} : { settlementStatus: args.settlementStatus }),
    ...(args.settlementDigest === undefined ? {} : { paymentResponseDigest: args.settlementDigest }),
    observedAt: Date.now(),
    evidenceRefs: args.evidenceRefs,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  return null
}

export async function recordX402PaymentObservationHandler(
  ctx: MutationCtx,
  args: RecordObservationArgs,
): Promise<null> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (
    row === null
    || row.dispatchRef !== args.dispatchRef
    || row.paymentIdentifier !== args.paymentIdentifier
    || (row.operationRef !== undefined && row.operationRef !== args.operationRef)
    || (row.inputDigest !== undefined && row.inputDigest !== args.inputDigest)
    || (
      row.state !== 'prepared'
      && row.state !== 'possibly_submitted'
      && row.state !== 'observed'
      && row.state !== 'reconciliation_required'
    )
  ) throw new Error('x402_payment_observation_attribution_invalid')
  if (
    row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.paymentResponseDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : 'observed'
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    if (row.state !== targetState) {
      throw new Error('x402_payment_attempt_observation_state_invalid')
    }
    if (row.settlementStatus !== args.settlementStatus) {
      throw new Error('x402_payment_settlement_identity_conflict')
    }
    if (row.paymentResponseDigest !== args.paymentResponseDigest) {
      throw new Error('x402_payment_response_identity_conflict')
    }
    if (
      row.operationRef !== args.operationRef
      || row.inputDigest !== args.inputDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
    ) throw new Error('x402_payment_observation_attribution_invalid')
    return null
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    operationRef: args.operationRef,
    paymentObservationDigest: args.paymentObservationDigest,
    inputDigest: args.inputDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    settlementStatus: args.settlementStatus,
    ...(args.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: args.paymentResponseDigest }),
    observedAt: args.observedAt,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return null
}

export async function reconcileX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (
    row === null
    || row.dispatchRef !== args.dispatchRef
    || row.operationRef !== args.operationRef
    || row.inputDigest !== args.inputDigest
    || row.reservationRef !== args.reservationRef
    || row.paymentIdentifier !== args.paymentIdentifier
    || row.challengeDigest !== args.challengeDigest
    || row.amountUnits !== args.amountUnits
    || row.currency !== args.currency
    || row.exponent !== args.exponent
    || row.transportObservationDigest !== args.transportObservationDigest
    || row.transportRequestDigest !== args.transportRequestDigest
    || row.paymentObservationDigest !== args.paymentObservationDigest
    || (
      row.settlementStatus !== undefined
      && row.settlementStatus !== 'unknown'
      && row.settlementStatus !== args.settlementStatus
    )
    || (row.state !== 'observed' && row.state !== 'reconciliation_required')
  ) return { kind: 'reconciliation_required' }
  if (row.reconciliationEvidenceDigest !== undefined) {
    return row.reconciliationEvidenceRef === args.evidenceRef
      && row.reconciliationEvidenceDigest === args.evidenceDigest
      && row.paymentResponseDigest === args.paymentResponseDigest
      ? { kind: 'settled', settlementStatus: args.settlementStatus }
      : { kind: 'reconciliation_required' }
  }
  await ctx.db.patch(row._id, {
    reconciliationEvidenceRef: args.evidenceRef,
    reconciliationEvidenceDigest: args.evidenceDigest,
    paymentObservationDigest: args.paymentObservationDigest,
    settlementStatus: args.settlementStatus,
    paymentResponseDigest: args.paymentResponseDigest,
    state: 'observed',
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return { kind: 'settled', settlementStatus: args.settlementStatus }
}
