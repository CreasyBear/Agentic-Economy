import {
  defineCapabilityTransportBindingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

import { contractRefFromRow } from '../offering/registration'

export type CapabilityBindingRow = Readonly<{
  _id: string
  _creationTime: number
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
  admission: 'not_admitted' | 'admitted'
  conformance: 'not_conformant' | 'conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
  eligibilityHash: string
  registeredAt: number
  updatedAt: number
}>

export function bindingRegistrationFromRow(row: CapabilityBindingRow): CapabilityTransportBindingRegistration {
  return defineCapabilityTransportBindingRegistration({
    bindingId: row.bindingId, offeringId: row.offeringId, networkId: row.networkId,
    contractRef: contractRefFromRow(row), endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
    continuation: row.continuation, cancellation: row.cancellation,
    adapter: { adapterId: row.adapterId, config: null },
    registrationEvidenceRefs: row.registrationEvidenceRefs,
  })
}

export function transportAdmissionInput(registration: CapabilityTransportBindingRegistration) {
  return {
    adapterId: registration.adapter.adapterId,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: registration.continuation,
    cancellation: registration.cancellation,
    config: registration.adapter.config,
  }
}
