import {
  capabilityBindingEligibilityHash,
  capabilityOfferingEligibilityHash,
} from '@/modules/capability-supply/public'

import type { RegistrationContext, SupplyAuditInput, SupplyCommandActor } from '../shared'
import type { DesiredEligibility, EligibilityInput } from './decision'

export function eligibilityReplayAudits(
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  desired: DesiredEligibility,
  createdAt: number,
): readonly Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>[] {
  const offeringEligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: command.eligibility.offeringId,
    registrationHash: command.eligibility.expectedOfferingRegistrationHash,
    status: desired.offeringStatus,
    admissionEvidenceRefs: command.eligibility.admissionEvidenceRefs,
  })
  const bindingEligibilityHash = capabilityBindingEligibilityHash({
    bindingId: command.eligibility.bindingId,
    registrationHash: command.eligibility.expectedBindingRegistrationHash,
    admission: desired.bindingAdmission,
    conformance: desired.bindingConformance,
    admissionEvidenceRefs: command.eligibility.admissionEvidenceRefs,
    conformanceEvidenceRefs: command.eligibility.conformanceEvidenceRefs,
  })
  return [
    {
      audit: {
        eventType: 'capability_supply.eligibility_changed' as const,
        action: 'set_eligibility' as const,
        targetType: 'capability_offering' as const,
        targetRef: command.eligibility.offeringId,
        actor: command.actor,
        context: command.context,
        payload: {
          offeringId: command.eligibility.offeringId,
          registrationHash: command.eligibility.expectedOfferingRegistrationHash,
          eligibilityHash: offeringEligibilityHash,
        },
        beforeState: '',
        afterState: desired.offeringStatus,
        createdAt,
      },
      allowedBeforeStates: ['inactive', 'active'],
    },
    {
      audit: {
        eventType: 'capability_supply.eligibility_changed' as const,
        action: 'set_eligibility' as const,
        targetType: 'capability_binding' as const,
        targetRef: command.eligibility.bindingId,
        actor: command.actor,
        context: command.context,
        payload: {
          offeringId: command.eligibility.offeringId,
          bindingId: command.eligibility.bindingId,
          registrationHash: command.eligibility.expectedBindingRegistrationHash,
          eligibilityHash: bindingEligibilityHash,
        },
        beforeState: '',
        afterState: `${desired.bindingAdmission}:${desired.bindingConformance}`,
        createdAt,
      },
      allowedBeforeStates: ['not_admitted:not_conformant', 'admitted:conformant'],
    },
  ]
}
