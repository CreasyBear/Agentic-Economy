import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StandingMandate } from './standing-mandate'
import {
  isoTimestampValid,
  standingMandateMaterialValid,
  verifiedGrantMaterialValid,
} from './standing-mandate-validation'

export type VerifiedStandingMandateGrant = Readonly<{
  format: 'ae.verified-standing-mandate-grant:v1'
  evidenceRef: string
  verifierRef: string
  source: string
  environment: 'MOCK/DEVELOPMENT ONLY'
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  grantorRef: string
  principalRef: string
  delegateRef: string
  callerRef: string
  scopeDigest: string
  mandateDigest: string
  issuedAt: string
  verifiedAt: string
  freshUntil: string
  authenticated: true
  cryptographicResult: 'valid'
  digest: string
}>

export type StandingMandateGrantVerifier = (
  mandate: StandingMandate,
  now: string,
) => VerifiedStandingMandateGrant | Readonly<{
  authenticated: false
  reason: 'self_authored' | 'mismatch' | 'stale' | 'tampered' | 'unauthenticated'
}>

export function createDevelopmentStandingMandateGrantVerifier(input: Readonly<{
  admittedMandateDigest: string
  evidenceRef: string
  verifierRef: string
  source: string
  freshUntil: string
}>): StandingMandateGrantVerifier {
  return (mandate, now) => {
    if (
      !standingMandateMaterialValid(mandate)
      || !isoTimestampValid(now)
      || !isoTimestampValid(input.freshUntil)
      || input.evidenceRef.length === 0
      || input.verifierRef.length === 0
      || input.source.length === 0
    ) {
      return { authenticated: false, reason: 'mismatch' }
    }
    if (mandate.digest !== input.admittedMandateDigest) {
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
      mandateRef: mandate.mandateRef,
      mandateVersion: mandate.version,
      mandateGeneration: mandate.generation,
      grantorRef: mandate.grantorRef,
      principalRef: mandate.principalRef,
      delegateRef: mandate.delegateRef,
      callerRef: mandate.callerRef,
      scopeDigest: canonicalDigest(mandate.scope as never),
      mandateDigest: mandate.digest,
      issuedAt: mandate.issuedAt,
      verifiedAt: now,
      freshUntil: input.freshUntil,
      authenticated: true as const,
      cryptographicResult: 'valid' as const,
    }
    return { ...material, digest: canonicalDigest(material as never) }
  }
}

export function verifiedGrantMatchesMandate(
  grant: VerifiedStandingMandateGrant,
  mandate: StandingMandate,
  now: string,
): boolean {
  if (
    !standingMandateMaterialValid(mandate)
    || !verifiedGrantMaterialValid(grant)
    || !isoTimestampValid(now)
  ) return false
  const { digest, ...material } = grant
  return grant.environment === 'MOCK/DEVELOPMENT ONLY'
    && grant.authenticated
    && grant.cryptographicResult === 'valid'
    && Date.parse(now) < Date.parse(grant.freshUntil)
    && digest === canonicalDigest(material as never)
    && grant.mandateRef === mandate.mandateRef
    && grant.mandateVersion === mandate.version
    && (
      grant.mandateGeneration === mandate.generation
      || (mandate.revoked !== false && grant.mandateGeneration < mandate.generation)
    )
    && grant.grantorRef === mandate.grantorRef
    && grant.principalRef === mandate.principalRef
    && grant.delegateRef === mandate.delegateRef
    && grant.callerRef === mandate.callerRef
    && grant.scopeDigest === canonicalDigest(mandate.scope as never)
    && (grant.mandateDigest === mandate.digest || mandate.revoked !== false)
    && grant.issuedAt === mandate.issuedAt
}
