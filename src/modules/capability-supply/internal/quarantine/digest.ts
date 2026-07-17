import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CapabilityBindingRow } from '../binding'

export function bindingObservedRowDigest(binding: CapabilityBindingRow): string {
  return canonicalDigest({
    _id: binding._id,
    _creationTime: binding._creationTime,
    bindingId: binding.bindingId,
    offeringId: binding.offeringId,
    networkId: binding.networkId,
    capabilityId: binding.capabilityId,
    version: binding.version,
    contractDigest: binding.contractDigest,
    endpointUrl: binding.endpointUrl,
    credentialRef: binding.credentialRef,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    adapterId: binding.adapterId,
    configJson: binding.configJson,
    configDigest: binding.configDigest,
    registrationEvidenceRefs: binding.registrationEvidenceRefs,
    registrationHash: binding.registrationHash,
    admission: binding.admission,
    conformance: binding.conformance,
    admissionEvidenceRefs: binding.admissionEvidenceRefs,
    conformanceEvidenceRefs: binding.conformanceEvidenceRefs,
    eligibilityHash: binding.eligibilityHash,
    registeredAt: binding.registeredAt,
    updatedAt: binding.updatedAt,
  })
}
