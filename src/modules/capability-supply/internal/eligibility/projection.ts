import type { CapabilityBindingRow, CapabilityConnectionAuthoritySnapshot } from '../binding/registration'
import { contractRefFromRow, type CapabilityOfferingRow } from '../offering/registration'

export function compareStableIdentifier(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type EligibleOfferingProjection<T extends CapabilityOfferingRow = CapabilityOfferingRow> = {
  offeringId: T['offeringId']
  businessId: T['businessId']
  networkId: T['networkId']
  capabilityId: T['capabilityId']
  version: T['version']
  contractDigest: T['contractDigest']
  origin?: T['origin']
  presentation: T['presentation']
  status: 'active'
  searchTerms?: T['searchTerms']
  registrationHash: T['registrationHash']
}

export function eligibleOfferingProjection<T extends CapabilityOfferingRow>(
  row: T,
): EligibleOfferingProjection<T> {
  return {
    offeringId: row.offeringId, businessId: row.businessId, networkId: row.networkId,
    ...contractRefFromRow(row), presentation: row.presentation, status: 'active' as const,
    ...(row.origin === undefined ? {} : { origin: row.origin }),
    ...(row.searchTerms === undefined || row.searchTerms.length === 0
      ? {}
      : { searchTerms: row.searchTerms }),
    registrationHash: row.registrationHash,
  }
}

export type EligibleBindingProjection<T extends CapabilityBindingRow = CapabilityBindingRow> = {
  bindingId: T['bindingId']
  offeringId: T['offeringId']
  networkId: T['networkId']
  capabilityId: T['capabilityId']
  version: T['version']
  contractDigest: T['contractDigest']
  endpointUrl: T['endpointUrl']
  authority: T['authority']
  connectionAuthority?: CapabilityConnectionAuthoritySnapshot
  continuation: T['continuation']
  cancellation: T['cancellation']
  adapterId: T['adapterId']
  configJson: T['configJson']
  configDigest: T['configDigest']
  admission: 'admitted'
  conformance: 'conformant'
  registrationHash: T['registrationHash']
}

export function eligibleBindingProjection<T extends CapabilityBindingRow>(
  row: T,
): EligibleBindingProjection<T> {
  return {
    bindingId: row.bindingId, offeringId: row.offeringId, networkId: row.networkId,
    ...contractRefFromRow(row), endpointUrl: row.endpointUrl, authority: row.authority,
    ...(row.connectionAuthority === undefined ? {} : { connectionAuthority: row.connectionAuthority }),
    continuation: row.continuation, cancellation: row.cancellation,
    adapterId: row.adapterId, configJson: row.configJson, configDigest: row.configDigest,
    admission: 'admitted' as const, conformance: 'conformant' as const,
    registrationHash: row.registrationHash,
  }
}

