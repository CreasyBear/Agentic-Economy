import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  readPublicInvocationStatus,
  type ReconciliationEvidence,
} from '@/modules/action-invocation/runtime'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/runtime'
import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import {
  verifyExactEvmX402AuthorizationCancellation,
  verifyExactEvmX402AuthorizationTransaction,
  verifyExactEvmX402Settlement,
} from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { Agent } from 'undici'
import type { Infer } from 'convex/values'

import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import { readX402EvmReceipt } from '../x402Route'
import type { RecoveryWorkContext } from './loading'

type X402Evidence = Infer<typeof x402PaymentReconciliationEvidenceValue>
type RecoveryStatus = Exclude<Awaited<ReturnType<typeof readPublicInvocationStatus>>, { kind: 'refused' }>

type FailedAuthorizationAttempt = Readonly<{
  asset: string
  paymentPayer?: string
  paymentNonce?: string
  paymentAuthorizationExpiresAt?: number
}>

type FailedAuthorizationReceipt = Awaited<ReturnType<typeof readX402EvmReceipt>>

export type X402EvidencePreparation =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'required'; status: RecoveryStatus; receipt: OperationInvokeReceipt | undefined }>
  | Readonly<{
      kind: 'prepared'
      status: RecoveryStatus
      evidence: ReconciliationEvidence
      outcomeReceipt: OperationInvokeReceipt | undefined
    }>

