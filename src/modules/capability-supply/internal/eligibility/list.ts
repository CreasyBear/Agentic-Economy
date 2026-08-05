import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityOperationId,
  createAdmittedOperationRef,
  createPublicOperationRef,
  type AdmittedOperationRef,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'

import { bindingIntegrityIsValid } from '../binding/integrity'
import { contractRefFromRow } from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { publicationLifecycle } from '../publication/lifecycle'

import { bindingEligibilityIsValid, offeringEligibilityIsValid } from './integrity'
import {
  compareStableIdentifier,
  eligibleBindingProjection,
  eligibleOfferingProjection,
  type EligibleBindingProjection,
  type EligibleOfferingProjection,
} from './projection'
import type { EligiblePublicationRow, EligibleSupplyPorts } from './ports'

export const MAX_ELIGIBLE_SUPPLY = 256

export async function listIntegratedCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const bindings = await ports.listAdmittedConformantBindingsByNetwork(
    input.networkId, input.limit + 1,
  )
  if (bindings.length > input.limit) {
    return { kind: 'unavailable' as const, reason: 'eligible_supply_limit_exceeded' as const }
  }
  const supplies: Array<{
    offering: EligibleOfferingProjection
    binding: EligibleBindingProjection
    publication?: Readonly<{
      publicationRef: string
      revision: number
      readinessValidUntil: number
      operationRef: PublicOperationRef
      admittedOperation: AdmittedOperationRef
    }>
  }> = []
  const now = input.now ?? Date.now()
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await ports.loadOfferingByOfferingId(binding.offeringId)
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const contractRef = contractRefFromRow(binding)
    if (
      offering.networkId !== binding.networkId
      || !sameCapabilityContractRef(contractRefFromRow(offering), contractRef)
    ) continue
    if (await ports.loadPublishedBusiness(offering.businessId) === null) continue
    const catalogOriginCurrent = offering.origin?.kind !== 'catalog_offering'
      || await ports.catalogOriginIsCurrent(offering.origin, offering.businessId)
    if (!catalogOriginCurrent) continue
    const contract = await ports.getActiveExactCapabilityContract(contractRef)
    if (contract.kind !== 'found') continue
    const publication = await ports.loadCurrentPublicationByBindingId(binding.bindingId)
    if (
      publication === null
      || publication.businessId !== offering.businessId
      || publication.offeringId !== offering.offeringId
      || publication.bindingId !== binding.bindingId
      || publication.networkId !== input.networkId
      || publication.capabilityId !== contractRef.capabilityId
      || publication.version !== contractRef.version
      || publication.contractDigest !== contractRef.contractDigest
      || publication.readinessValidUntil === undefined
      || publicationLifecycle(publication, offering, binding, now).state !== 'active'
    ) continue
    const admittedOperation = deriveAdmittedOperation(
      publication, offering, binding, contract.registeredAt, contract.documentJson, now,
    )
    if (admittedOperation === undefined) continue
    supplies.push({
      offering: eligibleOfferingProjection(offering),
      binding: eligibleBindingProjection(binding),
      publication: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        readinessValidUntil: publication.readinessValidUntil,
        operationRef: publication.operationRef,
        admittedOperation,
      },
    })
  }
  supplies.sort((left, right) => (
    compareStableIdentifier(left.offering.offeringId, right.offering.offeringId)
    || compareStableIdentifier(left.binding.bindingId, right.binding.bindingId)
  ))
  return { kind: 'available' as const, supplies }
}

function deriveAdmittedOperation(
  publication: EligiblePublicationRow,
  offering: Parameters<typeof eligibleOfferingProjection>[0],
  binding: Parameters<typeof eligibleBindingProjection>[0],
  contractRegisteredAt: number,
  contractDocumentJson: string,
  now: number,
): AdmittedOperationRef | undefined {
  const contractRef = contractRefFromRow(binding)
  const operationId = capabilityOperationId(contractRef.capabilityId)
  const expectedOperationRef = createPublicOperationRef({
    operationId,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef,
  })
  if (expectedOperationRef !== publication.operationRef) return undefined
  const origin = offering.origin?.kind === 'catalog_offering'
    ? offering.origin
    : undefined
  const catalogOfferingRef = origin?.offeringRef ?? offering.offeringId
  const catalogOfferingRevision = origin?.offeringRevision ?? 1
  try {
    return createAdmittedOperationRef({
      operationId,
      publisherRef: publication.publisherRef,
      provenanceDigest: publication.provenanceDigest,
      businessId: publication.businessId,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      sourceRevision: publication.sourceRevision,
      sourceDigest: publication.sourceDigest,
      contractRef,
      catalogOfferingRef,
      catalogOfferingRevision,
      offeringId: offering.offeringId,
      offeringRegistrationHash: offering.registrationHash,
      offeringEligibilityHash: offering.eligibilityHash,
      bindingId: binding.bindingId,
      bindingRegistrationHash: binding.registrationHash,
      bindingEligibilityHash: binding.eligibilityHash,
      bindingConfigDigest: binding.configDigest,
      qualificationDigest: canonicalDigest({
        contractRegisteredAt,
        contractRef,
        publication: {
          publicationRef: publication.publicationRef,
          revision: publication.revision,
          sourceRevision: publication.sourceRevision,
          sourceDigest: publication.sourceDigest,
          registrationEvidenceRefs: publication.registrationEvidenceRefs,
          readinessEvidenceRefs: publication.readinessEvidenceRefs,
        },
        offering: {
          offeringId: offering.offeringId,
          registrationHash: offering.registrationHash,
          eligibilityHash: offering.eligibilityHash,
        },
        binding: {
          bindingId: binding.bindingId,
          registrationHash: binding.registrationHash,
          eligibilityHash: binding.eligibilityHash,
          configDigest: binding.configDigest,
        },
      }),
      readinessValidUntil: publication.readinessValidUntil ?? 0,
      commercialDigest: canonicalDigest(offering.presentation.commercialRelationship),
      effectDigest: canonicalDigest({ contractRef, contractDocumentJson }),
    })
  } catch {
    return undefined
  }
}


export async function listRouteableCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const integrated = await listIntegratedCapabilitySupply(ports, {
    ...input,
    limit: MAX_ELIGIBLE_SUPPLY,
  })
  if (integrated.kind === 'unavailable') return integrated
  return {
    kind: 'available' as const,
    supplies: integrated.supplies.flatMap((supply) => (
      supply.publication === undefined
        ? []
        : [{ ...supply, publication: supply.publication }]
    )).slice(0, input.limit),
  }
}
