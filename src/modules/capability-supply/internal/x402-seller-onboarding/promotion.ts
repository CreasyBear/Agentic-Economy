import {
  projectSellerOnboardingCanaryStatus,
  type SellerOnboardingCanaryCommitment,
  type SellerOnboardingCanaryInvocationObservation,
  type SellerOnboardingCanaryPromotionEvidence,
} from './canary'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type X402SellerPromotionAnchor = Readonly<{
  ownerId: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  draftOperationRef: string
  operationMaterialDigest: string
  contractDigest: string
  bindingDigest: string
  priceDigest: string
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
}>

export type X402SellerPromotionRefusal =
  | 'evidence_invalid'
  | 'owner_mismatch'
  | 'target_drift'
  | 'seller_claim_stale'
  | 'funding_authority_invalid'
  | 'readiness_stale'
  | 'output_nondeterministic'
  | 'canary_pending'
  | 'reconciliation_required'
  | 'canary_identity_mismatch'
  | 'canary_expired'
  | 'operation_commitment_stale'
  | 'invocation_refused'
  | 'payment_not_settled'
  | 'payment_evidence_missing'
  | 'spend_commitment_mismatch'
  | 'output_contract_invalid'
  | 'output_unusable'

export type X402SellerPromotionResult =
  | Readonly<{
      kind: 'approved'
      target: X402SellerPromotionAnchor
      promotionEvidence: SellerOnboardingCanaryPromotionEvidence
      consumptionDigest: string
    }>
  | Readonly<{ kind: 'refused'; code: X402SellerPromotionRefusal }>

export type EvaluateX402SellerPromotionInput = Readonly<{
  actingOwnerId: string
  sealed: X402SellerPromotionAnchor
  current: X402SellerPromotionAnchor
  sellerClaimCurrent: boolean
  platformFundingAuthorized: boolean
  readinessCurrent: boolean
  outputDeterministic: boolean
  outputAssertionMatched: boolean
  expectedOutputEvidenceDigest: string
  outputDigest: string
  commitment: SellerOnboardingCanaryCommitment
  observation: SellerOnboardingCanaryInvocationObservation
  now: number
}>

export type SellerCanaryOutputEvidenceRequirement = Readonly<{
  outputPointer: string
  purpose: 'comparison' | 'completion' | 'recovery'
}>

