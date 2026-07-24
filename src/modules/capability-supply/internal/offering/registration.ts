import {
  defineCapabilityOfferingRegistration,
  type CapabilityOfferingRegistration,
} from '@/modules/capability-supply/public'

export type CapabilityContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>

export type CapabilityOfferingRow = Readonly<{
  offeringId: string
  businessId: string
  networkId: string
  capabilityId: string
  version: number
  contractDigest: string
  origin?: CapabilityOfferingRegistration['origin']
  presentation: CapabilityOfferingRegistration['presentation']
  searchTerms: readonly string[]
  registrationEvidenceRefs: readonly string[]
  registrationHash: string
  status: 'inactive' | 'active'
  admissionEvidenceRefs: readonly string[]
  eligibilityHash: string
  registeredAt: number
  updatedAt: number
}>

export function contractRefFromRow(row: CapabilityContractRef): CapabilityContractRef {
  return { capabilityId: row.capabilityId, version: row.version, contractDigest: row.contractDigest }
}

export function offeringRegistrationFromRow(row: CapabilityOfferingRow): CapabilityOfferingRegistration {
  return defineCapabilityOfferingRegistration({
    offeringId: row.offeringId, businessId: row.businessId, networkId: row.networkId,
    contractRef: contractRefFromRow(row), presentation: row.presentation,
    ...(row.origin === undefined ? {} : { origin: row.origin }),
    searchTerms: row.searchTerms, registrationEvidenceRefs: row.registrationEvidenceRefs,
  })
}

export function writablePresentation(presentation: CapabilityOfferingRegistration['presentation']) {
  return {
    ...presentation,
    materialTerms: presentation.materialTerms.map((term) => ({ ...term })),
    commercialRelationship: {
      ...presentation.commercialRelationship,
      evidenceRefs: [...presentation.commercialRelationship.evidenceRefs],
    },
  }
}
