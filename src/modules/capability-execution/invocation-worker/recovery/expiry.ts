import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  projectPersistedRecovery,
  recoveryNotFound,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import {
  loadReadyRecoveryWork,
  type RecoveryControlRow,
  type RecoveryWorkContext,
} from './loading'
import type {
  ExpiryQueueResult,
  InternalRecoveryResult,
  RecoveredInvocation,
  RecoveryIdentity,
} from './contracts'

export async function expireAuthorizationRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<InternalRecoveryResult> {
  const loaded = await loadReadyRecoveryWork(ctx, args, false)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.invocationRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(loaded.recovered)
  const { work } = loaded
  const { recovered, control, operation, x402Attempt } = work
  if (operation.identity.adapterId !== 'x402-fetch:v2' || x402Attempt === null) {
    return recoveryNotFound(args.invocationRef)
  }
  const canonicalControl = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration
  if (attemptRef === undefined || effectGeneration === undefined) {
    return recoveryNotFound(args.invocationRef)
  }
  const transition = await observeExpiryTransition(work, attemptRef, effectGeneration)
  const queued = await queueExpiredAuthorization(ctx, {
    recovered,
    x402Attempt,
    attemptRef,
    effectGeneration,
    nativeTransition: transition.nativeTransition,
    controlInvocationVersion: transition.controlInvocationVersion,
    observedControlState: canonicalControl.state,
  })
  if (queued === undefined || queued.kind === 'not_queued' || queued.disposition === undefined) {
    return recoveryNotFound(args.invocationRef)
  }
  return {
    kind: 'reconciliation_required', invocationRef: queued.invocationRef,
    operationRef: queued.operationRef, evidence: queued.evidence,
    expiryDisposition: queued.disposition,
  }
}

async function observeExpiryTransition(
  work: RecoveryWorkContext,
  attemptRef: string,
  effectGeneration: number,
): Promise<Readonly<{
  nativeTransition: 'applied' | 'replayable' | 'manual_review'
  controlInvocationVersion: number
}>> {
  const { recovered, control, tracer } = work
  const canonicalControl = control.control.control
  if (canonicalControl.state === 'reconciliation_required') {
    return { nativeTransition: 'replayable', controlInvocationVersion: control.control.invocationVersion }
  }
  if (!expiryObservationAllowed(canonicalControl, attemptRef, effectGeneration)) {
    return { nativeTransition: 'manual_review', controlInvocationVersion: control.control.invocationVersion }
  }
  try {
    const observation = await tracer.publishObservation({
      invocationRef: recovered.invocationRef,
      expectedInvocationVersion: control.control.invocationVersion,
      attemptRef,
      leaseOwner: canonicalControl.leaseOwner,
      effectGeneration,
      release: 'possibly_released',
    })
    return observation.kind === 'accepted'
      ? { nativeTransition: 'applied', controlInvocationVersion: observation.view.invocationVersion }
      : { nativeTransition: 'manual_review', controlInvocationVersion: control.control.invocationVersion }
  } catch {
    return { nativeTransition: 'manual_review', controlInvocationVersion: control.control.invocationVersion }
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
    recovered: RecoveredInvocation
    x402Attempt: NonNullable<RecoveryWorkContext['x402Attempt']>
    attemptRef: string
    effectGeneration: number
    nativeTransition: 'applied' | 'replayable' | 'manual_review'
    controlInvocationVersion: number
    observedControlState: string
  }>,
): Promise<ExpiryQueueResult | undefined> {
  try {
    return await ctx.runMutation(internal.capabilityOperationX402AuthorizationExpiry.queueExpiredX402Authorization, {
      invocationRef: input.recovered.invocationRef,
      principalId: input.recovered.principalId,
      credentialId: input.recovered.credentialId,
      attemptRef: input.attemptRef,
      effectGeneration: input.effectGeneration,
      custodyRef: input.x402Attempt.custodyRef,
      authorizationDigest: input.x402Attempt.authorizationDigest,
      ...(input.x402Attempt.reservationRef === undefined ? {} : { reservationRef: input.x402Attempt.reservationRef }),
      nativeTransition: input.nativeTransition,
      controlInvocationVersion: input.controlInvocationVersion,
      observedControlState: input.observedControlState,
      now: Date.now(),
    })
  } catch {
    return undefined
  }
}
