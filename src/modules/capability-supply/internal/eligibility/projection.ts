import type { CapabilityBindingRow } from '../binding'
import { contractRefFromRow, type CapabilityOfferingRow } from '../offering'

export function compareStableIdentifier(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function eligibleOfferingProjection<T extends CapabilityOfferingRow>(row: T): {
  offeringId: T['offeringId']
  businessId: T['businessId']
  networkId: T['networkId']
  capabilityId: T['capabilityId']
  version: T['version']
  contractDigest: T['contractDigest']
  origin?: T['origin']
  presentation: T['presentation']
  status: 'active'
  registrationHash: T['registrationHash']
} {
  return {
    offeringId: row.offeringId, businessId: row.businessId, networkId: row.networkId,
    ...contractRefFromRow(row), presentation: row.presentation, status: 'active' as const,
    ...(row.origin === undefined ? {} : { origin: row.origin }),
    registrationHash: row.registrationHash,
  }
}

export function eligibleBindingProjection<T extends CapabilityBindingRow>(row: T): {
  bindingId: T['bindingId']
  offeringId: T['offeringId']
  networkId: T['networkId']
  capabilityId: T['capabilityId']
  version: T['version']
  contractDigest: T['contractDigest']
  endpointUrl: T['endpointUrl']
  credentialRef: T['credentialRef']
  continuation: T['continuation']
  cancellation: T['cancellation']
  adapterId: T['adapterId']
  configJson: T['configJson']
  configDigest: T['configDigest']
  admission: 'admitted'
  conformance: 'conformant'
  registrationHash: T['registrationHash']
} {
  return {
    bindingId: row.bindingId, offeringId: row.offeringId, networkId: row.networkId,
    ...contractRefFromRow(row), endpointUrl: row.endpointUrl, credentialRef: row.credentialRef,
    continuation: row.continuation, cancellation: row.cancellation,
    adapterId: row.adapterId, configJson: row.configJson, configDigest: row.configDigest,
    admission: 'admitted' as const, conformance: 'conformant' as const,
    registrationHash: row.registrationHash,
  }
}
