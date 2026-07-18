import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import {
  admitRegisteredTransport,
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  defineCapabilityTransportBindingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

import { offeringIntegrityIsValid } from '../offering/integrity'
import {
  contractRefFromRow,
  type CapabilityContractRef,
  type CapabilityOfferingRow,
} from '../offering/registration'
import { bindingIntegrityIsValid } from './integrity'
import { transportAdmissionInput, type CapabilityBindingRow } from './registration'

export type BindingWritePublishedBusiness = Readonly<{
  businessId: string
}>

export type BindingWriteContractResult =
  | Readonly<{ kind: 'found' }>
  | Readonly<{
    kind: 'refused'
    reason: 'contract_not_found' | 'contract_not_active' | 'contract_integrity_failure'
  }>

export type BindingInsertRow = Readonly<{
  bindingId: string
  offeringId: string
  networkId: string
  capabilityId: string
  version: number
  contractDigest: string
  endpointUrl: string
  credentialRef: string
  continuation: CapabilityTransportBindingRegistration['continuation']
  cancellation: CapabilityTransportBindingRegistration['cancellation']
  adapterId: string
  configJson: string
  configDigest: string
  registrationEvidenceRefs: readonly string[]
  registrationHash: string
  admission: 'not_admitted'
  conformance: 'not_conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
  eligibilityHash: string
  registeredAt: number
  updatedAt: number
}>

export type BindingWritePorts = Readonly<{
  loadOfferingByOfferingId: (offeringId: string) => Promise<CapabilityOfferingRow | null>
  loadPublishedBusiness: (
    businessId: string,
  ) => Promise<BindingWritePublishedBusiness | null>
  resolveExactContract: (ref: CapabilityContractRef) => Promise<BindingWriteContractResult>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  insertBinding: (row: BindingInsertRow) => Promise<void>
}>

export type RegisterBindingWriteResult =
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{
    kind: 'registered'
    bindingId: string
    registrationHash: string
    created: boolean
  }>

export async function registerCapabilityTransportBinding(
  ports: BindingWritePorts,
  input: unknown,
  registeredAt: number,
): Promise<RegisterBindingWriteResult> {
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const offering = await ports.loadOfferingByOfferingId(registration.offeringId)
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  if (!offeringIntegrityIsValid(offering)) {
    return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
  }
  if (
    offering.networkId !== registration.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), registration.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (await ports.loadPublishedBusiness(offering.businessId) === null) {
    return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  }
  const contract = await ports.resolveExactContract(registration.contractRef)
  if (contract.kind === 'refused') return contract
  const admission = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admission.kind === 'refused') return admission
  const registrationHash = capabilityBindingRegistrationHash(registration, admission.transport)
  const existing = await ports.loadBindingByBindingId(registration.bindingId)
  if (existing !== null) {
    if (!bindingIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
  }
  const initialAdmission = 'not_admitted' as const
  const conformance = 'not_conformant' as const
  const admissionEvidenceRefs: string[] = []
  const conformanceEvidenceRefs: string[] = []
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: registration.bindingId, registrationHash, admission: initialAdmission, conformance,
    admissionEvidenceRefs, conformanceEvidenceRefs,
  })
  await ports.insertBinding({
    bindingId: registration.bindingId,
    offeringId: registration.offeringId,
    networkId: registration.networkId,
    capabilityId: registration.contractRef.capabilityId,
    version: registration.contractRef.version,
    contractDigest: registration.contractRef.contractDigest,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: { ...registration.continuation, evidenceRefs: [...registration.continuation.evidenceRefs] },
    cancellation: { ...registration.cancellation, evidenceRefs: [...registration.cancellation.evidenceRefs] },
    adapterId: admission.transport.adapterId,
    configJson: admission.transport.configJson,
    configDigest: admission.transport.configDigest,
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    admission: initialAdmission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: true }
}
