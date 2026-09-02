import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  reconcilePublicInvocation,
  type ReconciliationEvidence,
} from '@/modules/action-invocation/runtime'
import {
  externalSpendIdentityMatchingReservationRef,
  exactAmountSchema,
  type ExternalSpendIdentity,
} from '@/modules/money/public'
import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  projectPersistedRecovery,
  projectRecoveryOuter,
  recoveryNotFound,
  retryableRecoveryResult,
} from '../../../../../convex/capabilityOperationInvocationProjection'
import { externalSpendPaymentFactsFromDispatch } from '../x402Route'
import {
  loadReadyRecoveryWork,
  type RecoveryWorkContext,
} from './loading'
import type { RecoveryIdentity, RecoveryResult } from './contracts'

const PRE_SUBMISSION_EVIDENCE_SOURCE = 'x402_pre_submission_absence:server_persisted:v1' as const

type PaymentAttempt = NonNullable<RecoveryWorkContext['x402Attempt']>

type PreSubmissionProof = Readonly<{
  evidence: ReconciliationEvidence
  externalIdentity: ExternalSpendIdentity
  paymentResponseDigest: string
  transportObservationDigest: string
  transportRequestDigest: string
  paymentObservationDigest: string
  observedAt: number
}>

export async function reconcilePreSubmissionRecovery(
  ctx: ActionCtx,
  args: RecoveryIdentity,
): Promise<RecoveryResult> {
  const loaded = await loadReadyRecoveryWork(ctx, args)
  if (loaded.kind === 'not_found') return recoveryNotFound(args.invocationRef)
  if (loaded.kind === 'persisted') return projectPersistedRecovery(loaded.recovered)
  const { work } = loaded
  const proof = preparePreSubmissionProof(work)
  if (proof === undefined) return recoveryNotFound(args.invocationRef)

  const alreadyRetryable = work.control.control.control.state === 'retryable'
  if (!recoveryControlCanProceed(work, alreadyRetryable)) {
    return recoveryNotFound(args.invocationRef)
  }

  let money: PreSubmissionMoneyResult
  try {
    money = await reconcilePreSubmissionMoney(ctx, work, proof)
  } catch {
    return projectPersistedRecovery(work.recovered)
  }
  if (money.kind === 'not_reconciled') return projectPersistedRecovery(work.recovered)

  // A replay may observe the canonical control after reconciliation committed
  // but before the outer projection was cleared. Re-run the idempotent money
  // mutation first so retryable control alone can never bypass the released
  // reservation and not-settled payment proof.
  if (alreadyRetryable) return await projectRetryableRecovery(ctx, work)

  work.trustedReconciliationEvidenceDigest.value = canonicalDigest(proof.evidence as StableHashValue)
  const actor = {
    callerRef: work.recovered.credentialId,
    principalRef: work.recovered.principalId,
  }
  const reconciliation = await reconcilePublicInvocation({
    tracer: work.tracer,
    invocationRef: work.recovered.invocationRef,
    attemptRef: proof.evidence.attemptRef,
    actor,
    origin: { kind: 'standalone', ...actor },
    evidence: proof.evidence,
  })
  if (reconciliation.kind === 'refused' || reconciliation.status.control !== 'retryable') {
    return projectPersistedRecovery(work.recovered)
  }
  return await projectRetryableRecovery(ctx, work)
}

type PreSubmissionMoneyResult = Readonly<{
  kind: 'accepted' | 'replayed' | 'not_reconciled'
}>

