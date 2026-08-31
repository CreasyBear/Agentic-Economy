import { v, type Infer } from 'convex/values'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { isCanonicalDigest } from '@/modules/common/canonical-digest'

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
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
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
  quarantinedResponseDigest?: string
  quarantinedOutputJson?: string
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

const MAX_QUARANTINED_OUTPUT_BYTES = 512 * 1024

type QuarantinedOutput = Readonly<{
  responseDigest: string
  outputJson: string
}>

function quarantinedOutputFromArgs(args: RecordObservationArgs): QuarantinedOutput | undefined {
  const responseDigest = args.quarantinedResponseDigest
  const outputJson = args.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_invalid')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  if (
    args.settlementStatus !== 'unknown'
    || !isCanonicalDigest(responseDigest)
    || new TextEncoder().encode(outputJson).byteLength
      > MAX_QUARANTINED_OUTPUT_BYTES
  ) throw new Error('x402_payment_quarantined_output_invalid')
  const parsed = parseBoundedJson(outputJson)
  if (
    parsed === undefined
    || JSON.stringify(parsed) !== outputJson
  ) throw new Error('x402_payment_quarantined_output_invalid')
  return {
    responseDigest,
    outputJson,
  }
}

function quarantinedOutputFromRow(
  row: Readonly<{
    quarantinedResponseDigest?: string
    quarantinedOutputJson?: string
  }>,
): QuarantinedOutput | undefined {
  const responseDigest = row.quarantinedResponseDigest
  const outputJson = row.quarantinedOutputJson
  if ((responseDigest === undefined) !== (outputJson === undefined)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  if (responseDigest === undefined || outputJson === undefined) return undefined
  return {
    responseDigest,
    outputJson,
  }
}

function sameQuarantinedOutput(
  left: QuarantinedOutput | undefined,
  right: QuarantinedOutput | undefined,
): boolean {
  return left?.responseDigest === right?.responseDigest
    && left?.outputJson === right?.outputJson
}

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
  const quarantinedOutput = quarantinedOutputFromArgs(args)
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
  const persistedQuarantinedOutput = quarantinedOutputFromRow(row)
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
    const observationDigests = [
      row.paymentObservationDigest,
      row.transportObservationDigest,
      row.transportRequestDigest,
    ]
    const missingObservationDigests = observationDigests.every((value) => value === undefined)
    if (missingObservationDigests) {
      if (
        persistedQuarantinedOutput !== undefined
        && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)
      ) throw new Error('x402_payment_quarantined_output_conflict')
      await ctx.db.patch(row._id, {
        operationRef: args.operationRef,
        inputDigest: args.inputDigest,
        paymentObservationDigest: args.paymentObservationDigest,
        transportObservationDigest: args.transportObservationDigest,
        transportRequestDigest: args.transportRequestDigest,
        ...(persistedQuarantinedOutput === undefined && quarantinedOutput !== undefined
          ? {
              quarantinedResponseDigest: quarantinedOutput.responseDigest,
              quarantinedOutputJson: quarantinedOutput.outputJson,
            }
          : {}),
        observedAt: args.observedAt,
      })
      return null
    }
    if (
      row.operationRef !== args.operationRef
      || row.inputDigest !== args.inputDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
    ) throw new Error('x402_payment_observation_attribution_invalid')
    if (!sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
      throw new Error('x402_payment_quarantined_output_conflict')
    }
    return null
  }
  if (persistedQuarantinedOutput !== undefined) {
    throw new Error('x402_payment_quarantined_output_conflict')
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
    ...(quarantinedOutput === undefined
      ? {}
      : {
          quarantinedResponseDigest: quarantinedOutput.responseDigest,
          quarantinedOutputJson: quarantinedOutput.outputJson,
        }),
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
  if (row === null) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch: 'attempt_not_found',
    })
    return { kind: 'reconciliation_required' }
  }
  const mismatch = row.dispatchRef !== args.dispatchRef
      ? 'dispatch_ref'
      : row.operationRef !== args.operationRef
        ? 'operation_ref'
        : row.inputDigest !== args.inputDigest
          ? 'input_digest'
          : row.reservationRef !== args.reservationRef
            ? 'reservation_ref'
            : row.paymentIdentifier !== args.paymentIdentifier
              ? 'payment_identifier'
              : row.challengeDigest !== args.challengeDigest
                ? 'challenge_digest'
                : row.amountUnits !== args.amountUnits
                  ? 'amount_units'
                  : row.currency !== args.currency
                    ? 'currency'
                    : row.exponent !== args.exponent
                      ? 'exponent'
                      : row.transportObservationDigest !== args.transportObservationDigest
                        ? 'transport_observation_digest'
                        : row.transportRequestDigest !== args.transportRequestDigest
                          ? 'transport_request_digest'
                          : row.paymentObservationDigest !== args.paymentObservationDigest
                            ? 'payment_observation_digest'
                            : row.settlementStatus !== undefined
                              && row.settlementStatus !== 'unknown'
                              && row.settlementStatus !== args.settlementStatus
                              ? 'settlement_status'
                              : row.state !== 'observed' && row.state !== 'reconciliation_required'
                                ? 'attempt_state'
                                : undefined
  if (mismatch !== undefined) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch,
    })
    return { kind: 'reconciliation_required' }
  }
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
