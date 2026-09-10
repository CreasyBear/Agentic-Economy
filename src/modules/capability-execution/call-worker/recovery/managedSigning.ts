import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { reconcilePublicExecution, type ReconciliationEvidence } from '@/modules/action-execution/runtime'
import {
  replayManagedX402SigningForRecovery,
  type X402AttemptMaterial,
} from '../x402Authorization'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  projectPersistedRecovery,
  recoveryNotFound,
} from '../../../../../convex/capabilityCallProjection'
import { loadReadyRecoveryWork, type RecoveryWorkContext } from './loading'
import type { RecoveryIdentity, RecoveryResult } from './contracts'
import {
  managedReservationRefForAttempt,
  projectRetryableRecovery,
  recoveryControlCanProceed,
} from './preSubmission'

const EVIDENCE_SOURCE = 'x402_managed_signing:cdp_idempotent_replay:v1' as const
type ManagedSigningAttempt = NonNullable<RecoveryWorkContext['x402Attempt']>
type CompleteManagedSigningAttempt = ManagedSigningAttempt & Required<Pick<
  X402AttemptMaterial,
  | 'paymentUnsignedMaterialJson'
  | 'paymentUnsignedMaterialDigest'
  | 'paymentSigningIdempotencyKey'
  | 'paymentPayer'
  | 'paymentNonce'
  | 'paymentAuthorizationValidBefore'
  | 'paymentAuthorizationExpiresAt'
  | 'paymentSigningClaimedAt'
>>
type ManagedSigningReplay = Extract<
  Awaited<ReturnType<typeof replayManagedX402SigningForRecovery>>,
  { kind: 'definitive_rejection' }
>
type ManagedSigningPreparedEvidence = Readonly<{
  reservationRef: string
  evidence: ReconciliationEvidence
  evidenceRef: string
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
}>

/**
 * Closes an expired managed signing intent only after replaying CDP's exact
 * idempotent request. A successful replay recovers the same signature. A
 * definitive CDP request or policy rejection proves CDP did not sign. The
 * expired authorization was never admitted to provider transport because AE
 * persists the signature digest before transport start.
 */
export async function reconcileManagedSigningRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveryResult> {
  const loaded = await loadManagedSigningRecoveryWork(ctx, args)
  if (loaded.kind === 'terminal') return loaded.result
  const { work } = loaded
  const alreadyRetryable = work.control.control.control.state === 'retryable'
  const attempt = eligibleManagedSigningAttempt(work, alreadyRetryable)
  if (attempt === undefined) {
    observeStage(args.callRef, 'attempt_not_eligible')
    return recoveryNotFound(args.callRef)
  }

  const expiresAt = expiredAuthorizationTime(attempt)
  if (expiresAt === undefined) {
    observeStage(args.callRef, 'authorization_not_expired')
    return projectPersistedRecovery(work.recovered)
  }
  const replay = await replayManagedX402SigningForRecovery(
    attempt as X402AttemptMaterial,
    work.operation,
    work.recovered.toolRef,
    work.recovered.environment,
  )
  observeStage(args.callRef, `cdp_replay_${replay.kind}`, unresolvedReplayDiagnostic(replay))
  if (replay.kind !== 'definitive_rejection') return projectPersistedRecovery(work.recovered)
  return await finalizeManagedSigningRecovery(ctx, args.callRef, work, attempt, expiresAt, replay, alreadyRetryable)
}

async function finalizeManagedSigningRecovery(
  ctx: ActionCtx,
  callRef: string,
  work: RecoveryWorkContext,
  attempt: CompleteManagedSigningAttempt,
  observedAt: number,
  replay: ManagedSigningReplay,
  alreadyRetryable: boolean,
): Promise<RecoveryResult> {
  const prepared = prepareManagedSigningEvidence(work, attempt, observedAt, replay)
  if (prepared === undefined) {
    observeStage(callRef, 'observation_identity_incomplete')
    return projectPersistedRecovery(work.recovered)
  }
  const reconciled = await reconcileManagedSigningMoney(ctx, work, attempt, observedAt, replay, prepared)
  if (!reconciled) {
    observeStage(callRef, 'money_reconciliation_refused')
    return projectPersistedRecovery(work.recovered)
  }
  return await advanceManagedSigningControl(ctx, callRef, work, prepared.evidence, alreadyRetryable)
}

