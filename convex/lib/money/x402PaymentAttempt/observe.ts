import { v } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import { loadByAttempt, loadByCustody } from './attempt'
import { type EventArgs, type RecordObservationArgs, x402PaymentEventArgs, x402PaymentSettlementStatusValue } from './contracts'
import { eventAttributionValid } from './identity'
import { quarantinedOutputFromArgs, quarantinedOutputFromRow, sameQuarantinedOutput } from './quarantinedOutput'
import { RESPONSE_RECOVERY_FIRST_DELAY_MS } from './responseRecovery'
import { resolveX402SpendReservation } from './spendResolution'

export const markX402PaymentPossiblySubmittedArgs = { ...x402PaymentEventArgs }
// A mismatched attribution is expected refusal data, not a fault: the caller halts the payment on it.
export const markX402PaymentPossiblySubmittedReturns = v.union(
  v.null(),
  v.object({ kind: v.literal('attribution_mismatch') }),
)

export type MarkPossiblySubmittedArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
}

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
  toolRef: v.string(),
  inputDigest: v.string(),
  transportObservationDigest: v.string(),
  transportRequestDigest: v.string(),
  paymentObservationDigest: v.string(),
  settlementStatus: x402PaymentSettlementStatusValue,
  paymentResponseDigest: v.optional(v.string()),
  responseStatus: v.optional(v.number()),
  quarantinedResponseDigest: v.optional(v.string()),
  quarantinedOutputJson: v.optional(v.string()),
  observedAt: v.number(),
}

export const recordX402PaymentObservationReturns = v.null()

export type ObserveArgs = EventArgs & {
  settlementStatus?: 'settled' | 'not_settled' | 'unknown'
  settlementDigest?: string
  state: 'observed' | 'reconciliation_required'
  evidenceRefs: string[]
}

export async function markX402PaymentPossiblySubmittedHandler(
  ctx: MutationCtx,
  args: MarkPossiblySubmittedArgs,
): Promise<null | { kind: 'attribution_mismatch' }> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || !eventAttributionValid(row, args as EventArgs)) return { kind: 'attribution_mismatch' }
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
  if (row.state !== 'prepared') return null
  await ctx.db.patch(row._id, {
    state: 'possibly_submitted',
    submissionStartedAt: Date.now(),
  })
  return null
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
  const evidenceRefs = [...new Set([
    ...row.evidenceRefs.filter(ref => ref.startsWith(`chain:${row.network}:`)
      || ref.startsWith('response-request:') || ref.startsWith('response-payment:')),
    ...args.evidenceRefs,
  ])]
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    const sameEvidence = (
      row.state === targetState
      && (row.settlementStatus ?? undefined) === args.settlementStatus
      && (row.paymentResponseDigest ?? undefined) === args.settlementDigest
      && row.evidenceRefs.length === evidenceRefs.length
      && row.evidenceRefs.every((ref, index) => ref === evidenceRefs[index])
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
    evidenceRefs,
  })
  if (args.settlementStatus === 'settled') {
    if (args.settlementDigest === undefined) throw new Error('x402_settlement_evidence_missing')
    await resolveX402SpendReservation(ctx, row, { kind: 'settled', evidenceDigest: args.settlementDigest })
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  return null
}

