import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  readPublicInvocationStatus,
  type ReconciliationEvidence,
} from '@/modules/action-invocation/runtime'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/runtime'
import type { OperationInvokeReceipt } from '@/modules/capability-execution/operation-invoke-contracts'
import { verifyExactEvmX402Settlement } from '@/modules/capability-supply/server'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { externalSpendIdentityMatchingReservationRef } from '@/modules/money/public'
import { Agent } from 'undici'
import type { Infer } from 'convex/values'

import type { ActionCtx } from '../../../../../convex/_generated/server'
import { internal } from '../../../../../convex/_generated/api'
import {
  finalizeBrokeredInvocationCharge,
  markBrokeredInvocationChargeOutcomeUnknown,
  releaseBrokeredInvocationCharge,
} from '../charge'
import { externalSpendPaymentFactsFromDispatch, readX402EvmReceipt } from '../x402Route'
import type { RecoveryWorkContext } from './loading'

type X402Evidence = Infer<typeof x402PaymentReconciliationEvidenceValue>
type RecoveryStatus = Exclude<Awaited<ReturnType<typeof readPublicInvocationStatus>>, { kind: 'refused' }>

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
  if (facts === undefined || !validSubmittedEvidence(work, submitted, facts)) {
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  if (!await verifySettlement(work, submitted)) {
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
  if (!await persistX402Money(ctx, work, submitted, facts.externalIdentity, facts.observedAt)) {
    return { kind: 'required', status, receipt: reconciliationReceipt }
  }
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
      submitted.settlementStatus === 'settled' ? submitted.transactionHash : undefined,
      submitted.paymentIdentifier,
      submitted.settlementStatus === 'settled' ? 'not_applicable' : 'released',
      'none',
    ),
  }
}

function x402EvidenceFacts(work: RecoveryWorkContext, submitted: X402Evidence) {
  const { recovered, operation, x402Attempt } = work
  const providerRef = operation.binding.authority.kind === 'provider_connection'
    ? operation.binding.authority.providerRef
    : undefined
  if (x402Attempt === null || providerRef === undefined) return undefined
  const paymentFacts = externalSpendPaymentFactsFromDispatch({
    invocationRef: recovered.invocationRef,
    principalId: recovered.principalId,
    credentialId: recovered.credentialId,
    grantRef: recovered.grantRef,
    grantGeneration: recovered.grantGeneration,
    environment: recovered.environment,
    operationRef: recovered.operationRef,
  }, {
    attemptRef: submitted.attemptRef,
    effectGeneration: submitted.effectGeneration,
    providerRef,
    paymentIdentifier: submitted.paymentIdentifier,
    challengeDigest: submitted.challengeDigest,
    amount: submitted.amount,
  })
  const externalIdentity = externalSpendIdentityMatchingReservationRef(paymentFacts, submitted.reservationRef)
  const observedAt = Date.parse(submitted.observedAt)
  return externalIdentity === undefined ? undefined : { providerRef, externalIdentity, observedAt }
}

function validSubmittedEvidence(
  work: RecoveryWorkContext,
  submitted: X402Evidence,
  facts: NonNullable<ReturnType<typeof x402EvidenceFacts>>,
): boolean {
  const { recovered, operation, x402Attempt } = work
  if (operation.identity.adapterId !== 'x402-fetch:v2' || x402Attempt === null) return false
  return invocationEvidenceMatches(recovered, submitted)
    && amountEvidenceMatches(x402Attempt, submitted)
    && facts.providerRef === submitted.providerRef
    && /^0x[0-9a-fA-F]{64}$/.test(submitted.transactionHash)
    && paymentResponseDigestMatches(x402Attempt.paymentResponseDigest, submitted.paymentResponseDigest)
    && Number.isFinite(facts.observedAt)
    && submittedDigestMatches(submitted)
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
      submitted.transactionHash,
      dispatcher,
      work.recovered.environment,
      attempt.paymentPayer,
      attempt.paymentNonce,
    ).catch(() => undefined)
    return settlementReceiptMatches(attempt, submitted, receipt)
  } finally {
    await dispatcher.close().catch(() => undefined)
  }
}

function settlementReceiptMatches(
  attempt: NonNullable<RecoveryWorkContext['x402Attempt']>,
  submitted: X402Evidence,
  receipt: Awaited<ReturnType<typeof readX402EvmReceipt>> | undefined,
): boolean {
  if (attempt.paymentPayer === undefined || attempt.paymentNonce === undefined) return false
  const verification = {
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
  return failedSettlementVerified(verification, receipt)
}

function failedSettlementVerified(
  verification: Omit<Parameters<typeof verifyExactEvmX402Settlement>[0], 'receipt'>,
  receipt: Awaited<ReturnType<typeof readX402EvmReceipt>> | undefined,
): boolean {
  if (receipt === undefined || receipt.confirmations < 12n || receipt.authorizationState !== false) return false
  return receipt.status === 'reverted'
    || !verifyExactEvmX402Settlement({ ...verification, receipt: { ...receipt, authorizationState: true } })
}

async function persistX402Money(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  submitted: X402Evidence,
  externalIdentity: NonNullable<ReturnType<typeof externalSpendIdentityMatchingReservationRef>>,
  observedAt: number,
): Promise<boolean> {
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
  const external = payment.kind === 'settled'
    ? await ctx.runMutation(internal.moneyLedger.reconcileExternalInvocationSpend, {
        ...externalIdentity,
        settlementStatus: submitted.settlementStatus,
        paymentResponseDigest: submitted.paymentResponseDigest,
        evidenceRef: submitted.evidenceRef,
        evidenceDigest: submitted.digest,
        observedAt,
      })
    : { kind: 'refused' as const }
  const brokered = await reconcileBrokeredMoney(ctx, work, submitted, payment.kind, external.kind)
  return payment.kind === 'settled'
    && external.kind === 'accepted'
    && brokered.kind !== 'reconciliation_required'
}

async function reconcileBrokeredMoney(
  ctx: ActionCtx,
  work: RecoveryWorkContext,
  submitted: X402Evidence,
  paymentKind: string,
  externalKind: string,
) {
  if (work.brokeredReservation === undefined) return { kind: 'settled' as const }
  if (paymentKind !== 'settled' || externalKind !== 'accepted') {
    return await markBrokeredInvocationChargeOutcomeUnknown(ctx, work.brokeredReservation)
  }
  const refs = [submitted.evidenceRef, submitted.digest]
  return submitted.settlementStatus === 'settled'
    ? await finalizeBrokeredInvocationCharge(ctx, work.brokeredReservation, submitted.transactionHash, refs)
    : await releaseBrokeredInvocationCharge(ctx, work.brokeredReservation, refs)
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
