import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { bindingIntegrityIsValid } from '../binding'
import {
  bindingEligibilityIsValid,
  offeringEligibilityIsValid,
} from '../eligibility'
import { contractRefFromRow, offeringIntegrityIsValid } from '../offering'
import { publicationLifecycle } from '../publication'

import type { CapabilityGraphPorts } from './ports'

export type SuppliedCandidateRef = Readonly<{
  publicationRef: string
  revision: number
  businessId: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
}>

export type SuppliedCandidateQualificationReason =
  | 'publication_missing'
  | 'publication_not_current'
  | 'candidate_reference_mismatch'
  | 'business_not_currently_admitted'
  | 'contract_missing_or_inactive'
  | 'offering_missing'
  | 'offering_ineligible_or_unpublished'
  | 'binding_missing'
  | 'binding_not_admitted'
  | 'binding_not_conformant'
  | 'credential_readiness_unobserved'
  | 'credential_access_unavailable'
  | 'readiness_unobserved'
  | 'readiness_unhealthy'
  | 'readiness_stale'
  | 'source_integrity_failure'

export type SuppliedCandidateSourceReference = Readonly<{
  kind: 'publication' | 'business' | 'contract' | 'offering' | 'binding' | 'readiness'
  ref: string
  digest: string
  evidenceRefs: readonly string[]
}>

export type SuppliedCandidateQualification = Readonly<{
  kind: 'supplied_candidate_qualification'
  environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
  candidate: SuppliedCandidateRef
  status: 'eligible' | 'blocked'
  reasons: readonly SuppliedCandidateQualificationReason[]
  observedAt: number
  validUntil?: number
  qualificationDigest: string
  sources: readonly SuppliedCandidateSourceReference[]
}>