async function reconcilePreSubmissionMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  proof: PreSubmissionProof,
): Promise<PreSubmissionMoneyResult> {
  const attempt = work.x402Attempt
  if (attempt === null) return { kind: 'not_reconciled' }
  if (work.recovered.sellerOnboardingCanary !== undefined) {
    return await ctx.runMutation(
      internal.capabilityOperationPreSubmissionRecovery.reconcilePreSubmissionX402Money,
      {
        ...proof.externalIdentity,
        inputDigest: work.recovered.inputDigest,
        authorizationDigest: attempt.authorizationDigest,
        paymentResponseDigest: proof.paymentResponseDigest,
        evidenceRef: proof.evidence.evidenceRef,
        evidenceDigest: proof.evidence.digest,
        transportObservationDigest: proof.transportObservationDigest,
        transportRequestDigest: proof.transportRequestDigest,
        paymentObservationDigest: proof.paymentObservationDigest,
        observedAt: proof.observedAt,
      },
    )
  }
  const result = await ctx.runMutation(
    internal.moneyManagedCallLifecycle.releaseBeforeSubmissionWithX402Proof,
    {
      invocationRef: work.recovered.invocationRef,
      attemptRef: proof.evidence.attemptRef,
      effectGeneration: proof.evidence.effectGeneration,
      operationRef: work.recovered.operationRef,
      inputDigest: work.recovered.inputDigest,
      reservationRef: proof.externalIdentity.reservationRef,
      paymentIdentifier: attempt.paymentIdentifier,
      challengeDigest: attempt.challengeDigest,
      evidenceRef: proof.evidence.evidenceRef,
      evidenceDigest: proof.evidence.digest,
      paymentResponseDigest: proof.paymentResponseDigest,
      transportObservationDigest: proof.transportObservationDigest,
      transportRequestDigest: proof.transportRequestDigest,
      paymentObservationDigest: proof.paymentObservationDigest,
      observedAt: proof.observedAt,
    },
  )
  if (result.kind !== 'accepted') return { kind: 'not_reconciled' }
  return { kind: result.replayed ? 'replayed' : 'accepted' }
}

export function recoveryControlCanProceed(
  work: RecoveryWorkContext,
  alreadyRetryable: boolean,
): boolean {
  return [alreadyRetryable, isCanonicalReconciliationTarget(work)].some(Boolean)
}

export function isCanonicalReconciliationTarget(work: RecoveryWorkContext): boolean {
  const { recovered, control, x402Attempt, attemptRows } = work
  const canonical = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration
  const currentAttempt = attemptRows.find((attempt) => attempt.attemptRef === attemptRef)
  return outerReconciliationMatches(recovered, attemptRef, effectGeneration)
    && canonicalReconciliationMatches(canonical, attemptRef)
    && paymentAttemptMatchesCurrent(x402Attempt, attemptRef, effectGeneration)
    && durableAttemptProvesUncertainty(currentAttempt, effectGeneration)
}

function outerReconciliationMatches(
  recovered: RecoveryWorkContext['recovered'],
  attemptRef: string | undefined,
  effectGeneration: number | undefined,
): boolean {
  return [
    recovered.state === 'reconciliation_required',
    recovered.result?.kind === 'reconciliation_required',
    recovered.attemptRef === attemptRef,
    recovered.result?.kind === 'reconciliation_required'
      && recovered.result.evidence.attemptRef === attemptRef,
    recovered.result?.kind === 'reconciliation_required'
      && recovered.result.evidence.effectGeneration === effectGeneration,
    attemptRef !== undefined,
    effectGeneration !== undefined,
  ].every(Boolean)
}

function canonicalReconciliationMatches(
  canonical: RecoveryWorkContext['control']['control']['control'],
  attemptRef: string | undefined,
): boolean {
  return canonical.state === 'reconciliation_required'
    && canonical.attemptRef === attemptRef
}

function paymentAttemptMatchesCurrent(
  x402Attempt: RecoveryWorkContext['x402Attempt'],
  attemptRef: string | undefined,
  effectGeneration: number | undefined,
): boolean {
  return [
    x402Attempt !== null,
    x402Attempt?.attemptRef === attemptRef,
    x402Attempt?.effectGeneration === effectGeneration,
  ].every(Boolean)
}

function durableAttemptProvesUncertainty(
  currentAttempt: RecoveryWorkContext['attemptRows'][number] | undefined,
  effectGeneration: number | undefined,
): boolean {
  return [
    currentAttempt?.effectGeneration === effectGeneration,
    currentAttempt?.outcome.state === 'uncertain' || currentAttempt?.outcome.state === 'timed_out',
    currentAttempt?.release.state === 'possibly_released',
  ].every(Boolean)
}

