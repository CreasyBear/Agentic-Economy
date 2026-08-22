import {
  canonicalDigest,
  isCanonicalDigest,
} from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  isProviderConnectionAuthorityCurrent,
  type ProviderConnection,
} from '../../provider-connection'
import {
  defineCapabilityTransportBindingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

import { contractRefFromRow } from '../offering/registration'

export type CapabilityConnectionAuthoritySnapshot = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  operationRef: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
}>

export function connectionAuthoritySnapshotFromProviderConnection(
  connection: ProviderConnection,
  operationRef: string,
): CapabilityConnectionAuthoritySnapshot {
  return {
    connectionRef: connection.connectionRef,
    providerRef: connection.providerRef,
    adapterId: connection.adapterId,
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    operationRef,
    grantedScopes: uniqueSorted(connection.grantedScopes),
    grantedResources: uniqueSorted(connection.grantedResources),
  }
}

export function connectionAuthoritySnapshotIsValid(
  snapshot: CapabilityConnectionAuthoritySnapshot | undefined,
): snapshot is CapabilityConnectionAuthoritySnapshot {
  return snapshot !== undefined
    && snapshot.connectionRef.trim().length > 0
    && snapshot.providerRef.trim().length > 0
    && snapshot.adapterId.trim().length > 0
    && snapshot.operationRef.trim().length > 0
    && Number.isSafeInteger(snapshot.authorityGeneration)
    && snapshot.authorityGeneration >= 1
    && isCanonicalDigest(snapshot.authorityDigest)
    && snapshot.grantedScopes.every((scope, index) => (
      scope.trim().length > 0
      && (index === 0 || snapshot.grantedScopes[index - 1]! < scope)
    ))
    && snapshot.grantedResources.every((resource, index) => (
      resource.trim().length > 0
      && (index === 0 || snapshot.grantedResources[index - 1]! < resource)
    ))
}

export function connectionAuthoritySnapshotsEqual(
  left: CapabilityConnectionAuthoritySnapshot | undefined,
  right: CapabilityConnectionAuthoritySnapshot | undefined,
): boolean {
  return connectionAuthoritySnapshotIsValid(left)
    && connectionAuthoritySnapshotIsValid(right)
    && canonicalDigest(left) === canonicalDigest(right)
}

export function connectionAuthoritySnapshotMatches(
  snapshot: CapabilityConnectionAuthoritySnapshot | undefined,
  connection: ProviderConnection | null | undefined,
  expected: Readonly<{ businessId: string; operationRef: string; adapterId: string; now: number }>,
): connection is ProviderConnection {
  return connectionAuthoritySnapshotIsValid(snapshot)
    && connection != null
    && Number.isSafeInteger(expected.now)
    && expected.now >= 0
    && connection.lifecycle === 'active'
    && (connection.expiresAt === undefined || connection.expiresAt > expected.now)
    && isProviderConnectionAuthorityCurrent(connection)
    && String(connection.businessId) === expected.businessId
    && connection.connectionRef === snapshot.connectionRef
    && connection.providerRef === snapshot.providerRef
    && connection.adapterId === expected.adapterId
    && snapshot.adapterId === expected.adapterId
    && snapshot.operationRef === expected.operationRef
    && snapshot.authorityGeneration === connection.authorityGeneration
    && snapshot.authorityDigest === connection.authorityDigest
    && uniqueSorted(connection.grantedScopes).join('\u0000') === snapshot.grantedScopes.join('\u0000')
    && uniqueSorted(connection.grantedResources).join('\u0000') === snapshot.grantedResources.join('\u0000')
}

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
  authority: CapabilityTransportBindingRegistration['authority']
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
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
    contractRef: contractRefFromRow(row), endpointUrl: row.endpointUrl, authority: row.authority,
    continuation: row.continuation, cancellation: row.cancellation,
    adapter: { adapterId: row.adapterId, config: null },
    registrationEvidenceRefs: row.registrationEvidenceRefs,
  })
}

export function transportAdmissionInput(registration: CapabilityTransportBindingRegistration) {
  return {
    adapterId: registration.adapter.adapterId,
    endpointUrl: registration.endpointUrl,
    authority: registration.authority,
    continuation: registration.continuation,
    cancellation: registration.cancellation,
    config: registration.adapter.config,
  }
}
