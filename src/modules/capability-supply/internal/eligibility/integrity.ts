import {
  capabilityBindingEligibilityHash,
  capabilityOfferingEligibilityHash,
} from '@/modules/capability-supply/public'

import type { CapabilityBindingRow } from '../binding'
import type { CapabilityOfferingRow } from '../offering'

export function offeringEligibilityIsValid(row: CapabilityOfferingRow): boolean {
  return capabilityOfferingEligibilityHash({
    offeringId: row.offeringId, registrationHash: row.registrationHash,
    status: row.status, admissionEvidenceRefs: row.admissionEvidenceRefs,
  }) === row.eligibilityHash
}

export function bindingEligibilityIsValid(row: CapabilityBindingRow): boolean {
  return capabilityBindingEligibilityHash({
    bindingId: row.bindingId, registrationHash: row.registrationHash,
    admission: row.admission, conformance: row.conformance,
    admissionEvidenceRefs: row.admissionEvidenceRefs,
    conformanceEvidenceRefs: row.conformanceEvidenceRefs,
  }) === row.eligibilityHash
}
