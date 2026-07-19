import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  verifyEd25519Attestation,
  type Ed25519Attestation,
  type Ed25519VerificationKey,
} from '@/modules/common/ed25519-attestation'

export type ExposureOffsetRuleIdentity = Readonly<{
  evidenceRuleRef: string
  source: string
  version: string
}>

export type ExposureReleaseAttestationMaterial = Readonly<{
  format: 'ae.exposure-release-attestation:v1'
  evidenceRule: ExposureOffsetRuleIdentity
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  principalRef: string
  originalAuthorityUseRef: string
  cancellationAuthorityUseRef: string
  providerRef: string
  originalEffect: Readonly<{
    action: Readonly<{ id: string; version: string }>
    subjectRef: string
    resultRef: string
    evidenceDigest: string
  }>
  cancellationEffect: Readonly<{
    action: Readonly<{ id: string; version: string }>
    subjectRef: string
    resultRef: string
    evidenceDigest: string
  }>
  outcome: 'provider_confirmed_reversal'
  releasedAmount: Readonly<{ amountMinor: number; currency: string }>
  issuedAt: string
}>

export type ExposureReleaseAttestation = Readonly<{
  material: ExposureReleaseAttestationMaterial
  digest: string
  signature: Ed25519Attestation
}>

export function verifyExposureReleaseAttestation(
  attestation: ExposureReleaseAttestation,
  trustedKeys: readonly Ed25519VerificationKey[],
) {
  return attestation.digest === canonicalDigest(attestation.material as never)
    && verifyEd25519Attestation(attestation.digest, attestation.signature, trustedKeys)
}
