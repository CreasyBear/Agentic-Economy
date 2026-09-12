import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  projectPersistedRecovery,
  recoveryNotFound,
} from '../../../../../convex/capabilityCallProjection'
import {
  loadReadyRecoveryWork,
  type RecoveryControlRow,
  type RecoveryWorkContext,
} from './loading'
import type {
  ExpiryQueueResult,
  InternalRecoveryResult,
  RecoveredCall,
  RecoveryIdentity,
} from './contracts'

export async function expireAuthorizationRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<InternalRecoveryResult> {
  const loaded = await loadReadyRecoveryWork(ctx, args)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.callRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(loaded.recovered)
  const { work } = loaded
  const { recovered, control, operation, x402Attempt } = work
  if (operation.identity.adapterId !== 'x402-fetch:v2' || x402Attempt === null) {
    return recoveryNotFound(args.callRef)
  }
  const canonicalControl = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration
  if (attemptRef === undefined || effectGeneration === undefined) {
    return recoveryNotFound(args.callRef)
  }
  const transition = await observeExpiryTransition(work, attemptRef, effectGeneration)
  const queued = await queueExpiredAuthorization(ctx, {
    recovered,
    x402Attempt,
    attemptRef,
    effectGeneration,
    nativeTransition: transition.nativeTransition,
    controlExecutionVersion: transition.controlExecutionVersion,
    observedControlState: canonicalControl.state,
  })
  if (queued === undefined || queued.kind === 'not_queued' || queued.disposition === undefined) {
    return recoveryNotFound(args.callRef)
  }
  return {
    kind: 'reconciliation_required', callRef: queued.callRef,
    toolRef: queued.toolRef, evidence: queued.evidence,
    expiryDisposition: queued.disposition,
  }
}

async function observeExpiryTransition(
  work: RecoveryWorkContext,
  attemptRef: string,
  effectGeneration: number,
): Promise<Readonly<{
  nativeTransition: 'applied' | 'replayable' | 'manual_review'
  controlExecutionVersion: number
}>> {
  const { recovered, control, tracer } = work
  const canonicalControl = control.control.control
  if (canonicalControl.state === 'reconciliation_required') {
    return { nativeTransition: 'replayable', controlExecutionVersion: control.control.executionVersion }
  }
  if (!expiryObservationAllowed(canonicalControl, attemptRef, effectGeneration)) {
    return { nativeTransition: 'manual_review', controlExecutionVersion: control.control.executionVersion }
  }
  try {
    const observation = await tracer.publishObservation({
      executionRef: recovered.callRef,
      expectedExecutionVersion: control.control.executionVersion,
      attemptRef,
      leaseOwner: canonicalControl.leaseOwner,
      effectGeneration,
      release: 'possibly_released',
    })
    return observation.kind === 'accepted'
      ? { nativeTransition: 'applied', controlExecutionVersion: observation.view.executionVersion }
      : { nativeTransition: 'manual_review', controlExecutionVersion: control.control.executionVersion }
  } catch (cause) {
    return degradeBackend(
      cause,
      { nativeTransition: 'manual_review' as const, controlExecutionVersion: control.control.executionVersion },
      { site: 'observeExpiryTransition', reason: 'source_unavailable' },
    )
  }
}

function expiryObservationAllowed(
  control: RecoveryControlRow['control']['control'],
  attemptRef: string,
  effectGeneration: number,
): control is RecoveryControlRow['control']['control'] & Readonly<{ leaseOwner: string }> {
  return control.state === 'leased'
    && control.attemptRef === attemptRef
    && control.effectGeneration === effectGeneration
    && control.leaseOwner !== undefined
}

async function queueExpiredAuthorization(
  ctx: ActionCtx,
  input: Readonly<{
    recovered: RecoveredCall
    x402Attempt: NonNullable<RecoveryWorkContext['x402Attempt']>
    attemptRef: string
    effectGeneration: number
    nativeTransition: 'applied' | 'replayable' | 'manual_review'
    controlExecutionVersion: number
    observedControlState: string
  }>,
): Promise<ExpiryQueueResult | undefined> {
  try {
    return await ctx.runMutation(internal.capabilityCallX402AuthorizationExpiry.queueExpiredX402Authorization, {
      callRef: input.recovered.callRef,
      principalId: input.recovered.principalId,
      credentialId: input.recovered.credentialId,
      attemptRef: input.attemptRef,
      effectGeneration: input.effectGeneration,
      custodyRef: input.x402Attempt.custodyRef,
      authorizationDigest: input.x402Attempt.authorizationDigest,
      ...(input.x402Attempt.reservationRef === undefined ? {} : { reservationRef: input.x402Attempt.reservationRef }),
      nativeTransition: input.nativeTransition,
      controlExecutionVersion: input.controlExecutionVersion,
      observedControlState: input.observedControlState,
      now: Date.now(),
    })
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'queueExpiredAuthorization', reason: 'source_unavailable' })
  }
}
