import type {
  AdmittedOperationRef,
  CapabilityCancellation,
  CapabilityOfferingRegistration,
  PublicOperationRef,
} from '@/modules/capability-supply/public'
import type { RegisteredEvaluationBinding } from '@/modules/customer-request/evaluation'

type AvailableRouteableSupply = Readonly<{
  kind: 'available'
  supplies: ReadonlyArray<Readonly<{
    offering: Readonly<{
      businessId: string
      offeringId: string
      registrationHash: string
      presentation: CapabilityOfferingRegistration['presentation']
    }>
    binding: Readonly<{
      bindingId: string
      capabilityId: string
      version: number
      contractDigest: string
      registrationHash: string
      cancellation: CapabilityCancellation
    }>
    publication: Readonly<{
      publicationRef: string
      revision: number
      readinessValidUntil: number
      operationRef: PublicOperationRef
      admittedOperation: AdmittedOperationRef
      priceDigest: string
    }>
  }>>
}>

export function registeredEvaluationBindingsFromRouteableSupply(
  supply: AvailableRouteableSupply,
  options: Readonly<{ includePublication?: boolean }> = {},
): RegisteredEvaluationBinding[] {
  return supply.supplies.map(({ offering, binding, publication }) => ({
    businessId: String(offering.businessId),
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: {
      capabilityId: binding.capabilityId,
      version: binding.version,
      contractDigest: binding.contractDigest,
    },
    offeringRegistrationHash: offering.registrationHash,
    bindingRegistrationHash: binding.registrationHash,
    price: offering.presentation.price,
    priceDigest: publication.priceDigest,
    commercialRelationship: {
      ...offering.presentation.commercialRelationship,
      evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    operationRef: publication.operationRef,
    admittedOperation: publication.admittedOperation,
    ...(options.includePublication === true ? {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    } : {}),
  }))
}
