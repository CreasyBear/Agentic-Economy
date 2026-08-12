import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  capabilityOperationId,
  createPublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  compareExactAmounts,
  pricingConfigDigest,
  pricingConfigSchema,
} from '@/modules/money/public'

import { bindingIntegrityIsValid } from '../binding/integrity'
import {
  bindingEligibilityIsValid,
  offeringEligibilityIsValid,
} from '../eligibility/integrity'
import { contractRefFromRow } from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { publicationLifecycle } from '../publication/lifecycle'
import { parseAdmittedTransportCatalogMetadata } from '../transport-adapters'

import {
  exactCurrentCatalogOperationIsRouteable,
  routeabilityQualityGate,
} from './quality-gate'
import type { CapabilityGraphPorts } from './ports'

export type SuppliedCandidateRef = Readonly<{
  publicationRef: string
  revision: number
  networkId: string
  businessId: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
}>

export type SuppliedCandidateQualificationReason =
  | 'publication_missing'
  | 'publication_not_current'
  | 'candidate_reference_mismatch'
  | 'business_not_currently_published'
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
  | 'catalog_origin_missing'
  | 'catalog_origin_stale'
  | 'catalog_access_path_missing_or_stale'
  | 'operation_map_mismatch'
  | 'pricing_missing_or_invalid'
  | 'source_integrity_failure'