export async function qualifySuppliedCandidate(
  ports: CapabilityGraphPorts,
  input: Readonly<{ candidate: SuppliedCandidateRef; now: number }>,
): Promise<SuppliedCandidateQualification> {
  const { candidate, now } = input
  const publication = await ports.loadPublicationAtRevision(
    candidate.publicationRef,
    candidate.revision,
  )
  if (publication === null) {
    return result(candidate, now, ['publication_missing'], [])
  }

  const sources: SuppliedCandidateSourceReference[] = [{
    kind: 'publication',
    ref: `${publication.publicationRef}@${publication.revision}`,
    digest: publication.sourceDigest,
    evidenceRefs: sorted(publication.registrationEvidenceRefs),
  }]
  const reasons: SuppliedCandidateQualificationReason[] = []
  if (publication.disposition !== 'current') reasons.push('publication_not_current')
  if (
    publication.businessId !== candidate.businessId
    || publication.offeringId !== candidate.offeringId
    || publication.bindingId !== candidate.bindingId
    || !sameRef(contractRefFromRow(publication), candidate.contractRef)
  ) {
    reasons.push('candidate_reference_mismatch')
  }

  const [business, contract, offering, binding] = await Promise.all([
    ports.loadPublishedBusiness(candidate.businessId),
    ports.getActiveExactCapabilityContract(candidate.contractRef),
    ports.loadOfferingByOfferingId(candidate.offeringId),
    ports.loadBindingByBindingId(candidate.bindingId),
  ])
  if (business === null) {
    reasons.push('business_not_currently_admitted')
  } else {
    sources.push(source('business', `business:${business.businessId}`, business, []))
  }
  if (contract.kind !== 'found') {
    reasons.push('contract_missing_or_inactive')
  } else {
    sources.push(source(
      'contract',
      `contract:${candidate.contractRef.capabilityId}@${candidate.contractRef.version}`,
      candidate.contractRef,
      [],
    ))
  }
  if (offering === null) {
    reasons.push('offering_missing')
  } else {
    sources.push({
      kind: 'offering',
      ref: `offering:${offering.offeringId}`,
      digest: offering.registrationHash,
      evidenceRefs: sorted([
        ...offering.registrationEvidenceRefs,
        ...offering.admissionEvidenceRefs,
      ]),
    })
    if (
      offering.businessId !== candidate.businessId
      || !sameRef(contractRefFromRow(offering), candidate.contractRef)
    ) reasons.push('candidate_reference_mismatch')
    if (
      offering.status !== 'active'
      || !offeringIntegrityIsValid(offering)
      || !offeringEligibilityIsValid(offering)
    ) reasons.push('offering_ineligible_or_unpublished')
  }
  if (binding === null) {
    reasons.push('binding_missing')
  } else {
    sources.push({
      kind: 'binding',
      ref: `binding:${binding.bindingId}`,
      digest: binding.registrationHash,
      evidenceRefs: sorted([
        ...binding.registrationEvidenceRefs,
        ...binding.admissionEvidenceRefs,
        ...binding.conformanceEvidenceRefs,
      ]),
    })
    if (
      binding.offeringId !== candidate.offeringId
      || !sameRef(contractRefFromRow(binding), candidate.contractRef)
    ) reasons.push('candidate_reference_mismatch')
    if (binding.admission !== 'admitted') reasons.push('binding_not_admitted')
    if (binding.conformance !== 'conformant') reasons.push('binding_not_conformant')
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      reasons.push('source_integrity_failure')
    }
  }

  if (offering !== null && binding !== null) {
    const lifecycle = publicationLifecycle(publication, offering, binding, now)
    for (const reason of lifecycle.reasons) {
      if (reason === 'credential_readiness_unobserved') reasons.push('credential_readiness_unobserved')
      if (reason === 'credential_unavailable') reasons.push('credential_access_unavailable')
      if (reason === 'health_unobserved') reasons.push('readiness_unobserved')
      if (reason === 'health_unhealthy') reasons.push('readiness_unhealthy')
      if (reason === 'health_stale') reasons.push('readiness_stale')
      if (reason === 'eligibility_integrity_failure') reasons.push('source_integrity_failure')
    }
  }
  if (
    publication.readinessObservedAt === undefined
    || publication.readinessValidUntil === undefined
    || publication.readinessEvidenceRefs.length === 0
  ) {
    reasons.push('readiness_unobserved')
  }
  sources.push(source('readiness', `readiness:${publication.publicationRef}@${publication.revision}`, {
    credentialState: publication.credentialState,
    healthState: publication.healthState,
    observedAt: publication.readinessObservedAt ?? null,
    validUntil: publication.readinessValidUntil ?? null,
  }, publication.readinessEvidenceRefs))

  return result(
    candidate,
    now,
    reasons,
    sources,
    publication.readinessValidUntil,
  )
}

function result(
  candidate: SuppliedCandidateRef,
  observedAt: number,
  reasons: readonly SuppliedCandidateQualificationReason[],
  sources: readonly SuppliedCandidateSourceReference[],
  validUntil?: number,
): SuppliedCandidateQualification {
  const deterministicReasons = [...new Set(reasons)].sort()
  const deterministicSources = [...sources].sort((left, right) => (
    left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref)
  ))
  const qualificationDigest = canonicalDigest({
    candidate,
    observedAt,
    validUntil: validUntil ?? null,
    reasons: deterministicReasons,
    sources: deterministicSources,
  } as StableHashValue)
  return {
    kind: 'supplied_candidate_qualification',
    environment: 'SOURCE-OWNED DEVELOPMENT EVIDENCE',
    candidate,
    status: deterministicReasons.length === 0 ? 'eligible' : 'blocked',
    reasons: deterministicReasons,
    observedAt,
    ...(validUntil === undefined ? {} : { validUntil }),
    qualificationDigest,
    sources: deterministicSources,
  }
}

function source(
  kind: SuppliedCandidateSourceReference['kind'],
  ref: string,
  value: StableHashValue,
  evidenceRefs: readonly string[],
): SuppliedCandidateSourceReference {
  return { kind, ref, digest: canonicalDigest(value), evidenceRefs: sorted(evidenceRefs) }
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

function sameRef(left: CapabilityContractRef, right: CapabilityContractRef): boolean {
  return left.capabilityId === right.capabilityId
    && left.version === right.version
    && left.contractDigest === right.contractDigest
}