function prepareManagedSigningEvidence(
  work: RecoveryWorkContext,
  attempt: CompleteManagedSigningAttempt,
  observedAt: number,
  replay: ManagedSigningReplay,
): ManagedSigningPreparedEvidence | undefined {
  const reservationRef = managedReservationRefForAttempt(work, attempt)
  const providerIdentity = providerIdentityForRecovery(work)
  const transportObservationDigest = attempt.transportObservationDigest
  const paymentObservationDigest = attempt.paymentObservationDigest
  const transportRequestDigest = attempt.transportRequestDigest
  if (
    reservationRef === undefined
    || providerIdentity === undefined
    || transportObservationDigest === undefined
    || paymentObservationDigest === undefined
    || transportRequestDigest === undefined
  ) return undefined
  const proofMaterial = {
    format: 'ae.x402-managed-signing-expired-proof:v1',
    invocationRef: work.recovered.callRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    operationRef: work.recovered.toolRef,
    inputDigest: work.recovered.inputDigest,
    paymentIdentifier: attempt.paymentIdentifier,
    challengeDigest: attempt.challengeDigest,
    reservationRef: attempt.reservationRef,
    authorizationDigest: attempt.authorizationDigest,
    paymentUnsignedMaterialDigest: attempt.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: attempt.paymentSigningIdempotencyKey,
    paymentPayer: attempt.paymentPayer,
    paymentNonce: attempt.paymentNonce,
    paymentAuthorizationExpiresAt: observedAt,
    replayKind: replay.kind,
    replayEvidenceDigest: replay.evidenceDigest,
    conclusion: 'signature_never_admitted_to_transport',
    resolution: 'not_released',
    observedAt: new Date(observedAt).toISOString(),
  } as const
  const proofDigest = canonicalDigest(proofMaterial as StableHashValue)
  const evidenceRef = `x402-managed-signing-recovery:${proofDigest}`
  const evidenceMaterial = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef,
    source: `published-tool:${work.operation.operationId}`,
    invocationRef: work.recovered.callRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    operationRef: work.recovered.toolRef,
    inputDigest: work.recovered.inputDigest,
    requestDigest: work.recovered.requestDigest,
    providerIdentity,
    paymentIdentifier: attempt.paymentIdentifier,
    transportObservationDigest,
    paymentObservationDigest,
    resolution: 'not_released' as const,
    observedAt: new Date(observedAt).toISOString(),
  }
  const evidence: ReconciliationEvidence = {
    ...evidenceMaterial,
    digest: canonicalDigest(evidenceMaterial as StableHashValue),
  }
  const paymentResponseDigest = canonicalDigest({
    format: 'ae.x402-managed-signing-no-payment-response:v1',
    proofDigest,
  })
  return {
    reservationRef,
    evidence,
    evidenceRef,
    paymentResponseDigest,
    transportObservationDigest,
    transportRequestDigest,
    paymentObservationDigest,
  }
}

async function reconcileManagedSigningMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  attempt: CompleteManagedSigningAttempt,
  observedAt: number,
  replay: ManagedSigningReplay,
  prepared: ManagedSigningPreparedEvidence,
): Promise<boolean> {
  if (work.recovered.sellerOnboardingCanary !== undefined) return false
  const money = await ctx.runAction(
    internal.moneyManagedCallLifecycle.releaseBeforeSubmissionWithX402Proof,
    {
      callRef: work.recovered.callRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      toolRef: work.recovered.toolRef,
      inputDigest: work.recovered.inputDigest,
      reservationRef: prepared.reservationRef,
      paymentIdentifier: attempt.paymentIdentifier,
      challengeDigest: attempt.challengeDigest,
      evidenceRef: prepared.evidenceRef,
      evidenceDigest: prepared.evidence.digest,
      paymentResponseDigest: prepared.paymentResponseDigest,
      transportObservationDigest: prepared.transportObservationDigest,
      transportRequestDigest: prepared.transportRequestDigest,
      paymentObservationDigest: prepared.paymentObservationDigest,
      observedAt,
    },
  )
  return money.kind === 'accepted'
}

async function advanceManagedSigningControl(
  ctx: ActionCtx,
  callRef: string,
  work: RecoveryWorkContext,
  evidence: ReconciliationEvidence,
  alreadyRetryable: boolean,
): Promise<RecoveryResult> {
  if (alreadyRetryable) return await projectRetryableRecovery(ctx, work)

  work.trustedReconciliationEvidenceDigest.value = canonicalDigest(evidence as StableHashValue)
  const actor = {
    callerRef: work.recovered.credentialId,
    principalRef: work.recovered.principalId,
  }
  const reconciliation = await reconcilePublicExecution({
    tracer: work.tracer,
    executionRef: work.recovered.callRef,
    attemptRef: evidence.attemptRef,
    actor,
    origin: { kind: 'standalone', ...actor },
    evidence,
  })
  if (!reconciliationReachedRetryable(reconciliation)) {
    observeStage(callRef, 'control_reconciliation_refused')
    return projectPersistedRecovery(work.recovered)
  }
  observeStage(callRef, 'retryable')
  return await projectRetryableRecovery(ctx, work)
}