export async function prepareX402RecoveryEvidence(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  submitted: X402Evidence,
): Promise<X402EvidencePreparation> {
  const { recovered, brokeredReceipt } = work
  const status = await readPublicInvocationStatus({
    port: work.port,
    invocationRef: recovered.invocationRef,
    actor: { callerRef: recovered.credentialId, principalRef: recovered.principalId },
  })
  if (status.kind === 'refused') return { kind: 'not_found' }
  const reconciliationReceipt = brokeredReceipt(
    'reconciliation_required', submitted.digest, submitted.observedAt,
    undefined, undefined, submitted.paymentIdentifier, 'unknown', 'unknown',
  )
  const facts = x402EvidenceFacts(work, submitted)
  if (facts === undefined) {
    recordX402RecoveryStage(submitted, 'payment_facts_unavailable')
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  if (!validSubmittedEvidence(work, submitted, facts)) {
    recordX402RecoveryStage(submitted, 'submitted_evidence_invalid')
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  if (!await verifySettlement(work, submitted)) {
    recordX402RecoveryStage(submitted, 'settlement_verification_failed')
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  if (!await persistX402Money(ctx, work, submitted, facts.observedAt)) {
    recordX402RecoveryStage(submitted, 'money_reconciliation_failed')
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  recordX402RecoveryStage(submitted, 'prepared')
  const evidence = canonicalRecoveryEvidence(submitted)
  work.trustedReconciliationEvidenceDigest.value = canonicalDigest(evidence as StableHashValue)
  return {
    kind: 'prepared',
    status,
    evidence,
    outcomeReceipt: brokeredReceipt(
      submitted.settlementStatus === 'settled' ? 'settled' : 'refunded',
      evidence.digest,
      evidence.observedAt,
      submitted.settlementStatus === 'settled' ? submitted.transactionHash : undefined,
      submitted.transactionHash,
      submitted.paymentIdentifier,
      submitted.settlementStatus === 'settled' ? 'not_applicable' : 'released',
      'none',
    ),
  }
}

function recordX402RecoveryStage(
  submitted: X402Evidence,
  stage:
    | 'payment_facts_unavailable'
    | 'submitted_evidence_invalid'
    | 'settlement_verification_failed'
    | 'money_reconciliation_failed'
    | 'prepared',
): void {
  console.info('x402_payment_recovery', {
    invocationRef: submitted.invocationRef,
    attemptRef: submitted.attemptRef,
    effectGeneration: submitted.effectGeneration,
    evidenceRef: submitted.evidenceRef,
    stage,
  })
}

function x402EvidenceFacts(work: RecoveryWorkContext, submitted: X402Evidence) {
  const { recovered, operation, x402Attempt } = work
  const providerRef = recoveryProviderRef(operation)
  if (
    x402Attempt === null
    || providerRef === undefined
    || recovered.sellerOnboardingCanary !== undefined
    || work.managedReservation === null
    || x402Attempt.reservationRef === undefined
  ) return undefined
  const acceptedRefs = [
    work.managedReservation.reservationRef,
    work.managedReservation.treasuryReservationRef,
  ].filter((value): value is string => typeof value === 'string')
  if (!acceptedRefs.includes(x402Attempt.reservationRef)) return undefined
  const observedAt = Date.parse(submitted.observedAt)
  return { providerRef, observedAt }
}

function recoveryProviderRef(operation: RecoveryWorkContext['operation']): string | undefined {
  return operation.binding.authority.kind === 'provider_connection'
    ? operation.binding.authority.providerRef
    : undefined
}

function validSubmittedEvidence(
  work: RecoveryWorkContext,
  submitted: X402Evidence,
  facts: NonNullable<ReturnType<typeof x402EvidenceFacts>>,
): boolean {
  const { recovered, operation, x402Attempt } = work
  if (operation.identity.adapterId !== 'x402-fetch:v2' || x402Attempt === null) return false
  return invocationEvidenceMatches(recovered, submitted)
    && persistedAttemptEvidenceMatches(x402Attempt, submitted)
    && amountEvidenceMatches(x402Attempt, submitted)
    && facts.providerRef === submitted.providerRef
    && /^0x[0-9a-fA-F]{64}$/.test(submitted.transactionHash)
    && paymentResponseDigestMatches(x402Attempt.paymentResponseDigest, submitted.paymentResponseDigest)
    && Number.isFinite(facts.observedAt)
    && submittedDigestMatches(submitted)
}

function persistedAttemptEvidenceMatches(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
  submitted: X402Evidence,
): boolean {
  return submitted.attemptRef === attempt.attemptRef
    && submitted.effectGeneration === attempt.effectGeneration
    && submitted.paymentIdentifier === attempt.paymentIdentifier
    && submitted.challengeDigest === attempt.challengeDigest
    && submitted.reservationRef === attempt.reservationRef
}

function invocationEvidenceMatches(
  recovered: RecoveryWorkContext['recovered'],
  submitted: X402Evidence,
): boolean {
  return submitted.invocationRef === recovered.invocationRef
    && submitted.operationRef === recovered.operationRef
    && submitted.inputDigest === recovered.inputDigest
}

function amountEvidenceMatches(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
  submitted: X402Evidence,
): boolean {
  return submitted.amount.units === attempt.amountUnits
    && submitted.amount.currency === attempt.currency
    && submitted.amount.exponent === attempt.exponent
}

function paymentResponseDigestMatches(expected: string | undefined, submitted: string): boolean {
  return expected === undefined || expected === submitted
}

function submittedDigestMatches(submitted: X402Evidence): boolean {
  const { digest, ...material } = submitted
  return canonicalDigest(material as StableHashValue) === digest
}

async function verifySettlement(work: RecoveryWorkContext, submitted: X402Evidence): Promise<boolean> {
  const attempt = work.x402Attempt
  if (attempt === null || attempt.paymentPayer === undefined || attempt.paymentNonce === undefined) return false
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  try {
    const receipt = await readX402EvmReceipt(
      attempt.network,
      attempt.asset,
      submitted.transactionHash,
      dispatcher,
      work.recovered.environment,
      attempt.paymentPayer,
      attempt.paymentNonce,
    ).catch(() => undefined)
    return settlementReceiptMatches(
      attempt,
      submitted,
      receipt,
      work.recovered.environment,
    )
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function settlementReceiptMatches(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
  submitted: X402Evidence,
  receipt: Awaited<ReturnType<typeof readX402EvmReceipt>> | undefined,
  aeEnvironment: RecoveryWorkContext['recovered']['environment'],
): boolean {
  if (attempt.paymentPayer === undefined || attempt.paymentNonce === undefined) return false
  const verification = {
    aeEnvironment,
    response: {
      success: true,
      transaction: submitted.transactionHash,
      network: attempt.network,
      amount: attempt.amountUnits,
      payer: attempt.paymentPayer,
    },
    requirement: {
      scheme: attempt.scheme,
      network: attempt.network,
      amount: attempt.amountUnits,
      asset: attempt.asset,
      payTo: attempt.payTo,
    },
    payer: attempt.paymentPayer,
    paymentNonce: attempt.paymentNonce,
  }
  if (submitted.settlementStatus === 'settled') {
    return verifyExactEvmX402Settlement({ ...verification, receipt })
  }
  return failedX402SettlementVerified(verification, attempt, receipt)
}

export function failedX402SettlementVerified(
  verification: Omit<Parameters<typeof verifyExactEvmX402Settlement>[0], 'receipt'>,
  attempt: FailedAuthorizationAttempt,
  receipt: FailedAuthorizationReceipt,
): boolean {
  const disposition = failedX402SettlementAuthorizationDisposition(
    attempt,
    receipt,
    verification.aeEnvironment,
  )
  if (disposition === 'cancelled') return true
  return disposition === 'expired'
    && receipt?.status === 'reverted'
    && receipt.authorizationState === false
    && verifyExactEvmX402AuthorizationTransaction({
      ...verification,
      ...(attempt.paymentAuthorizationExpiresAt === undefined
        ? {}
        : { paymentAuthorizationExpiresAt: attempt.paymentAuthorizationExpiresAt }),
      receipt,
    })
}

/**
 * A reverted transaction leaves an EIP-3009 signature live. It is safe to
 * issue a fresh authorization only at/after the exclusive validBefore bound,
 * or when a confirmed token-contract cancellation consumed the exact nonce.
 */
export function failedX402SettlementAuthorizationDisposition(
  attempt: FailedAuthorizationAttempt,
  receipt: FailedAuthorizationReceipt,
  aeEnvironment: RecoveryWorkContext['recovered']['environment'],
): 'expired' | 'cancelled' | undefined {
  if (receipt === undefined || receipt.confirmations < 12n) return undefined
  if (verifyExactEvmX402AuthorizationCancellation({
    aeEnvironment,
    asset: attempt.asset,
    payer: attempt.paymentPayer,
    paymentNonce: attempt.paymentNonce,
    receipt,
  })) return 'cancelled'
  const expiresAt = attempt.paymentAuthorizationExpiresAt
  const authorizationExpired = [
    receipt.status === 'reverted',
    receipt.authorizationState === false,
    typeof expiresAt === 'number',
    typeof expiresAt === 'number' && Number.isSafeInteger(expiresAt),
    typeof expiresAt === 'number' && expiresAt > 0,
    typeof receipt.observedBlockTimestamp === 'bigint',
    typeof expiresAt === 'number'
      && receipt.observedBlockTimestamp * 1_000n >= BigInt(expiresAt),
  ].every(Boolean)
  return authorizationExpired
    ? 'expired'
    : undefined
}

async function persistX402Money(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  submitted: X402Evidence,
  observedAt: number,
): Promise<boolean> {
  if (work.recovered.sellerOnboardingCanary !== undefined) return false
  const payment = await ctx.runMutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, {
    dispatchRef: work.recovered.invocationRef,
    attemptRef: submitted.attemptRef,
    effectGeneration: submitted.effectGeneration,
    operationRef: submitted.operationRef,
    inputDigest: submitted.inputDigest,
    evidenceRef: submitted.evidenceRef,
    evidenceDigest: submitted.digest,
    reservationRef: submitted.reservationRef,
    paymentIdentifier: submitted.paymentIdentifier,
    challengeDigest: submitted.challengeDigest,
    settlementStatus: submitted.settlementStatus,
    amountUnits: submitted.amount.units,
    currency: submitted.amount.currency,
    exponent: submitted.amount.exponent,
    paymentResponseDigest: submitted.paymentResponseDigest,
    transportObservationDigest: submitted.transportObservationDigest,
    transportRequestDigest: submitted.requestDigest,
    paymentObservationDigest: submitted.paymentObservationDigest,
    observedAt,
  })
  if (payment.kind !== 'settled') {
    await ctx.runMutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      invocationRef: submitted.invocationRef,
      evidenceDigest: submitted.digest,
      now: observedAt,
    }).catch(() => undefined)
    console.warn('x402_payment_recovery_money', {
      invocationRef: submitted.invocationRef,
      attemptRef: submitted.attemptRef,
      effectGeneration: submitted.effectGeneration,
      payment: payment.kind,
      managedCall: 'outcome_unknown',
    })
    return false
  }
  if (submitted.settlementStatus !== 'settled') {
    await ctx.runMutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      invocationRef: submitted.invocationRef,
      evidenceDigest: submitted.digest,
      now: observedAt,
    })
    return false
  }
  const settled = await ctx.runAction(internal.moneyManagedCallLifecycle.settle, {
    invocationRef: submitted.invocationRef,
    evidenceDigest: submitted.digest,
    now: observedAt,
  })
  return settled.kind === 'accepted'
}

function canonicalRecoveryEvidence(submitted: X402Evidence): ReconciliationEvidence {
  const material = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef: submitted.evidenceRef,
    source: submitted.source,
    invocationRef: submitted.invocationRef,
    attemptRef: submitted.attemptRef,
    effectGeneration: submitted.effectGeneration,
    operationRef: submitted.operationRef,
    inputDigest: submitted.inputDigest,
    requestDigest: submitted.requestDigest,
    providerIdentity: submitted.providerRef,
    paymentIdentifier: submitted.paymentIdentifier,
    transportObservationDigest: submitted.transportObservationDigest,
    paymentObservationDigest: submitted.paymentObservationDigest,
    resolution: submitted.settlementStatus === 'settled' ? 'released' as const : 'not_released' as const,
    observedAt: submitted.observedAt,
  }
  return { ...material, digest: canonicalDigest(material as StableHashValue) }
}
