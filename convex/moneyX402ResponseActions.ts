'use node'

import { v } from 'convex/values'
import { internalAction, type ActionCtx } from './_generated/server'
import { internal } from './_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { loadReadyRecoveryWork, reconcileRecovery, type RecoveryWorkContext } from '@/modules/capability-execution/call-runtime'
import { readPublicExecutionStatus } from '@/modules/action-execution/runtime'
import { parseContractOutput, reconciliationResult } from '@/modules/capability-execution/convex'
import { projectRecoveryOuter } from './lib/capabilityExecution/callProjection/recovery'

/** Recover the already-paid response; never call the Provider or create a payment. */
export const recover = internalAction({
  args: { callRef: v.string(), attempt: v.number() },
  returns: v.object({ kind: v.union(v.literal('completed'), v.literal('pending'), v.literal('stopped')) }),
  handler: async (ctx, args): Promise<{ kind: 'completed' | 'pending' | 'stopped' }> => {
    if (!await ctx.runQuery(internal.moneyX402PaymentAttempts.responseRecoveryIsCurrent, args)) return { kind: 'stopped' }
    try {
      return await recoverRetainedResponse(ctx, args.callRef)
    } catch (cause) {
      degradeBackend(cause, undefined, { site: 'recoverRetainedX402Response', reason: 'source_unavailable' })
      return { kind: 'pending' }
    }
  },
})

export async function recoverRetainedResponse(ctx: ActionCtx, callRef: string): Promise<{ kind: 'completed' | 'pending' | 'stopped' }> {
  const call = await ctx.runQuery(internal.capabilityCalls.readOwnerRecovery, { callRef })
  if (call === null) return { kind: 'stopped' }
  const identity = { callRef, principalId: call.principalId, credentialId: call.credentialId }
  const loaded = await loadReadyRecoveryWork(ctx, identity)
  if (loaded.kind !== 'ready') return { kind: 'stopped' }
  const { work } = loaded
  const attempt = work.x402Attempt
  if (attempt === null || attempt.quarantinedOutputJson === undefined
    || attempt.quarantinedResponseDigest === undefined || attempt.reservationRef === undefined
    || work.operation.binding.authority.kind !== 'provider_connection') return { kind: 'stopped' }
  const control = work.control.control.control
  if (control.state === 'leased') {
    if (Date.parse(control.leaseExpiresAt) > Date.now()) return { kind: 'pending' }
    await work.tracer.publishObservation({ executionRef: callRef,
      expectedExecutionVersion: work.control.control.executionVersion,
      attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration,
      leaseOwner: control.leaseOwner, release: 'possibly_released' })
    const status = await readPublicExecutionStatus({ port: work.port, executionRef: callRef,
      actor: { callerRef: call.credentialId, principalRef: call.principalId } })
    if (status.kind !== 'refused') await projectRecoveryOuter(ctx, work.recovered,
      reconciliationResult(work.recovered, status, work.attemptRows, work.operation.operationId),
      'reconciliation_required')
    return { kind: 'pending' }
  }
  if (control.state !== 'reconciliation_required' && control.state !== 'terminal') return { kind: 'pending' }
  const canonicalAttempt = work.attemptRows.find(row => row.attemptRef === attempt.attemptRef
    && row.effectGeneration === attempt.effectGeneration)
  if (canonicalAttempt === undefined) return { kind: 'stopped' }
  const outcome = canonicalAttempt.outcome
  const requiredAt = outcome.state === 'uncertain' || outcome.state === 'timed_out'
    ? outcome.reconciliationRequiredAt : outcome.state === 'reconciled_released' ? outcome.observedAt : undefined
  if (requiredAt === undefined || Date.parse(requiredAt) > Date.now()) return { kind: 'pending' }
  const evidence = await retainedResponseEvidence(ctx, work, requiredAt)
  if (evidence === undefined) return { kind: 'stopped' }
  const delivery = parseContractOutput({ transport: 'x402', disposition: 'succeeded', releaseStarted: true,
    requestDigest: evidence.requestDigest, outputJson: attempt.quarantinedOutputJson,
    responseDigest: attempt.quarantinedResponseDigest }, work.descriptor)
  if (!delivery.valid) {
    // The remedy action verifies payment and invalid delivery independently;
    // recording a response or a transaction locator does not authorize charging.
    const remedy = await ctx.runAction(internal.moneyManagedCallRemedyActions.resolveInvalidResult, {
      callRef, transactionHash: evidence.transactionHash,
    })
    return { kind: remedy.kind === 'completed' ? 'completed' : 'pending' }
  }
  const result = await reconcileRecovery(ctx, { ...identity, evidence })
  return { kind: result.kind === 'found' && result.result?.kind === 'completed' ? 'completed' : 'pending' }
}