function decodePointer(pointer: string): readonly string[] | undefined {
  if (pointer === '') return []
  if (!pointer.startsWith('/')) return undefined
  const segments = pointer.slice(1).split('/')
  if (segments.some((segment) => segment.length === 0 || /~(?:[^01]|$)/.test(segment))) {
    return undefined
  }
  return segments.map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function valueAtPointer(root: unknown, pointer: string): unknown {
  const segments = decodePointer(pointer)
  if (segments === undefined) return undefined
  let current: unknown = root
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) return undefined
      const index = Number(segment)
      if (!Number.isSafeInteger(index) || index >= current.length) return undefined
      current = current[index]
      continue
    }
    if (typeof current !== 'object' || current === null) return undefined
    if (!Object.hasOwn(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function meaningfulCompletionEvidence(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'object' && Object.keys(value).length > 0
}

/**
 * A schema-valid response is not enough to publish a seller. Every completion
 * evidence pointer declared by the exact capability contract must resolve to a
 * meaningful value in the paid canary output.
 */
export function sellerCanaryCompletionEvidenceMatches(
  output: unknown,
  evidence: readonly SellerCanaryOutputEvidenceRequirement[],
): boolean {
  const completion = evidence.filter((requirement) => requirement.purpose === 'completion')
  return completion.length > 0
    && completion.every((requirement) => (
      meaningfulCompletionEvidence(valueAtPointer(output, requirement.outputPointer))
    ))
}

function nonBlank(value: string): boolean {
  return value.trim().length > 0 && value.length <= 2_048
}

function validAnchor(anchor: X402SellerPromotionAnchor): boolean {
  return [
    anchor.ownerId,
    anchor.businessId,
    anchor.offeringRef,
    anchor.accessPathRef,
    anchor.publicationRef,
    anchor.draftOperationRef,
    anchor.sellerPayTo,
  ].every(nonBlank)
    && Number.isSafeInteger(anchor.offeringRevision)
    && anchor.offeringRevision > 0
    && Number.isSafeInteger(anchor.publicationRevision)
    && anchor.publicationRevision > 0
    && [
      anchor.offeringSourceHash,
      anchor.accessPathSourceHash,
      anchor.operationMaterialDigest,
      anchor.contractDigest,
      anchor.bindingDigest,
      anchor.priceDigest,
      anchor.sellerClaimDigest,
      anchor.readinessDigest,
    ].every(isCanonicalDigest)
    && Number.isSafeInteger(anchor.readinessObservedAt)
    && anchor.readinessObservedAt >= 0
    && Number.isSafeInteger(anchor.readinessValidUntil)
    && anchor.readinessValidUntil > anchor.readinessObservedAt
}

function promotionMaterialAnchor(anchor: X402SellerPromotionAnchor) {
  const {
    // Readiness is deliberately refreshed before promotion. In the current
    // projection it also changes operationMaterialDigest through the evidence
    // source, so neither field may manufacture a second paid-canary identity
    // or invalidate already-settled evidence.
    operationMaterialDigest: _operationMaterialDigest,
    readinessDigest: _readinessDigest,
    readinessObservedAt: _readinessObservedAt,
    readinessValidUntil: _readinessValidUntil,
    ...material
  } = anchor
  return material
}

function anchorsEqual(left: X402SellerPromotionAnchor, right: X402SellerPromotionAnchor): boolean {
  return canonicalDigest(promotionMaterialAnchor(left) as StableHashValue)
    === canonicalDigest(promotionMaterialAnchor(right) as StableHashValue)
}

function anchorMatchesCommitment(
  anchor: X402SellerPromotionAnchor,
  commitment: SellerOnboardingCanaryCommitment,
): boolean {
  return anchor.ownerId === commitment.ownerId
    && anchor.businessId === commitment.businessId
    && anchor.offeringRef === commitment.offeringRef
    && anchor.offeringRevision === commitment.offeringRevision
    && anchor.offeringSourceHash === commitment.offeringSourceHash
    && anchor.accessPathRef === commitment.accessPathRef
    && anchor.accessPathSourceHash === commitment.accessPathSourceHash
    && anchor.publicationRef === commitment.publicationRef
    && anchor.publicationRevision === commitment.publicationRevision
    && anchor.draftOperationRef === commitment.draftOperationRef
    && anchor.operationMaterialDigest === commitment.operationMaterialDigest
    && anchor.contractDigest === commitment.contractDigest
    && anchor.bindingDigest === commitment.bindingDigest
    && anchor.priceDigest === commitment.priceDigest
    && anchor.sellerPayTo.toLowerCase() === commitment.sellerPayTo.toLowerCase()
    && anchor.sellerClaimDigest === commitment.sellerClaimDigest
    && anchor.readinessDigest === commitment.readinessDigest
    && anchor.readinessObservedAt === commitment.readinessObservedAt
    && anchor.readinessValidUntil === commitment.readinessValidUntil
}

/**
 * Pure final-promotion policy. The caller must derive `current` from fresh
 * authoritative rows in the same transaction that consumes the evidence.
 */
export function evaluateX402SellerPromotion(
  input: EvaluateX402SellerPromotionInput,
): X402SellerPromotionResult {
  const { sealed, current, commitment, observation } = input
  if (!validAnchor(sealed) || !validAnchor(current) || !Number.isSafeInteger(input.now) || input.now < 0) {
    return { kind: 'refused', code: 'evidence_invalid' }
  }
  if (input.actingOwnerId !== sealed.ownerId) return { kind: 'refused', code: 'owner_mismatch' }
  if (!anchorsEqual(sealed, current) || !anchorMatchesCommitment(sealed, commitment)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  if (!input.sellerClaimCurrent) return { kind: 'refused', code: 'seller_claim_stale' }
  if (!input.platformFundingAuthorized) return { kind: 'refused', code: 'funding_authority_invalid' }
  if (
    !input.readinessCurrent
    || input.now < current.readinessObservedAt
    || input.now >= current.readinessValidUntil
  ) return { kind: 'refused', code: 'readiness_stale' }
  if (
    !input.outputDeterministic
    || !input.outputAssertionMatched
    || !isCanonicalDigest(input.expectedOutputEvidenceDigest)
    || input.expectedOutputEvidenceDigest !== commitment.expectedOutputEvidenceDigest
    || !isCanonicalDigest(input.outputDigest)
  ) {
    return { kind: 'refused', code: 'output_nondeterministic' }
  }

  const canary = projectSellerOnboardingCanaryStatus({
    commitment,
    observation,
    currentOperation: {
      // The paid observation is evaluated against its sealed execution
      // snapshot. Fresh current readiness was already checked above against
      // every durable material anchor and is allowed to carry a new evidence-
      // derived operationMaterialDigest.
      draftOperationRef: sealed.draftOperationRef,
      operationMaterialDigest: sealed.operationMaterialDigest,
      contractDigest: sealed.contractDigest,
      bindingDigest: sealed.bindingDigest,
      priceDigest: sealed.priceDigest,
    },
    now: input.now,
  })
  if (canary.kind === 'pending') return { kind: 'refused', code: 'canary_pending' }
  if (canary.kind === 'reconciliation_required') {
    return { kind: 'refused', code: 'reconciliation_required' }
  }
  if (canary.kind === 'failed') return { kind: 'refused', code: canary.code }
  const targetDigest = canonicalDigest(promotionMaterialAnchor(current) as StableHashValue)
  return {
    kind: 'approved',
    target: current,
    promotionEvidence: canary.promotionEvidence,
    consumptionDigest: canonicalDigest({
      format: 'x402-seller-promotion-consumption:v1',
      canaryRef: canary.canaryRef,
      canaryCommitmentDigest: commitment.commitmentDigest,
      promotionEvidenceDigest: canary.promotionEvidence.promotionEvidenceDigest,
      expectedOutputEvidenceDigest: input.expectedOutputEvidenceDigest,
      outputDigest: input.outputDigest,
      targetDigest,
    }),
  }
}
