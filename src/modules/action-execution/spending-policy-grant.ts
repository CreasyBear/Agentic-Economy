import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SpendingPolicy } from './spending-policy'
import {
  isoTimestampValid,
  spendingPolicyMaterialValid,
  verifiedGrantMaterialValid,
} from './spending-policy-validation'

export type VerifiedSpendingPolicyGrant = Readonly<{
  format: 'ae.verified-standing-mandate-grant:v1'
  evidenceRef: string
  verifierRef: string
  source: string
  environment: 'MOCK/DEVELOPMENT ONLY'
  spendingPolicyRef: string
  spendingPolicyVersion: number
  spendingPolicyGeneration: number
  grantorRef: string
  principalRef: string
  delegateRef: string
  callerRef: string
  scopeDigest: string
  spendingPolicyDigest: string
  issuedAt: string
  verifiedAt: string
  freshUntil: string
  authenticated: true
  cryptographicResult: 'valid'
  digest: string
}>

export type SpendingPolicyGrantVerifier = (
  spendingPolicy: SpendingPolicy,
  now: string,
) => VerifiedSpendingPolicyGrant | Readonly<{
  authenticated: false
  reason: 'self_authored' | 'mismatch' | 'stale' | 'tampered' | 'unauthenticated'
}>

export function createDevelopmentSpendingPolicyGrantVerifier(input: Readonly<{
  admittedSpendingPolicyDigest: string
  evidenceRef: string
  verifierRef: string
  source: string
  freshUntil: string
}>): SpendingPolicyGrantVerifier {
  return (spendingPolicy, now) => {
    if (
      !spendingPolicyMaterialValid(spendingPolicy)
      || !isoTimestampValid(now)
      || !isoTimestampValid(input.freshUntil)
      || input.evidenceRef.length === 0
      || input.verifierRef.length === 0
      || input.source.length === 0
    ) {
      return { authenticated: false, reason: 'mismatch' }
    }
    if (spendingPolicy.digest !== input.admittedSpendingPolicyDigest) {
      return { authenticated: false, reason: 'tampered' }
    }
    if (Date.parse(now) >= Date.parse(input.freshUntil)) {
      return { authenticated: false, reason: 'stale' }
    }
    const material = {
      format: 'ae.verified-standing-mandate-grant:v1' as const,
      evidenceRef: input.evidenceRef,
      verifierRef: input.verifierRef,
      source: input.source,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
      spendingPolicyRef: spendingPolicy.spendingPolicyRef,
      spendingPolicyVersion: spendingPolicy.version,
      spendingPolicyGeneration: spendingPolicy.generation,
      grantorRef: spendingPolicy.grantorRef,
      principalRef: spendingPolicy.principalRef,
      delegateRef: spendingPolicy.delegateRef,
      callerRef: spendingPolicy.callerRef,
      scopeDigest: canonicalDigest(spendingPolicy.scope as never),
      spendingPolicyDigest: spendingPolicy.digest,
      issuedAt: spendingPolicy.issuedAt,
      verifiedAt: now,
      freshUntil: input.freshUntil,
      authenticated: true as const,
      cryptographicResult: 'valid' as const,
    }
    return { ...material, digest: canonicalDigest(canonicalVerifiedSpendingPolicyGrantMaterial(material)) }
  }
}

export function verifiedGrantMatchesSpendingPolicy(
  grant: VerifiedSpendingPolicyGrant,
  spendingPolicy: SpendingPolicy,
  now: string,
): boolean {
  if (
    !spendingPolicyMaterialValid(spendingPolicy)
    || !verifiedGrantMaterialValid(grant)
    || !isoTimestampValid(now)
  ) return false
  const { digest, ...material } = grant
  return grant.environment === 'MOCK/DEVELOPMENT ONLY'
    && grant.authenticated
    && grant.cryptographicResult === 'valid'
    && Date.parse(now) < Date.parse(grant.freshUntil)
    && digest === canonicalDigest(canonicalVerifiedSpendingPolicyGrantMaterial(material))
    && grant.spendingPolicyRef === spendingPolicy.spendingPolicyRef
    && grant.spendingPolicyVersion === spendingPolicy.version
    && (
      grant.spendingPolicyGeneration === spendingPolicy.generation
      || (spendingPolicy.revoked !== false && grant.spendingPolicyGeneration < spendingPolicy.generation)
    )
    && grant.grantorRef === spendingPolicy.grantorRef
    && grant.principalRef === spendingPolicy.principalRef
    && grant.delegateRef === spendingPolicy.delegateRef
    && grant.callerRef === spendingPolicy.callerRef
    && grant.scopeDigest === canonicalDigest(spendingPolicy.scope as never)
    && (grant.spendingPolicyDigest === spendingPolicy.digest || spendingPolicy.revoked !== false)
    && grant.issuedAt === spendingPolicy.issuedAt
}

/** Preserve the existing verified-grant v1 wire/hash material. */
function canonicalVerifiedSpendingPolicyGrantMaterial(
  material: Omit<VerifiedSpendingPolicyGrant, 'digest'>,
) {
  const {
    format: _format,
    spendingPolicyRef,
    spendingPolicyVersion,
    spendingPolicyGeneration,
    spendingPolicyDigest,
    ...unchanged
  } = material
  return {
    ...unchanged,
    format: 'ae.verified-standing-mandate-grant:v1' as const,
    mandateRef: spendingPolicyRef,
    mandateVersion: spendingPolicyVersion,
    mandateGeneration: spendingPolicyGeneration,
    mandateDigest: spendingPolicyDigest,
  }
}