/** Retain HTTP status and optional canonical response output without claiming delivery. */
export async function checkpointX402ResponseHandler(
  ctx: MutationCtx,
  args: Readonly<{
    dispatchRef: string; attemptRef: string; effectGeneration: number;
    toolRef: string; inputDigest: string; paymentIdentifier: string;
    responseStatus: number; responseDigest?: string; outputJson?: string;
    settlementTransactionRef?: string;
    requestDigest: string; paymentResponseDigest?: string;
  }>,
): Promise<null> {
  if (!Number.isSafeInteger(args.responseStatus) || args.responseStatus < 100 || args.responseStatus > 599) {
    throw new Error('x402_payment_response_status_invalid')
  }
  const output = quarantinedOutputFromArgs({
    settlementStatus: 'unknown',
    ...(args.responseDigest === undefined ? {} : { quarantinedResponseDigest: args.responseDigest }),
    ...(args.outputJson === undefined ? {} : { quarantinedOutputJson: args.outputJson }),
  })
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef
    || row.toolRef !== args.toolRef || row.inputDigest !== args.inputDigest
    || row.paymentIdentifier !== args.paymentIdentifier
    || !['possibly_submitted', 'observed', 'reconciliation_required'].includes(row.state)) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if (row.contentExpiredAt !== undefined) throw new Error('x402_payment_content_expired')
  const persisted = quarantinedOutputFromRow(row)
  const txRef = args.settlementTransactionRef
  if (row.responseStatus !== undefined && row.responseStatus !== args.responseStatus) {
    throw new Error('x402_payment_response_status_conflict')
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(args.requestDigest)
    || (args.paymentResponseDigest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(args.paymentResponseDigest))) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if ((row.transportRequestDigest !== undefined && row.transportRequestDigest !== args.requestDigest)
    || (row.paymentResponseDigest !== undefined && row.paymentResponseDigest !== args.paymentResponseDigest)) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if (txRef !== undefined && (!txRef.startsWith(`chain:${row.network}:`)
    || !/^chain:eip155:\d+:0x[0-9a-fA-F]{64}$/.test(txRef))) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if (persisted !== undefined && output !== undefined && !sameQuarantinedOutput(persisted, output)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  const identities: ReadonlyArray<readonly [string, string | undefined]> = [
    ['response-request:', args.requestDigest],
    ['response-payment:', args.paymentResponseDigest],
    [`chain:${row.network}:`, txRef],
  ]
  for (const [prefix, supplied] of identities) {
    const existing = row.evidenceRefs.filter((ref) => ref.startsWith(prefix))
    const expected = prefix.startsWith('chain:') ? supplied : `${prefix}${supplied}`
    if (existing.length > 0 && (supplied === undefined || existing.some((ref) => ref !== expected))) {
      throw new Error('x402_payment_observation_attribution_invalid')
    }
  }
  if (row.responseStatus === args.responseStatus && (persisted !== undefined || output === undefined)
    && row.evidenceRefs.includes(`response-request:${args.requestDigest}`)
    && (args.paymentResponseDigest === undefined || row.evidenceRefs.includes(`response-payment:${args.paymentResponseDigest}`))
    && (txRef === undefined || row.evidenceRefs.includes(txRef))) return null
  await ctx.db.patch(row._id, {
    responseStatus: args.responseStatus,
    ...(persisted === undefined && output !== undefined ? {
      quarantinedResponseDigest: output.responseDigest, quarantinedOutputJson: output.outputJson,
    } : {}),
    evidenceRefs: [...new Set([...row.evidenceRefs, `response-request:${args.requestDigest}`,
      ...(args.paymentResponseDigest === undefined ? [] : [`response-payment:${args.paymentResponseDigest}`]),
      ...(txRef === undefined ? [] : [txRef])])],
  })
  if (txRef !== undefined) await ctx.scheduler.runAfter(RESPONSE_RECOVERY_FIRST_DELAY_MS, internal.moneyX402PaymentAttempts.beginResponseRecovery, {
    callRef: args.dispatchRef, attempt: 0,
  })
  return null
}

export async function recordX402PaymentObservationHandler(
  ctx: MutationCtx,
  args: RecordObservationArgs,
): Promise<null> {
  const quarantinedOutput = quarantinedOutputFromArgs(args)
  if (args.responseStatus !== undefined && (!Number.isSafeInteger(args.responseStatus)
    || args.responseStatus < 100 || args.responseStatus > 599)) {
    throw new Error('x402_payment_response_status_invalid')
  }
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (
    row === null
    || row.dispatchRef !== args.dispatchRef
    || row.paymentIdentifier !== args.paymentIdentifier
    || (row.toolRef !== undefined && row.toolRef !== args.toolRef)
    || (row.inputDigest !== undefined && row.inputDigest !== args.inputDigest)
    || (
      row.state !== 'prepared'
      && row.state !== 'possibly_submitted'
      && row.state !== 'observed'
      && row.state !== 'reconciliation_required'
    )
  ) throw new Error('x402_payment_observation_attribution_invalid')
  if (row.contentExpiredAt !== undefined) throw new Error('x402_payment_content_expired')
  if (
    row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.paymentResponseDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  if (args.responseStatus !== undefined && row.responseStatus !== undefined
    && row.responseStatus !== args.responseStatus) throw new Error('x402_payment_response_status_conflict')
  if (row.evidenceRefs.some((ref) => ref.startsWith('response-request:')
    && ref !== `response-request:${args.transportRequestDigest}`)
    || row.evidenceRefs.some((ref) => ref.startsWith('response-payment:')
      && ref !== `response-payment:${args.paymentResponseDigest}`)) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
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
        persistedQuarantinedOutput !== undefined && quarantinedOutput !== undefined
        && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)
      ) throw new Error('x402_payment_quarantined_output_conflict')
      await ctx.db.patch(row._id, {
        toolRef: args.toolRef,
        inputDigest: args.inputDigest,
        paymentObservationDigest: args.paymentObservationDigest,
        transportObservationDigest: args.transportObservationDigest,
        transportRequestDigest: args.transportRequestDigest,
        ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
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
      row.toolRef !== args.toolRef
      || row.inputDigest !== args.inputDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
    ) throw new Error('x402_payment_observation_attribution_invalid')
    if (quarantinedOutput !== undefined && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
      throw new Error('x402_payment_quarantined_output_conflict')
    }
    if (row.responseStatus === undefined && args.responseStatus !== undefined) {
      await ctx.db.patch(row._id, { responseStatus: args.responseStatus })
    }
    return null
  }
  if (persistedQuarantinedOutput !== undefined && quarantinedOutput !== undefined
    && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    toolRef: args.toolRef,
    paymentObservationDigest: args.paymentObservationDigest,
    inputDigest: args.inputDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    settlementStatus: args.settlementStatus,
    ...(args.responseStatus === undefined ? {} : { responseStatus: args.responseStatus }),
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
    await resolveX402SpendReservation(ctx, row, { kind: 'settled', evidenceDigest: args.paymentObservationDigest })
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return null
}
