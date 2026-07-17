import type { RegistrationContext, SupplyAuditInput, SupplyCommandActor } from '../shared'

export function bindingRegistrationAudit(
  actor: SupplyCommandActor,
  context: RegistrationContext,
  offeringId: string,
  result: Readonly<{ bindingId: string; registrationHash: string }>,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_binding.registered',
    action: 'register_binding',
    targetType: 'capability_binding',
    targetRef: result.bindingId,
    actor,
    context,
    payload: { bindingId: result.bindingId, offeringId, registrationHash: result.registrationHash },
    beforeState: 'absent',
    afterState: 'not_admitted',
    createdAt,
  }
}
