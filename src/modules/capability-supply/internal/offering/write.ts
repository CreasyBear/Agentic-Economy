import {
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  type CapabilityOfferingRegistration,
} from '@/modules/capability-supply/public'

import { offeringIntegrityIsValid } from './integrity'
import {
  writablePresentation,
  type CapabilityContractRef,
  type CapabilityOfferingRow,
} from './registration'

export type OfferingWritePublishedBusiness = Readonly<{
  businessId: string
}>

export type OfferingWriteContractResult =
  | Readonly<{ kind: 'found' }>
  | Readonly<{
    kind: 'refused'
    reason: 'contract_not_found' | 'contract_not_active' | 'contract_integrity_failure'
  }>

export type OfferingInsertRow = Readonly<{
  offeringId: string
  businessId: string
  networkId: string
  capabilityId: string
  version: number
  contractDigest: string
  presentation: ReturnType<typeof writablePresentation>
  searchTerms: readonly string[]
  registrationEvidenceRefs: readonly string[]
  registrationHash: string
  status: 'inactive'
  admissionEvidenceRefs: readonly string[]
  eligibilityHash: string
  registeredAt: number
  updatedAt: number
}>

export type OfferingWritePorts = Readonly<{
  loadPublishedBusiness: (
    businessId: string,
  ) => Promise<OfferingWritePublishedBusiness | null>
  resolveExactContract: (ref: CapabilityContractRef) => Promise<OfferingWriteContractResult>
  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  insertOffering: (row: OfferingInsertRow) => Promise<void>
}>

export type RegisterOfferingWriteResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{
    kind: 'registered'
    offeringId: string
    registrationHash: string
    created: boolean
  }>

export async function registerCapabilityOffering(
  ports: OfferingWritePorts,
  input: unknown,
  registeredAt: number,
): Promise<RegisterOfferingWriteResult> {
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const business = await ports.loadPublishedBusiness(registration.businessId)
  if (business === null) return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  const contract = await ports.resolveExactContract(registration.contractRef)
  if (contract.kind === 'refused') return contract
  const registrationHash = capabilityOfferingRegistrationHash(registration)
  const existing = await ports.loadOfferingByOfferingId(registration.offeringId)
  if (existing !== null) {
    if (!offeringIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
  }
  const status = 'inactive' as const
  const admissionEvidenceRefs: string[] = []
  const eligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: registration.offeringId, registrationHash, status, admissionEvidenceRefs,
  })
  await ports.insertOffering({
    offeringId: registration.offeringId,
    businessId: business.businessId,
    networkId: registration.networkId,
    capabilityId: registration.contractRef.capabilityId,
    version: registration.contractRef.version,
    contractDigest: registration.contractRef.contractDigest,
    presentation: writablePresentation(registration.presentation),
    searchTerms: [...registration.searchTerms],
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: true }
}
