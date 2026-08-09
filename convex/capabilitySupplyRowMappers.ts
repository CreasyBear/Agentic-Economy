import {
  isRegisteredOperationMappingRef,
  resolveRegisteredOperationMappingRef,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import type { CapabilityBindingRow, CapabilityOfferingRow } from '@/modules/capability-supply/public'
import type { Doc } from './_generated/dataModel'

export function toRegisteredOperationMapping(
  doc: Doc<'registeredOperationMappings'>,
): RegisteredOperationMapping | null {
  if (!isRegisteredOperationMappingRef(doc.mappingRef)) return null
  const mapping: RegisteredOperationMapping = {
    ...doc.material,
    mappingRef: doc.mappingRef,
  }
  try {
    return resolveRegisteredOperationMappingRef(mapping) === mapping.mappingRef ? mapping : null
  } catch {
    return null
  }
}

export function toCapabilityOfferingRow(doc: Doc<'capabilityOfferings'>): CapabilityOfferingRow {
  return {
    offeringId: doc.offeringId,
    businessId: doc.businessId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    ...(doc.origin === undefined ? {} : { origin: doc.origin }),
    presentation: doc.presentation,
    searchTerms: doc.searchTerms,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    status: doc.status,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}

export function toCapabilityBindingRow(doc: Doc<'capabilityTransportBindings'>): CapabilityBindingRow {
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    bindingId: doc.bindingId,
    offeringId: doc.offeringId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    endpointUrl: doc.endpointUrl,
    authority: doc.authority,
    ...(doc.connectionAuthority === undefined ? {} : { connectionAuthority: doc.connectionAuthority }),
    continuation: doc.continuation,
    cancellation: doc.cancellation,
    adapterId: doc.adapterId,
    configJson: doc.configJson,
    configDigest: doc.configDigest,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    admission: doc.admission,
    conformance: doc.conformance,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    conformanceEvidenceRefs: doc.conformanceEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}
