import type { CapabilityContractRef } from '@/modules/capability-contract/public'

import type { EligibleSupplyPorts } from './ports'
export async function getEligibleExactCapabilitySupply(
  ports: EligibleSupplyPorts,
  input: Readonly<{
    networkId: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: CapabilityContractRef
    expectedOfferingRegistrationHash: string
    expectedBindingRegistrationHash: string
    now: number
  }>,
) {
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(input.offeringId),
    ports.loadBindingByBindingId(input.bindingId),
  ])
  if (
    offering === null
    || binding === null
    || offering.networkId !== input.networkId
    || binding.networkId !== input.networkId
    || offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
  ) return { kind: 'unavailable' as const }

  const publication = await ports.loadCurrentPublicationByBindingId(binding.bindingId)
  if (publication === null) return { kind: 'unavailable' as const }
  const qualification = await ports.qualifySuppliedCandidate({
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    networkId: input.networkId,
    businessId: input.businessId,
    offeringId: input.offeringId,
    bindingId: input.bindingId,
    contractRef: input.contractRef,
  }, input.now)
  if (qualification.status !== 'eligible') return { kind: 'unavailable' as const }

  const [business, contract] = await Promise.all([
    ports.loadPublishedBusiness(input.businessId),
    ports.getActiveExactCapabilityContract(input.contractRef),
  ])
  if (business === null || contract.kind !== 'found') return { kind: 'unavailable' as const }
  return { kind: 'available' as const, offering, binding, business, contract }
}
