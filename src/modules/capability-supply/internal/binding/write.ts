import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import {
  admitRegisteredTransport,
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityTransportBindingRegistration,
  isPublicOperationRef,
  type CapabilityTransportBindingRegistration,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'

import { isProviderConnectionAuthorityCurrent, type ProviderConnection } from '../../provider-connection'
import {
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  type CapabilityConnectionAuthoritySnapshot,
} from './registration'
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
  authority: CapabilityTransportBindingRegistration['authority']
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
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
  loadProviderConnection: (connectionRef: string) => Promise<ProviderConnection | undefined>
  resolveExactContract: (ref: CapabilityContractRef) => Promise<BindingWriteContractResult>
  loadBindingByBindingId: (bindingId: string) => Promise<CapabilityBindingRow | null>
  insertBinding: (row: BindingInsertRow) => Promise<void>
}>

export type RotateCapabilityTransportBindingAuthorityInput = Readonly<{
  bindingId: string
  offeringId: string
  businessId: string
  registrationHash: string
  connectionRef: string
  providerRef: string
  adapterId: string
  previousAuthority: CapabilityConnectionAuthoritySnapshot
  previousOperationRef: PublicOperationRef
  nextOperationRef: PublicOperationRef
}>

export type RotateCapabilityTransportBindingAuthorityPatch = Readonly<{
  expectedRegistrationHash: string
  expectedAuthority: CapabilityConnectionAuthoritySnapshot
  nextAuthority: CapabilityConnectionAuthoritySnapshot
  updatedAt: number
}>

export type RotateCapabilityTransportBindingAuthorityResult =
  | Readonly<{
    kind: 'rotated'
    bindingId: string
    previousOperationRef: PublicOperationRef
    operationRef: PublicOperationRef
  }>
  | Readonly<{ kind: 'refused'; reason: string }>

type RotateCapabilityTransportBindingAuthorityPorts = Pick<
  BindingWritePorts,
  | 'loadOfferingByOfferingId'
  | 'loadPublishedBusiness'
  | 'loadProviderConnection'
  | 'loadBindingByBindingId'
> & Readonly<{
  patchBindingConnectionAuthority: (
    bindingId: string,
    patch: RotateCapabilityTransportBindingAuthorityPatch,
  ) => Promise<void>
}>

export async function rotateCapabilityTransportBindingAuthority(
  ports: RotateCapabilityTransportBindingAuthorityPorts,
  input: RotateCapabilityTransportBindingAuthorityInput,
  updatedAt: number,
): Promise<RotateCapabilityTransportBindingAuthorityResult> {
  if (
    !Number.isSafeInteger(updatedAt)
    || updatedAt < 0
    || !isPublicOperationRef(input.previousOperationRef)
    || !isPublicOperationRef(input.nextOperationRef)
    || input.previousOperationRef === input.nextOperationRef
  ) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }
  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(input.offeringId),
    ports.loadBindingByBindingId(input.bindingId),
  ])
  if (offering === null || binding === null) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }
  if (!offeringIntegrityIsValid(offering) || !bindingIntegrityIsValid(binding)) {
    return { kind: 'refused', reason: 'binding_integrity_failure' }
  }
  if (
    binding.bindingId !== input.bindingId
    || binding.offeringId !== input.offeringId
    || binding.registrationHash !== input.registrationHash
    || String(offering.businessId) !== input.businessId
    || await ports.loadPublishedBusiness(input.businessId) === null
    || binding.authority.kind !== 'provider_connection'
    || binding.authority.connectionRef !== input.connectionRef
    || binding.authority.providerRef !== input.providerRef
    || binding.adapterId !== input.adapterId
    || !connectionAuthoritySnapshotsEqual(binding.connectionAuthority, input.previousAuthority)
  ) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }
  const connection = await ports.loadProviderConnection(input.connectionRef)
  if (
    connection === undefined
    || connection.providerRef !== input.providerRef
    || connection.adapterId !== input.adapterId
    || String(connection.businessId) !== input.businessId
    || !connectionAuthoritySnapshotMatches(binding.connectionAuthority, connection, {
      businessId: input.businessId,
      operationRef: input.previousOperationRef,
      adapterId: input.adapterId,
      now: updatedAt,
    })
  ) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }
  const nextAuthority = connectionAuthoritySnapshotFromProviderConnection(
    connection,
    input.nextOperationRef,
  )
  await ports.patchBindingConnectionAuthority(binding.bindingId, {
    expectedRegistrationHash: binding.registrationHash,
    expectedAuthority: binding.connectionAuthority!,
    nextAuthority,
    updatedAt,
  })
  return {
    kind: 'rotated',
    bindingId: binding.bindingId,
    previousOperationRef: input.previousOperationRef,
    operationRef: input.nextOperationRef,
  }
}

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
  expectedOperationRef?: string,
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
  if (await ports.loadPublishedBusiness(String(offering.businessId)) === null) {
    return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  }
  const contract = await ports.resolveExactContract(registration.contractRef)
  if (contract.kind === 'refused') return contract
  const admission = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admission.kind === 'refused') return admission
  const operationRef = expectedOperationRef ?? createPublicOperationRef({
    operationId: capabilityOperationId(registration.contractRef.capabilityId),
    publicationRef: registration.offeringId,
    publicationRevision: 1,
    contractRef: registration.contractRef,
  })
  if (!isPublicOperationRef(operationRef)) {
    return { kind: 'refused' as const, reason: 'connection_operation_mismatch' as const }
  }

  let connectionAuthority: CapabilityConnectionAuthoritySnapshot | undefined
  let connection: ProviderConnection | null = null
  if (registration.authority.kind === 'provider_connection') {
    const loaded = await ports.loadProviderConnection(registration.authority.connectionRef)
    if (loaded == null) return { kind: 'refused' as const, reason: 'connection_not_found' as const }
    if (String(loaded.businessId) !== String(offering.businessId)) {
      return { kind: 'refused' as const, reason: 'connection_owner_mismatch' as const }
    }
    if (loaded.providerRef !== registration.authority.providerRef) {
      return { kind: 'refused' as const, reason: 'connection_provider_mismatch' as const }
    }
    if (loaded.adapterId !== admission.transport.adapterId) {
      return { kind: 'refused' as const, reason: 'connection_adapter_mismatch' as const }
    }
    if (loaded.lifecycle !== 'active' || (loaded.expiresAt !== undefined && loaded.expiresAt <= registeredAt)) {
      return { kind: 'refused' as const, reason: 'connection_inactive' as const }
    }
    if (!isProviderConnectionAuthorityCurrent(loaded)) {
      return { kind: 'refused' as const, reason: 'connection_authority_invalid' as const }
    }
    connection = loaded
    connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(loaded, operationRef)
  }

  const registrationHash = capabilityBindingRegistrationHash(registration, admission.transport)
  const existing = await ports.loadBindingByBindingId(registration.bindingId)
  if (existing !== null) {
    if (!bindingIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    if (existing.registrationHash !== registrationHash) {
      return { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
    }
    if (registration.authority.kind === 'provider_connection'
      && !connectionAuthoritySnapshotMatches(existing.connectionAuthority, connection, {
        businessId: String(offering.businessId),
        operationRef,
        adapterId: admission.transport.adapterId,
        now: registeredAt,
      })) {
      return { kind: 'refused' as const, reason: 'connection_authority_stale' as const }
    }
    return { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: false }
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
    authority: registration.authority,
    ...(connectionAuthority === undefined ? {} : { connectionAuthority }),
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