function preparePreSubmissionProof(work: RecoveryWorkContext): PreSubmissionProof | undefined {
  const { recovered, operation, x402Attempt } = work
  const providerRef = operationProviderRef(operation)
  if (!recoveryScopeIsEligible(work, providerRef)) return undefined
  if (x402Attempt === null || providerRef === undefined) return undefined
  const externalIdentity = externalIdentityForAttempt(work, x402Attempt)
  if (externalIdentity === undefined) return undefined

  const observedAt = reconciliationObservedAt(recovered)
  if (observedAt === undefined) return undefined
  const proofMaterial = {
    format: 'ae.x402-pre-submission-absence-proof:v1',
    invocationRef: recovered.invocationRef,
    attemptRef: x402Attempt.attemptRef,
    effectGeneration: x402Attempt.effectGeneration,
    operationRef: recovered.operationRef,
    inputDigest: recovered.inputDigest,
    paymentIdentifier: x402Attempt.paymentIdentifier,
    challengeDigest: x402Attempt.challengeDigest,
    reservationRef: x402Attempt.reservationRef,
    custodyRef: x402Attempt.custodyRef,
    authorizationDigest: x402Attempt.authorizationDigest,
    paymentIdentityDigest: x402Attempt.paymentIdentityDigest,
    requestFingerprint: x402Attempt.requestFingerprint,
    conclusion: 'submission_never_started',
    resolution: 'not_released',
    observedAt: new Date(observedAt).toISOString(),
  } as const
  const absenceDigest = canonicalDigest(proofMaterial as StableHashValue)
  const evidenceRef = `x402-pre-submission-recovery:${absenceDigest}`
  const {
    transportObservationDigest,
    transportRequestDigest,
    paymentObservationDigest,
  } = preSubmissionObservationDigests(x402Attempt, absenceDigest)
  const paymentResponseDigest = canonicalDigest({
    format: 'ae.x402-pre-submission-no-payment-response:v1',
    absenceDigest,
  })
  const evidenceMaterial = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef,
    source: `published-operation:${operation.operationId}`,
    invocationRef: recovered.invocationRef,
    attemptRef: x402Attempt.attemptRef,
    effectGeneration: x402Attempt.effectGeneration,
    operationRef: recovered.operationRef,
    inputDigest: recovered.inputDigest,
    requestDigest: recovered.requestDigest,
    providerIdentity: providerRef,
    paymentIdentifier: x402Attempt.paymentIdentifier,
    transportObservationDigest,
    paymentObservationDigest,
    resolution: 'not_released' as const,
    observedAt: new Date(observedAt).toISOString(),
  }
  const evidence = {
    ...evidenceMaterial,
    digest: canonicalDigest(evidenceMaterial as StableHashValue),
  }
  return {
    evidence,
    externalIdentity,
    paymentResponseDigest,
    transportObservationDigest,
    transportRequestDigest,
    paymentObservationDigest,
    observedAt,
  }
}

function reconciliationObservedAt(
  recovered: RecoveryWorkContext['recovered'],
): number | undefined {
  if (recovered.result?.kind !== 'reconciliation_required') return undefined
  const observedAt = Date.parse(recovered.result.evidence.requiredAt)
  return Number.isFinite(observedAt) ? observedAt : undefined
}

function preSubmissionObservationDigests(attempt: PaymentAttempt, absenceDigest: string) {
  return {
    transportObservationDigest: attempt.transportObservationDigest
      ?? canonicalDigest({ format: 'ae.x402-pre-submission-transport-observation:v1', absenceDigest }),
    transportRequestDigest: attempt.transportRequestDigest
      ?? canonicalDigest({ format: 'ae.x402-pre-submission-transport-request:v1', absenceDigest }),
    paymentObservationDigest: attempt.paymentObservationDigest
      ?? canonicalDigest({ format: 'ae.x402-pre-submission-payment-observation:v1', absenceDigest }),
  }
}

function operationProviderRef(operation: RecoveryWorkContext['operation']): string | undefined {
  return operation.binding.authority.kind === 'provider_connection'
    ? operation.binding.authority.providerRef
    : undefined
}

function recoveryScopeIsEligible(
  work: RecoveryWorkContext,
  providerRef: string | undefined,
): boolean {
  const { recovered, operation, x402Attempt, control } = work
  return (invocationIsSandboxSellerCanary(recovered) || work.managedReservation !== null)
    && operation.identity.adapterId === 'x402-fetch:v2'
    && providerRef !== undefined
    && paymentIdentityMatchesInvocation(x402Attempt, recovered)
    && control.currentAttemptRef !== undefined
    && control.currentEffectGeneration !== undefined
    && x402Attempt !== null
    && paymentAttemptIsPristineOrExactReplay(x402Attempt)
}

