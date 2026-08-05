import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import {
  capabilityBindingEligibilityHash,
  capabilityOfferingEligibilityHash,
  capabilitySupplyEligibilityHash,
} from '@/modules/capability-supply/public'

import { bindingIntegrityIsValid } from '../binding/integrity'
import type { CapabilityBindingRow } from '../binding/registration'
import {
  contractRefFromRow,
  type CapabilityContractRef,
  type CapabilityOfferingRow,
} from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import {
  desiredEligibility,
  validEligibilityInput,
  type EligibilityInput,
} from './decision'

export type EligibilityWritePublishedBusiness = Readonly<{
  businessId: string
}>

export type EligibilityWriteContractResult =
  | Readonly<{ kind: 'found' }>
  | Readonly<{
    kind: 'refused'
    reason: 'contract_not_found' | 'contract_not_active' | 'contract_integrity_failure'
  }>

export type OfferingEligibilityPatch = Readonly<{
  status: 'active' | 'inactive'
  admissionEvidenceRefs: readonly string[]
  eligibilityHash: string
  updatedAt: number
}>

export type BindingEligibilityPatch = Readonly<{
  admission: 'admitted' | 'not_admitted'
  conformance: 'conformant' | 'not_conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
  eligibilityHash: string
  updatedAt: number
}>

export type EligibilityWritePorts = Readonly<{
  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  listAdmittedConformantBindings: (
    offeringId: string,
    limit: number,
  ) => Promise<readonly CapabilityBindingRow[]>
  resolveExactContract: (ref: CapabilityContractRef) => Promise<EligibilityWriteContractResult>
  loadPublishedBusiness: (
    businessId: string,
  ) => Promise<EligibilityWritePublishedBusiness | null>
  patchOfferingEligibility: (
    offeringId: string,
    patch: OfferingEligibilityPatch,
  ) => Promise<void>
  patchBindingEligibility: (
    bindingId: string,
    patch: BindingEligibilityPatch,
  ) => Promise<void>
}>

export type SetEligibilityWriteResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{
    kind: 'eligible' | 'ineligible'
    offeringId: string
    bindingId: string
    eligibilityHash: string
    offeringEligibilityHash: string
    bindingEligibilityHash: string
    transition: Readonly<{
      offeringBefore: string
      offeringAfter: 'active' | 'inactive'
      bindingBefore: string
      bindingAfter: string
    }>
  }>

export async function setCapabilitySupplyEligibility(
  ports: EligibilityWritePorts,
  input: EligibilityInput,
  updatedAt: number,
): Promise<SetEligibilityWriteResult> {
  if (!validEligibilityInput(input)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const offering = await ports.loadOfferingByOfferingId(input.offeringId)
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  const binding = await ports.loadBindingByBindingId(input.bindingId)
  if (binding === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  if (
    offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
  ) {
    return { kind: 'refused' as const, reason: 'registration_changed' as const }
  }
  if (
    binding.offeringId !== offering.offeringId
    || binding.networkId !== offering.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (input.decision === 'admit') {
    if (!offeringIntegrityIsValid(offering)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    if (!bindingIntegrityIsValid(binding)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    const contract = await ports.resolveExactContract(input.contractRef)
    if (contract.kind === 'refused') return contract
    if (await ports.loadPublishedBusiness(offering.businessId) === null) {
      return { kind: 'refused' as const, reason: 'business_not_registered' as const }
    }
  }
  const eligibleSiblings = input.decision === 'revoke'
    ? await ports.listAdmittedConformantBindings(offering.offeringId, 2)
    : []
  const hasOtherEligibleBinding = eligibleSiblings.some((candidate) => candidate.bindingId !== binding.bindingId)
  const desired = desiredEligibility(input.decision, hasOtherEligibleBinding ? 'active' : 'inactive')
  const offeringEligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: offering.offeringId, registrationHash: offering.registrationHash,
    status: desired.offeringStatus, admissionEvidenceRefs: input.admissionEvidenceRefs,
  })
  const bindingEligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: input.admissionEvidenceRefs,
    conformanceEvidenceRefs: input.conformanceEvidenceRefs,
  })
  await ports.patchOfferingEligibility(offering.offeringId, {
    status: desired.offeringStatus, admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    eligibilityHash: offeringEligibilityHash, updatedAt,
  })
  await ports.patchBindingEligibility(binding.bindingId, {
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    conformanceEvidenceRefs: [...input.conformanceEvidenceRefs],
    eligibilityHash: bindingEligibilityHash, updatedAt,
  })
  return {
    kind: input.decision === 'admit' ? 'eligible' as const : 'ineligible' as const,
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    eligibilityHash: capabilitySupplyEligibilityHash({
      offeringId: offering.offeringId, bindingId: binding.bindingId,
      offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
      offeringStatus: desired.offeringStatus,
      bindingAdmission: desired.bindingAdmission,
      bindingConformance: desired.bindingConformance,
      admissionEvidenceRefs: input.admissionEvidenceRefs,
      conformanceEvidenceRefs: input.conformanceEvidenceRefs,
    }),
    offeringEligibilityHash,
    bindingEligibilityHash,
    transition: {
      offeringBefore: offering.status,
      offeringAfter: desired.offeringStatus,
      bindingBefore: `${binding.admission}:${binding.conformance}`,
      bindingAfter: `${desired.bindingAdmission}:${desired.bindingConformance}`,
    },
  }
}