async function retainedResponseEvidence(ctx: ActionCtx, work: RecoveryWorkContext, requiredAt: string) {
  const attempt = work.x402Attempt
  if (attempt === null || attempt.quarantinedResponseDigest === undefined) return undefined
  const txPrefix = `chain:${attempt.network}:`
  const transactionHash = attempt.evidenceRefs.find((ref: string) => ref.startsWith(txPrefix))?.slice(txPrefix.length)
  const requestDigest = attempt.transportRequestDigest
    ?? attempt.evidenceRefs.find((ref: string) => ref.startsWith('response-request:'))?.slice('response-request:'.length)
  const paymentResponseDigest = attempt.paymentResponseDigest
    ?? attempt.evidenceRefs.find((ref: string) => ref.startsWith('response-payment:'))?.slice('response-payment:'.length)
  if (transactionHash === undefined || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)
    || requestDigest === undefined || paymentResponseDigest === undefined || attempt.reservationRef === undefined
    || work.operation.binding.authority.kind !== 'provider_connection') return undefined
  // If the worker died before final observation, bind its retained response to this exact payment.
  const transportObservationDigest = attempt.transportObservationDigest ?? canonicalDigest({
    kind: 'retained_x402_response:v1', requestDigest, responseDigest: attempt.quarantinedResponseDigest, transactionHash,
  })
  const paymentObservationDigest = attempt.paymentObservationDigest ?? canonicalDigest({
    kind: 'retained_x402_payment:v1', paymentIdentifier: attempt.paymentIdentifier, paymentResponseDigest, transactionHash,
  })
  const observedAt = Math.max(Date.parse(requiredAt), attempt.observedAt ?? attempt.preparedAt)
  if (attempt.transportObservationDigest === undefined) {
    await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentObservation, {
      dispatchRef: work.recovered.callRef, attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration, paymentIdentifier: attempt.paymentIdentifier,
      toolRef: work.recovered.toolRef, inputDigest: work.recovered.inputDigest,
      transportObservationDigest, transportRequestDigest: requestDigest, paymentObservationDigest,
      settlementStatus: attempt.settlementStatus ?? 'unknown', paymentResponseDigest, observedAt,
    })
  }
  const material = {
    kind: 'x402_payment_reconciliation' as const, version: 1 as const,
    evidenceRef: `retained-response:${attempt.attemptRef}:${attempt.effectGeneration}`,
    source: `published-tool:${work.operation.operationId}`, invocationRef: work.recovered.callRef,
    attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration,
    operationRef: work.recovered.toolRef, inputDigest: work.recovered.inputDigest,
    requestDigest, providerRef: work.operation.binding.authority.providerRef,
    paymentIdentifier: attempt.paymentIdentifier, challengeDigest: attempt.challengeDigest,
    reservationRef: attempt.reservationRef, amount: { units: attempt.amountUnits, currency: attempt.currency, exponent: attempt.exponent },
    settlementStatus: 'settled' as const, transactionHash, paymentResponseDigest,
    transportObservationDigest, paymentObservationDigest, observedAt: new Date(observedAt).toISOString(),
  }
  return { ...material, digest: canonicalDigest(material as StableHashValue) }
}