function providerIdentityForRecovery(work: RecoveryWorkContext): string | undefined {
  const { authority } = work.operation.binding
  return authority.kind === 'provider_connection' ? authority.providerRef : undefined
}

function unresolvedReplayDiagnostic(
  replay: Awaited<ReturnType<typeof replayManagedX402SigningForRecovery>>,
): Readonly<{ statusCode?: number; errorType?: string }> | undefined {
  return replay.kind === 'unresolved' ? replay : undefined
}

async function loadManagedSigningRecoveryWork(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<Readonly<
  | { kind: 'terminal'; result: RecoveryResult }
  | { kind: 'ready'; work: RecoveryWorkContext }
>> {
  const loaded = await loadReadyRecoveryWork(ctx, args)
  if (loaded.kind === 'not_found') {
    return { kind: 'terminal', result: recoveryNotFound(args.callRef) }
  }
  if (loaded.kind === 'persisted') {
    observeStage(args.callRef, 'recovery_control_not_ready')
    return { kind: 'terminal', result: projectPersistedRecovery(loaded.recovered) }
  }
  return { kind: 'ready', work: loaded.work }
}

function observeStage(
  callRef: string,
  stage: string,
  diagnostic?: Readonly<{ statusCode?: number; errorType?: string }>,
): void {
  console.info('x402_managed_signing_recovery', {
    callRef,
    stage,
    statusCode: diagnostic?.statusCode,
    errorType: diagnostic?.errorType,
  })
}

function eligibleManagedSigningAttempt(
  work: RecoveryWorkContext,
  alreadyRetryable: boolean,
): CompleteManagedSigningAttempt | undefined {
  const attempt = work.x402Attempt
  if (attempt === null) return undefined
  if (!recoveryControlCanProceed(work, alreadyRetryable)) return undefined
  return managedSigningAttemptCanRecover(attempt) ? attempt : undefined
}

function expiredAuthorizationTime(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
): number | undefined {
  const expiresAt = attempt.paymentAuthorizationExpiresAt
  if (typeof expiresAt !== 'number') return undefined
  return Date.now() >= expiresAt ? expiresAt : undefined
}

function reconciliationReachedRetryable(
  reconciliation: Awaited<ReturnType<typeof reconcilePublicExecution>>,
): boolean {
  if (reconciliation.kind === 'refused') return false
  return reconciliation.status.control === 'retryable'
}

function managedSigningAttemptCanRecover(
  attempt: ManagedSigningAttempt,
): attempt is CompleteManagedSigningAttempt {
  return managedSigningAttemptStateCanRecover(attempt)
    && managedSigningMaterialIsComplete(attempt)
    && managedSigningEffectHasNotStarted(attempt)
}

function managedSigningAttemptStateCanRecover(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
): boolean {
  if (attempt.state === 'reconciliation_required') {
    return attempt.settlementStatus === 'unknown'
      && attempt.paymentResponseDigest === undefined
      && attempt.reconciliationEvidenceRef === undefined
      && attempt.reconciliationEvidenceDigest === undefined
  }
  if (attempt.state !== 'observed') return false
  return attempt.settlementStatus === 'not_settled'
    && attempt.paymentResponseDigest !== undefined
    && attempt.reconciliationEvidenceRef !== undefined
    && attempt.reconciliationEvidenceDigest !== undefined
}

function managedSigningMaterialIsComplete(
  attempt: ManagedSigningAttempt,
): attempt is CompleteManagedSigningAttempt {
  return [
    attempt.paymentUnsignedMaterialJson,
    attempt.paymentUnsignedMaterialDigest,
    attempt.paymentSigningIdempotencyKey,
    attempt.paymentPayer,
    attempt.paymentNonce,
    attempt.paymentAuthorizationValidBefore,
    attempt.paymentAuthorizationExpiresAt,
    attempt.paymentSigningClaimedAt,
  ].every((value) => value !== undefined)
}

function managedSigningEffectHasNotStarted(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
): boolean {
  return attempt.paymentSignatureDigest === undefined
    && attempt.submissionStartedAt === undefined
    && attempt.evidenceRefs.length === 0
}

export { EVIDENCE_SOURCE as MANAGED_SIGNING_RECOVERY_EVIDENCE_SOURCE }
