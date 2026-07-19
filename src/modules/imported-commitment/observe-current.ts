import type {
  SuppliedCandidateQualification,
  SuppliedCandidateRef,
} from '@/modules/capability-supply/server'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ImportedCommitmentClaim } from './contracts'

export type ImportedCommitmentProviderObservation = Readonly<{
  observationRef: string
  claimRef: string
  claimDigest: string
  providerBusinessId: string
  publicationRef: string
  publicationRevision: number
  contractRef: SuppliedCandidateRef['contractRef']
  source: ImportedCommitmentClaim['source']
  observedAt: number
  validUntil: number
  evidenceRefs: readonly string[]
  evidenceDigest: string
}>

export type CurrentImportedCommitmentObservation = Readonly<{
  kind: 'current_ae_observation'
  observationRef: string
  observationDigest: string
  claimRef: string
  claimDigest: string
  providerBusinessId: string
  publicationRef: string
  publicationRevision: number
  contractRef: SuppliedCandidateRef['contractRef']
  source: ImportedCommitmentClaim['source']
  observedAt: number
  validUntil: number
  evidenceRefs: readonly string[]
  providerAdmission: 'admitted'
  authority: 'none'
  effect: 'none'
}>

export type ImportedCommitmentObservationPort = Readonly<{
  qualifyProvider(
    candidate: SuppliedCandidateRef,
    now: number,
  ): Promise<SuppliedCandidateQualification>
  observeThroughAdmittedAdapter(input: Readonly<{
    claimRef: string
    claimDigest: string
    source: ImportedCommitmentClaim['source']
    provider: SuppliedCandidateRef
  }>): Promise<ImportedCommitmentProviderObservation>
}>

export type ObserveImportedCommitmentResult =
  | Readonly<{ kind: 'observed'; observation: CurrentImportedCommitmentObservation; noEffect: true }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'claim_not_current'
        | 'provider_not_admitted'
        | 'provider_evidence_invalid'
        | 'provider_evidence_mismatch'
        | 'provider_evidence_stale'
    }>

export async function observeImportedCommitmentAsCurrent(
  input: Readonly<{
    claim: ImportedCommitmentClaim
    provider: SuppliedCandidateRef
    now: number
  }>,
  port: ImportedCommitmentObservationPort,
): Promise<ObserveImportedCommitmentResult> {
  if (!claimIsCurrent(input.claim, input.now)) {
    return { kind: 'refused', reason: 'claim_not_current' }
  }
  const qualification = await port.qualifyProvider(input.provider, input.now)
  if (qualification.status !== 'eligible'
    || qualification.environment !== 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
    || qualification.observedAt !== input.now
    || canonicalDigest(qualification.candidate as StableHashValue)
      !== canonicalDigest(input.provider as StableHashValue)
    || !hasCompleteSupplySources(qualification)
    || qualification.qualificationDigest !== qualificationDigest(qualification)
    || qualification.validUntil === undefined
    || input.now >= qualification.validUntil) {
    return { kind: 'refused', reason: 'provider_not_admitted' }
  }
  const observed = await port.observeThroughAdmittedAdapter({
    claimRef: input.claim.claimRef,
    claimDigest: input.claim.claimDigest,
    source: input.claim.source,
    provider: input.provider,
  })
  if (!validObservation(observed)) {
    return { kind: 'refused', reason: 'provider_evidence_invalid' }
  }
  if (!observationMatches(observed, input.claim, input.provider)) {
    return { kind: 'refused', reason: 'provider_evidence_mismatch' }
  }
  if (observed.observedAt > input.now || input.now >= observed.validUntil) {
    return { kind: 'refused', reason: 'provider_evidence_stale' }
  }
  const material = {
    observationRef: observed.observationRef,
    claimRef: observed.claimRef,
    claimDigest: observed.claimDigest,
    providerBusinessId: observed.providerBusinessId,
    publicationRef: observed.publicationRef,
    publicationRevision: observed.publicationRevision,
    contractRef: observed.contractRef,
    source: observed.source,
    observedAt: observed.observedAt,
    validUntil: observed.validUntil,
    evidenceRefs: sorted(observed.evidenceRefs),
    providerAdmission: 'admitted' as const,
    authority: 'none' as const,
    effect: 'none' as const,
  }
  return {
    kind: 'observed',
    observation: {
      kind: 'current_ae_observation',
      ...material,
      observationDigest: canonicalDigest(material as StableHashValue),
    },
    noEffect: true,
  }
}

function claimIsCurrent(claim: ImportedCommitmentClaim, now: number): boolean {
  return claim.verification === 'imported_unverified'
    && claim.observationPosture === 'imported_claim_only'
    && claim.validity.kind === 'valid_until'
    && now < claim.validity.validUntil
}

function qualificationDigest(qualification: SuppliedCandidateQualification): string {
  return canonicalDigest({
    candidate: qualification.candidate,
    observedAt: qualification.observedAt,
    validUntil: qualification.validUntil ?? null,
    reasons: qualification.reasons,
    sources: qualification.sources,
  } as StableHashValue)
}

function hasCompleteSupplySources(qualification: SuppliedCandidateQualification): boolean {
  const present = new Set(qualification.sources.map(({ kind }) => kind))
  return (['publication', 'business', 'contract', 'offering', 'binding', 'readiness'] as const)
    .every((kind) => present.has(kind))
}

function validObservation(observation: ImportedCommitmentProviderObservation): boolean {
  const refs = [
    observation.observationRef,
    observation.claimRef,
    observation.providerBusinessId,
    observation.publicationRef,
    observation.source.system,
    observation.source.reference,
  ]
  return refs.every((value) => value.trim().length > 0 && value.length <= 500)
    && Number.isInteger(observation.publicationRevision)
    && observation.publicationRevision > 0
    && Number.isFinite(observation.observedAt)
    && Number.isFinite(observation.validUntil)
    && observation.observedAt < observation.validUntil
    && observation.evidenceRefs.length > 0
    && observation.evidenceRefs.length <= 64
    && observation.evidenceRefs.every((ref) => ref.trim().length > 0 && ref.length <= 500)
    && isCanonicalDigest(observation.claimDigest)
    && isCanonicalDigest(observation.source.digest)
    && isCanonicalDigest(observation.contractRef.contractDigest)
    && isCanonicalDigest(observation.evidenceDigest)
    && observation.evidenceDigest === canonicalDigest({
      observationRef: observation.observationRef,
      claimRef: observation.claimRef,
      claimDigest: observation.claimDigest,
      providerBusinessId: observation.providerBusinessId,
      publicationRef: observation.publicationRef,
      publicationRevision: observation.publicationRevision,
      contractRef: observation.contractRef,
      source: observation.source,
      observedAt: observation.observedAt,
      validUntil: observation.validUntil,
      evidenceRefs: sorted(observation.evidenceRefs),
    } as StableHashValue)
}

function observationMatches(
  observation: ImportedCommitmentProviderObservation,
  claim: ImportedCommitmentClaim,
  provider: SuppliedCandidateRef,
): boolean {
  return observation.claimRef === claim.claimRef
    && observation.claimDigest === claim.claimDigest
    && observation.providerBusinessId === provider.businessId
    && observation.providerBusinessId === claim.issuer.ref
    && observation.publicationRef === provider.publicationRef
    && observation.publicationRevision === provider.revision
    && canonicalDigest(observation.contractRef as StableHashValue)
      === canonicalDigest(provider.contractRef as StableHashValue)
    && canonicalDigest(observation.source as StableHashValue)
      === canonicalDigest(claim.source as StableHashValue)
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
