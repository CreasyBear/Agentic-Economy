import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  AuthorityExposureOffset,
  AuthorityUse,
  SpendingPolicy,
  SpendingPolicyDecision,
} from './spending-policy-types'
import {
  persistedAuthorityUseMaterialValid,
  policyDecisionMaterialValid,
  spendingPolicyMaterialValid,
} from './spending-policy-validation'

/**
 * Digest integrity checks and their canonical-bytes builders, shared by
 * spending-policy.ts (mandate/use/exposure-offset storage) and
 * spending-policy-evaluation.ts (policy-decision evaluation). Depending only
 * on the pure types in spending-policy-types.ts keeps this module a leaf:
 * neither of its two consumers needs to import the other for it.
 */

export function spendingPolicyIntegrityValid(mandate: SpendingPolicy): boolean {
  if (!spendingPolicyMaterialValid(mandate)) return false
  const { digest, ...material } = mandate
  return digest === canonicalDigest(canonicalSpendingPolicyMaterial(material))
}

export function authorityUseIntegrityValid(use: AuthorityUse): boolean {
  if (!persistedAuthorityUseMaterialValid(use)) return false
  const { digest, ...material } = use
  return digest === canonicalDigest(canonicalAuthorityUseMaterial(material))
}

export function policyDecisionIntegrityValid(decision: SpendingPolicyDecision): boolean {
  if (!policyDecisionMaterialValid(decision)) return false
  const { digest, ...material } = decision
  return digest === canonicalDigest(canonicalPolicyDecisionMaterial(material))
}

/**
 * Authority-use v1 records retain their original invocationRef hash key. The
 * generic executionRef rename is projected only at this existing integrity
 * and persistence-digest boundary; every other material field is unchanged.
 */
export function canonicalAuthorityUseMaterial(
  material: Omit<AuthorityUse, 'digest'>,
) {
  const { executionRef, spendingPolicyRef, spendingPolicyVersion, spendingPolicyGeneration, ...unchangedFields } = material
  return {
    mandateRef: spendingPolicyRef,
    mandateVersion: spendingPolicyVersion,
    mandateGeneration: spendingPolicyGeneration,
    ...unchangedFields,
    invocationRef: executionRef,
  }
}

/** Preserve the existing standing-policy v1 material and digest bytes. */
export function canonicalSpendingPolicyMaterial(
  material: Omit<SpendingPolicy, 'digest'>,
) {
  const { spendingPolicyRef, format: _format, mode, revoked, ...unchangedFields } = material
  return {
    mandateRef: spendingPolicyRef,
    ...unchangedFields,
    format: 'ae.action-invocation-standing-mandate:v1' as const,
    mode: mode === 'spending_policy' ? 'bounded_mandate' as const : 'full_yolo' as const,
    revoked,
  }
}

/** Exposure offsets retain their v1 mandate reference keys in hash material. */
export function canonicalAuthorityExposureOffsetMaterial(
  material: Omit<AuthorityExposureOffset, 'digest'>,
) {
  const { spendingPolicyRef, spendingPolicyVersion, spendingPolicyGeneration, ...unchangedFields } = material
  return {
    ...unchangedFields,
    mandateRef: spendingPolicyRef,
    mandateVersion: spendingPolicyVersion,
    mandateGeneration: spendingPolicyGeneration,
  }
}

/**
 * Spending-policy decisions retain their v1 canonical bytes. The
 * storage-facing executionRef is projected back to the established protected
 * v1 invocationRef key only at this existing digest boundary.
 */
export function canonicalPolicyDecisionMaterial(
  decision: Omit<SpendingPolicyDecision, 'digest'>,
) {
  const { proposal, ...unchangedFields } = decision
  const { executionRef, ...unchangedProposalFields } = proposal
  const {
    spendingPolicyRef,
    spendingPolicyVersion,
    spendingPolicyGeneration,
  } = unchangedFields
  return {
    policyDecisionRef: unchangedFields.policyDecisionRef,
    policy: unchangedFields.policy,
    objectiveRef: unchangedFields.objectiveRef,
    mandateRef: spendingPolicyRef,
    mandateVersion: spendingPolicyVersion,
    mandateGeneration: spendingPolicyGeneration,
    proposal: { ...unchangedProposalFields, invocationRef: executionRef },
    capacity: unchangedFields.capacity,
    fallbackOrdinal: unchangedFields.fallbackOrdinal,
    heldWorstCaseLoss: unchangedFields.heldWorstCaseLoss,
    proposedWorstCaseLoss: unchangedFields.proposedWorstCaseLoss,
    maximumLoss: unchangedFields.maximumLoss,
    accepted: unchangedFields.accepted,
  }
}
