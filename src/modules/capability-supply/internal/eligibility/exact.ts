import { sameCapabilityContractRef } from '@/modules/capability-contract/public'

import { bindingIntegrityIsValid } from '../binding'
import { contractRefFromRow, offeringIntegrityIsValid, type CapabilityContractRef } from '../offering'

import { bindingEligibilityIsValid, offeringEligibilityIsValid } from './integrity'
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
  }>,
) {
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(input.offeringId),
    ports.loadBindingByBindingId(input.bindingId),
  ])
  if (offering === null || binding === null
    || String(offering.businessId) !== input.businessId
    || offering.networkId !== input.networkId || binding.networkId !== input.networkId
    || binding.offeringId !== offering.offeringId
    || offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
    || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
    || !sameCapabilityContractRef(contractRefFromRow(binding), input.contractRef)
    || !offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)
    || !bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
    return { kind: 'unavailable' as const }
  }
  const business = await ports.loadPublishedBusiness(offering.businessId)
  if (business === null) return { kind: 'unavailable' as const }
  const contract = await ports.getActiveExactCapabilityContract(input.contractRef)
  if (contract.kind !== 'found') return { kind: 'unavailable' as const }
  return { kind: 'available' as const, offering, binding, business, contract }
}
