import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityOperationId,
  createAdmittedOperationRef,
  createPublicOperationRef,
  type AdmittedOperationRef,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'
import type { CapabilityConnectionAuthoritySnapshot } from '../binding/registration'
import { bindingIntegrityIsValid } from '../binding/integrity'
import { offeringIntegrityIsValid } from '../offering/integrity'
import { contractRefFromRow } from '../offering/registration'
import type { PricingConfig } from '@/modules/money/public'

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
  input: Readonly<{ networkId: string; limit: number; now: number }>,
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
      pricingConfig: PricingConfig
      priceDigest: string
      connectionAuthority?: CapabilityConnectionAuthoritySnapshot
      admittedOperation: AdmittedOperationRef
    }>
  }> = []
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await ports.loadOfferingByOfferingId(binding.offeringId)
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    if (
      offering.networkId !== input.networkId
      || offering.networkId !== binding.networkId
      || contractRefFromRow(offering).capabilityId !== contractRefFromRow(binding).capabilityId
      || contractRefFromRow(offering).version !== contractRefFromRow(binding).version
      || contractRefFromRow(offering).contractDigest !== contractRefFromRow(binding).contractDigest
    ) continue
    if (await ports.loadPublishedBusiness(offering.businessId) === null) continue

    let publication: {
      publicationRef: string
      revision: number
      readinessValidUntil: number
      operationRef: PublicOperationRef
      pricingConfig: PricingConfig
      priceDigest: string
      connectionAuthority?: CapabilityConnectionAuthoritySnapshot
      admittedOperation: AdmittedOperationRef
    } | undefined
    const currentPublication = await ports.loadCurrentPublicationByBindingId(binding.bindingId)
    if (currentPublication !== null) {
      const contractRef = contractRefFromRow(binding)
      const qualification = await ports.qualifySuppliedCandidate({
        publicationRef: currentPublication.publicationRef,
        revision: currentPublication.revision,
        networkId: input.networkId,
        businessId: offering.businessId,
        offeringId: offering.offeringId,
        bindingId: binding.bindingId,
        contractRef,
      }, input.now)
      if (qualification.status === 'eligible') {
        const pricingConfig = currentPublication.pricingConfig
        const priceDigest = currentPublication.priceDigest
        if (pricingConfig !== undefined && priceDigest !== undefined) {
          const contract = await ports.getActiveExactCapabilityContract(contractRef)
          if (contract.kind === 'found') {
            const admittedOperation = deriveAdmittedOperation(
              currentPublication, offering, binding, contract.registeredAt, contract.documentJson, input.now,
            )
            if (admittedOperation !== undefined) {
              publication = {
                publicationRef: currentPublication.publicationRef,
                revision: currentPublication.revision,
                readinessValidUntil: currentPublication.readinessValidUntil ?? 0,
                operationRef: currentPublication.operationRef,
                pricingConfig,
                priceDigest,
                ...(currentPublication.connectionAuthority === undefined
                  ? {}
                  : { connectionAuthority: currentPublication.connectionAuthority }),
                admittedOperation,
              }
            }
          }
        }
      }
    }
    supplies.push({
      offering: eligibleOfferingProjection(offering),
      binding: eligibleBindingProjection(binding),
      ...(publication === undefined ? {} : { publication }),
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
          ...(publication.connectionAuthority === undefined
            ? {}
            : { connectionAuthority: publication.connectionAuthority }),
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
          ...(binding.connectionAuthority === undefined
            ? {}
            : { connectionAuthority: binding.connectionAuthority }),
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
  input: Readonly<{ networkId: string; limit: number; now: number }>,
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