export type SuppliedCandidateSourceReference = Readonly<{
  kind: 'publication' | 'business' | 'contract' | 'offering' | 'binding' | 'authority' | 'pricing' | 'readiness'
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
  const publication = await ports.loadPublicationAtRevision(candidate.publicationRef, candidate.revision)
  if (publication === null) return result(candidate, now, ['publication_missing'], [])

  const sources: SuppliedCandidateSourceReference[] = [{
    kind: 'publication',
    ref: `${publication.publicationRef}@${publication.revision}`,
    digest: publication.sourceDigest,
    evidenceRefs: uniqueSorted(publication.registrationEvidenceRefs),
  }]
  const reasons: SuppliedCandidateQualificationReason[] = []
  const publicationCurrent = publication.disposition === 'current'
  if (!publicationCurrent) reasons.push('publication_not_current')
  if (
    publication.networkId !== candidate.networkId
    || publication.businessId !== candidate.businessId
    || publication.offeringId !== candidate.offeringId
    || publication.bindingId !== candidate.bindingId
    || !sameRef(contractRefFromRow(publication), candidate.contractRef)
  ) reasons.push('candidate_reference_mismatch')

  const [business, contract, offering, binding] = await Promise.all([
    ports.loadPublishedBusiness(candidate.businessId),
    ports.getExactRegisteredCapabilityContract(candidate.contractRef),
    ports.loadOfferingByOfferingId(candidate.offeringId),
    ports.loadBindingByBindingId(candidate.bindingId),
  ])
  const bindingMethod = binding === null
    ? undefined
    : parseAdmittedTransportCatalogMetadata(binding.adapterId, binding.configJson)?.method
  const businessCurrent = business !== null && businessIsCurrentlyPublished(business)
  if (!businessCurrent) reasons.push('business_not_currently_published')
  else sources.push(source('business', `business:${business.businessId}`, business, []))

  let contractCurrent = false
  if (contract.kind !== 'found') {
    reasons.push('contract_missing_or_inactive')
  } else {
    const registeredContract = contract.contract
    // The exact registered contract ref is the contract source digest.
    // Candidate/provenance metadata must not stand in for the document.
    sources.push({
      kind: 'contract',
      ref: `contract:${registeredContract.ref.capabilityId}@${registeredContract.ref.version}`,
      digest: registeredContract.ref.contractDigest,
      evidenceRefs: [],
    })
    contractCurrent = sameRef(registeredContract.ref, candidate.contractRef)
    if (!contractCurrent) reasons.push('source_integrity_failure')
  }

  let offeringCurrent = false
  let catalogOperationCurrent = false
  let originCurrent = false
  let catalogAccessPath = null
  const expectedOperationRef = contract.kind === 'found'
    ? createPublicOperationRef({
        operationId: capabilityOperationId(contract.contract.capabilityId),
        publicationRef: publication.publicationRef,
        publicationRevision: publication.revision,
        contractRef: contract.contract.ref,
      })
    : ''
  if (offering === null) {
    reasons.push('offering_missing')
  } else {
    sources.push({
      kind: 'offering',
      ref: `offering:${offering.offeringId}`,
      digest: offering.registrationHash,
      evidenceRefs: uniqueSorted([
        ...offering.registrationEvidenceRefs,
        ...offering.admissionEvidenceRefs,
      ]),
    })
    if (
      offering.networkId !== candidate.networkId
      || offering.businessId !== candidate.businessId
      || !sameRef(contractRefFromRow(offering), candidate.contractRef)
    ) reasons.push('candidate_reference_mismatch')
    offeringCurrent = offering.status === 'active'
      && offeringIntegrityIsValid(offering)
      && offeringEligibilityIsValid(offering)
    if (!offeringCurrent) reasons.push('offering_ineligible_or_unpublished')

    const origin = offering.origin
    if (origin?.kind !== 'catalog_offering') {
      reasons.push('catalog_origin_missing')
    } else {
      originCurrent = ports.catalogOriginIsCurrent !== undefined
        && await ports.catalogOriginIsCurrent(origin, candidate.businessId)
      if (!originCurrent) reasons.push('catalog_origin_stale')
      if (origin.declaredAccessPathRef === undefined || origin.accessPathSourceHash === undefined) {
        reasons.push('catalog_access_path_missing_or_stale')
      } else {
        catalogAccessPath = ports.loadCatalogAccessPath === undefined
          ? null
          : await ports.loadCatalogAccessPath(origin.declaredAccessPathRef)
        if (catalogAccessPath === null) {
          reasons.push('catalog_access_path_missing_or_stale')
        } else {
          catalogOperationCurrent = exactCurrentCatalogOperationIsRouteable({
            origin,
            originCurrent,
            accessPath: catalogAccessPath,
            publicationOperationRef: publication.operationRef,
            expectedOperationRef,
            endpointUrl: binding?.endpointUrl ?? '',
            method: bindingMethod,
          })
          if (!catalogOperationCurrent) reasons.push('operation_map_mismatch')
        }
      }
    }
  }

  let bindingCurrent = false
  if (binding === null) {
    reasons.push('binding_missing')
  } else {
    sources.push({
      kind: 'binding',
      ref: `binding:${binding.bindingId}`,
      digest: binding.registrationHash,
      evidenceRefs: uniqueSorted([
        ...binding.registrationEvidenceRefs,
        ...binding.admissionEvidenceRefs,
        ...binding.conformanceEvidenceRefs,
      ]),
    })
    sources.push(source(
      'authority',
      `authority:${binding.bindingId}`,
      binding.connectionAuthority ?? { kind: binding.authority.kind },
      binding.authority.kind === 'provider_connection' ? binding.registrationEvidenceRefs : [],
    ))
    if (
      binding.networkId !== candidate.networkId
      || binding.offeringId !== candidate.offeringId
      || !sameRef(contractRefFromRow(binding), candidate.contractRef)
    ) reasons.push('candidate_reference_mismatch')
    if (binding.admission !== 'admitted') reasons.push('binding_not_admitted')
    if (binding.conformance !== 'conformant') reasons.push('binding_not_conformant')
    bindingCurrent = bindingIntegrityIsValid(binding) && bindingEligibilityIsValid(binding)
    if (!bindingCurrent) reasons.push('source_integrity_failure')
  }

  let lifecycleActive = false
  if (offering !== null && binding !== null) {
    const currentConnection = binding.authority.kind === 'provider_connection'
      ? await ports.loadProviderConnection(binding.authority.connectionRef)
      : undefined
    const lifecycle = publicationLifecycle(publication, offering, binding, now, currentConnection)
    lifecycleActive = lifecycle.state === 'active'
    for (const reason of lifecycle.reasons) {
      if (reason === 'credential_readiness_unobserved') reasons.push('credential_readiness_unobserved')
      if (reason === 'credential_unavailable') reasons.push('credential_access_unavailable')
      if (reason === 'health_unobserved') reasons.push('readiness_unobserved')
      if (reason === 'health_unhealthy') reasons.push('readiness_unhealthy')
      if (reason === 'health_stale') reasons.push('readiness_stale')
      if (reason === 'eligibility_integrity_failure') reasons.push('source_integrity_failure')
    }
  }

  let pricingCurrent = false
  if (publication.pricingConfig === undefined || publication.priceDigest === undefined) {
    reasons.push('pricing_missing_or_invalid')
  } else {
    const parsedPricing = pricingConfigSchema.safeParse(publication.pricingConfig)
    const displayedPrice = offering?.presentation.price
    pricingCurrent = parsedPricing.success
      && pricingConfigDigest(parsedPricing.data) === publication.priceDigest
      && displayedPrice?.kind === 'fixed'
      && compareExactAmounts(displayedPrice.amount, parsedPricing.data.paidAmount) === 0
    if (!pricingCurrent) reasons.push('pricing_missing_or_invalid')
    else {
      sources.push({
        kind: 'pricing',
        ref: `pricing:${publication.publicationRef}@${publication.revision}`,
        digest: publication.priceDigest,
        evidenceRefs: uniqueSorted(publication.registrationEvidenceRefs),
      })
    }
  }

  if (
    publication.readinessObservedAt === undefined
    || publication.readinessValidUntil === undefined
    || publication.readinessEvidenceRefs.length === 0
  ) reasons.push('readiness_unobserved')
  sources.push(source(
    'readiness',
    `readiness:${publication.publicationRef}@${publication.revision}`,
    {
      credentialState: publication.credentialState,
      healthState: publication.healthState,
      readinessTargetDigest: publication.readinessTargetDigest ?? null,
      readinessRequestDigest: publication.readinessRequestDigest ?? null,
      readinessResponseStatus: publication.readinessResponseStatus ?? null,
      readinessResponseContentType: publication.readinessResponseContentType ?? null,
      readinessResponseDigest: publication.readinessResponseDigest ?? null,
      readinessOutcome: publication.readinessOutcome ?? null,
      observedAt: publication.readinessObservedAt ?? null,
      validUntil: publication.readinessValidUntil ?? null,
    },
    uniqueSorted(publication.readinessEvidenceRefs),
  ))

  const routeable = offering !== null
    && binding !== null
    && routeabilityQualityGate({
      origin: offering.origin,
      originCurrent,
      accessPath: catalogAccessPath,
      publicationOperationRef: publication.operationRef,
      expectedOperationRef,
      endpointUrl: binding.endpointUrl,
      method: bindingMethod,
      businessCurrent,
      publicationCurrent,
      contractCurrent,
      offeringCurrent,
      bindingCurrent,
      pricingCurrent,
      lifecycleActive,
    })
  if (!routeable && offering !== null && binding !== null && reasons.length === 0) {
    reasons.push('operation_map_mismatch')
  }

  return result(candidate, now, reasons, sources, publication.readinessValidUntil)
}

function result(
  candidate: SuppliedCandidateRef,
  observedAt: number,
  reasons: readonly SuppliedCandidateQualificationReason[],
  sources: readonly SuppliedCandidateSourceReference[],
  validUntil?: number,
): SuppliedCandidateQualification {
  const deterministicReasons = uniqueSorted(reasons)
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
  return { kind, ref, digest: canonicalDigest(value), evidenceRefs: uniqueSorted(evidenceRefs) }
}

function sameRef(left: CapabilityContractRef, right: CapabilityContractRef): boolean {
  return left.capabilityId === right.capabilityId
    && left.version === right.version
    && left.contractDigest === right.contractDigest
}

function businessIsCurrentlyPublished(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const business = value as Record<string, unknown>
  return business.publicStatus === 'published'
    && business.claimStatus === 'published'
    && business.suppressed === false
    && business.currentlyPublished === true
}
