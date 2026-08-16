/**
 * Qualified Use delivery receipts (ADR-034).
 *
 * A Qualified Use is one authorized production invocation whose pinned contract
 * accepted the input and whose terminal supplier result passed output/evidence
 * validation. It is evidence only: Action Invocation stays the lifecycle
 * authority and the money ledger stays the economic authority. Receipts are
 * immutable — corrections append reversal facts elsewhere rather than mutating
 * delivery history.
 */
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const QUALIFIED_USE_PRINCIPAL_CLASSES = [
  'agent_key',
  'human_owner',
  'service',
] as const
export type QualifiedUsePrincipalClass =
  (typeof QUALIFIED_USE_PRINCIPAL_CLASSES)[number]

/**
 * Identity of the delivery being attested. Permanently unique per receipt.
 */
export type QualifiedUseIdentity = Readonly<{
  invocationRef: string
  attemptRef: string
  effectGeneration: number
}>

/**
 * Supplier-, contract-, and evidence-bound material. Any change to these fields
 * under an existing identity is a conflict, never an update.
 */
export type QualifiedUseMaterial = Readonly<{
  businessId: string
  operationRef: string
  publicationRef: string
  publicationRevision: number
  contractDigest: string
  bindingDigest: string
  principalClass: QualifiedUsePrincipalClass
  requestDigest: string
  responseDigest: string
  evidenceRefs: readonly string[]
}>

export type QualifiedUseReceipt = QualifiedUseIdentity &
  QualifiedUseMaterial &
  Readonly<{
    qualifiedUseRef: string
    materialDigest: string
    environment: 'production'
    qualifiedAt: number
    usageRef?: string
    transactionRef?: string
  }>

export const QUALIFIED_USE_EXCLUSIONS = [
  'non_production_environment',
  'delivery_not_contract_valid',
  'outcome_uncertain',
  'owner_self_invocation',
  'refunded_before_delivery',
] as const
export type QualifiedUseExclusion = (typeof QUALIFIED_USE_EXCLUSIONS)[number]

export type QualifiedUseEligibility =
  | Readonly<{ kind: 'qualified' }>
  | Readonly<{ kind: 'excluded'; reason: QualifiedUseExclusion }>

export type QualifiedUseWriteDecision =
  | Readonly<{ kind: 'write'; receipt: QualifiedUseReceipt }>
  | Readonly<{ kind: 'replay'; receipt: QualifiedUseReceipt }>
  | Readonly<{ kind: 'refused'; code: 'qualified_use_identity_conflict' }>

export function qualifiedUseRef(identity: QualifiedUseIdentity): string {
  return `qualified-use:v1:${identity.invocationRef}:${identity.attemptRef}:${identity.effectGeneration}`
}

export function qualifiedUseMaterialDigest(
  input: QualifiedUseIdentity & QualifiedUseMaterial,
): string {
  return canonicalDigest({
    format: 'ae.money.qualified-use-material:v1',
    invocationRef: input.invocationRef,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
    businessId: input.businessId,
    operationRef: input.operationRef,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractDigest: input.contractDigest,
    bindingDigest: input.bindingDigest,
    principalClass: input.principalClass,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    evidenceRefs: [...input.evidenceRefs].sort(),
  } as StableHashValue)
}

export function sameQualifiedUseIdentity(
  left: QualifiedUseIdentity,
  right: QualifiedUseIdentity,
): boolean {
  return (
    left.invocationRef === right.invocationRef &&
    left.attemptRef === right.attemptRef &&
    left.effectGeneration === right.effectGeneration
  )
}

/**
 * ADR-034 exclusions. Payment authorization, HTTP success, and provider
 * assertion are each insufficient on their own — only a contract-valid
 * production delivery with a settled release qualifies.
 */
export function qualifiedUseEligibility(
  input: Readonly<{
    environment: string
    contractValidOutput: boolean
    releaseOutcome: 'released' | 'not_released' | 'uncertain'
    ownerSelfInvocation: boolean
    refundedBeforeDelivery: boolean
  }>,
): QualifiedUseEligibility {
  if (input.environment !== 'production')
    return { kind: 'excluded', reason: 'non_production_environment' }
  if (input.ownerSelfInvocation)
    return { kind: 'excluded', reason: 'owner_self_invocation' }
  if (input.releaseOutcome === 'uncertain')
    return { kind: 'excluded', reason: 'outcome_uncertain' }
  if (!input.contractValidOutput || input.releaseOutcome !== 'released')
    return { kind: 'excluded', reason: 'delivery_not_contract_valid' }
  if (input.refundedBeforeDelivery)
    return { kind: 'excluded', reason: 'refunded_before_delivery' }
  return { kind: 'qualified' }
}

export function buildQualifiedUseReceipt(
  input: QualifiedUseIdentity &
    QualifiedUseMaterial &
    Readonly<{
      qualifiedAt: number
      usageRef?: string
      transactionRef?: string
    }>,
): QualifiedUseReceipt {
  return {
    qualifiedUseRef: qualifiedUseRef(input),
    materialDigest: qualifiedUseMaterialDigest(input),
    invocationRef: input.invocationRef,
    attemptRef: input.attemptRef,
    effectGeneration: input.effectGeneration,
    businessId: input.businessId,
    operationRef: input.operationRef,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractDigest: input.contractDigest,
    bindingDigest: input.bindingDigest,
    principalClass: input.principalClass,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    evidenceRefs: input.evidenceRefs,
    environment: 'production',
    qualifiedAt: input.qualifiedAt,
    ...(input.usageRef === undefined ? {} : { usageRef: input.usageRef }),
    ...(input.transactionRef === undefined
      ? {}
      : { transactionRef: input.transactionRef }),
  }
}

/**
 * Insert-once with exact replay. A repeat of the same identity carrying the
 * same material digest returns the original receipt; changed material under the
 * same identity is refused rather than reconciled.
 */
export function decideQualifiedUseWrite(
  input: Readonly<{
    existing: QualifiedUseReceipt | undefined
    candidate: QualifiedUseReceipt
  }>,
): QualifiedUseWriteDecision {
  const { existing, candidate } = input
  if (existing === undefined) return { kind: 'write', receipt: candidate }
  if (
    !sameQualifiedUseIdentity(existing, candidate) ||
    existing.qualifiedUseRef !== candidate.qualifiedUseRef ||
    existing.materialDigest !== candidate.materialDigest
  )
    return { kind: 'refused', code: 'qualified_use_identity_conflict' }
  return { kind: 'replay', receipt: existing }
}