function invocationIsSandboxSellerCanary(recovered: RecoveryWorkContext['recovered']): boolean {
  return recovered.environment === 'sandbox' && recovered.sellerOnboardingCanary !== undefined
}

function paymentIdentityMatchesInvocation(
  attempt: RecoveryWorkContext['x402Attempt'],
  recovered: RecoveryWorkContext['recovered'],
): boolean {
  if (attempt === null) return false
  return attempt.dispatchRef === recovered.invocationRef
    && attempt.operationRef === recovered.operationRef
    && attempt.inputDigest === recovered.inputDigest
}

function paymentAttemptIsPristineOrExactReplay(attempt: PaymentAttempt): boolean {
  const noSigningOrSubmissionMaterial = [
    attempt.paymentUnsignedMaterialJson,
    attempt.paymentUnsignedMaterialDigest,
    attempt.paymentSigningIdempotencyKey,
    attempt.paymentSignatureDigest,
    attempt.paymentPayer,
    attempt.paymentNonce,
    attempt.paymentAuthorizationValidBefore,
    attempt.paymentAuthorizationExpiresAt,
    attempt.paymentSigningClaimedAt,
    attempt.submissionStartedAt,
  ].every((value) => value === undefined)
  if (!noSigningOrSubmissionMaterial || attempt.evidenceRefs.length !== 0) return false
  return pristinePaymentAttempt(attempt) || reconciledPaymentAttempt(attempt)
}

function pristinePaymentAttempt(attempt: PaymentAttempt): boolean {
  return [
    attempt.state === 'reconciliation_required',
    attempt.settlementStatus === 'unknown',
    attempt.paymentResponseDigest === undefined,
    attempt.reconciliationEvidenceRef === undefined,
    attempt.reconciliationEvidenceDigest === undefined,
  ].every(Boolean)
}

function reconciledPaymentAttempt(attempt: PaymentAttempt): boolean {
  return [
    attempt.state === 'observed',
    attempt.settlementStatus === 'not_settled',
    attempt.paymentResponseDigest !== undefined,
    attempt.reconciliationEvidenceRef !== undefined,
    attempt.reconciliationEvidenceDigest !== undefined,
  ].every(Boolean)
}

export function externalIdentityForAttempt(
  work: RecoveryWorkContext,
  attempt: PaymentAttempt,
): ExternalSpendIdentity | undefined {
  const authority = work.operation.binding.authority
  if (authority.kind !== 'provider_connection') return undefined
  const amount = exactAmountSchema.safeParse({
    units: attempt.amountUnits,
    currency: attempt.currency,
    exponent: attempt.exponent,
  })
  if (!amount.success || attempt.reservationRef === undefined) return undefined
  const custodyFields = [
    attempt.custodyBudgetRef,
    attempt.custodyGeneration,
    attempt.custodyDailyMaximumUnits,
  ]
  if (custodyFields.some((value) => value === undefined)) return undefined
  const dailyMaximum = exactAmountSchema.safeParse({
    units: attempt.custodyDailyMaximumUnits,
    currency: attempt.currency,
    exponent: attempt.exponent,
  })
  if (
    !dailyMaximum.success
    || typeof attempt.custodyBudgetRef !== 'string'
    || typeof attempt.custodyGeneration !== 'number'
  ) return undefined
  return externalSpendIdentityMatchingReservationRef(
    externalSpendPaymentFactsFromDispatch(work.recovered, {
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      providerRef: authority.providerRef,
      paymentIdentifier: attempt.paymentIdentifier,
      challengeDigest: attempt.challengeDigest,
      amount: amount.data,
      custodyRef: attempt.custodyBudgetRef,
      custodyGeneration: attempt.custodyGeneration,
      custodyDailyMaximum: dailyMaximum.data,
    }),
    attempt.reservationRef,
  )
}

export async function projectRetryableRecovery(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
): Promise<RecoveryResult> {
  const retryable = retryableRecoveryResult(work.recovered)
  await projectRecoveryOuter(ctx, work.recovered, retryable, 'pending', {
    clearResult: true,
    clearWorkId: true,
    clearAttemptRef: true,
    clearEvidenceHash: true,
    clearDispatchState: true,
  })
  return retryable
}

export { PRE_SUBMISSION_EVIDENCE_SOURCE }
