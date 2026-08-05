import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilitySupplyEligibilityHash,
} from '@/modules/capability-supply/public'

import {
  MAX_CONTEXT_VALUE_LENGTH,
  boundedTrimmed,
  validEvidenceRefs,
} from '../shared/command-envelope'

export type EligibilityContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>

export type EligibilityInput = Readonly<{
  offeringId: string
  bindingId: string
  contractRef: EligibilityContractRef
  decision: 'admit' | 'revoke'
  expectedOfferingRegistrationHash: string
  expectedBindingRegistrationHash: string
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
}>

export type DesiredEligibility = Readonly<{
  offeringStatus: 'active' | 'inactive'
  bindingAdmission: 'admitted' | 'not_admitted'
  bindingConformance: 'conformant' | 'not_conformant'
}>

export function validEligibilityInput(input: EligibilityInput): boolean {
  return boundedTrimmed(input.offeringId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.bindingId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.contractRef.capabilityId, MAX_CONTEXT_VALUE_LENGTH)
    && Number.isSafeInteger(input.contractRef.version)
    && input.contractRef.version > 0
    && isCanonicalDigest(input.contractRef.contractDigest)
    && isCanonicalDigest(input.expectedOfferingRegistrationHash)
    && isCanonicalDigest(input.expectedBindingRegistrationHash)
    && validEvidenceRefs(input.admissionEvidenceRefs)
    && validEvidenceRefs(input.conformanceEvidenceRefs)
}

export function desiredEligibility(
  decision: 'admit' | 'revoke', remainingOfferingStatus: 'active' | 'inactive',
): DesiredEligibility {
  return decision === 'admit'
    ? {
        offeringStatus: 'active' as const,
        bindingAdmission: 'admitted' as const,
        bindingConformance: 'conformant' as const,
      }
    : {
        offeringStatus: remainingOfferingStatus,
        bindingAdmission: 'not_admitted' as const,
        bindingConformance: 'not_conformant' as const,
      }
}

export function eligibilityPublicResult(input: EligibilityInput, desired: DesiredEligibility) {
  return {
    kind: input.decision === 'admit' ? 'eligible' as const : 'ineligible' as const,
    offeringId: input.offeringId,
    bindingId: input.bindingId,
    eligibilityHash: capabilitySupplyEligibilityHash({
      offeringId: input.offeringId,
      bindingId: input.bindingId,
      offeringRegistrationHash: input.expectedOfferingRegistrationHash,
      bindingRegistrationHash: input.expectedBindingRegistrationHash,
      offeringStatus: desired.offeringStatus,
      bindingAdmission: desired.bindingAdmission,
      bindingConformance: desired.bindingConformance,
      admissionEvidenceRefs: input.admissionEvidenceRefs,
      conformanceEvidenceRefs: input.conformanceEvidenceRefs,
    }),
  }
}
