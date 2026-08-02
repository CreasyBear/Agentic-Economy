import type { CapabilityBindingRow, CapabilityOfferingRow } from '@/modules/capability-supply/public'
import type { Doc } from './_generated/dataModel'

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
    credentialRef: doc.credentialRef,
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
