import {
  admitRegisteredTransport,
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import { type StableHashValue } from '@/modules/common/stable-hash'

import {
  bindingRegistrationAudit,
  transportAdmissionInput,
} from '../binding'
import {
  desiredEligibility,
  eligibilityPublicResult,
  eligibilityReplayAudits,
  validEligibilityInput,
  type EligibilityInput,
} from '../eligibility'
import {
  bindingObservedRowDigest,
  offeringStatusAfterBindingQuarantine,
  quarantineBindingAudit,
  quarantineParentAudit,
  quarantineParentUpdatedDisposition,
  type QuarantineParentDisposition,
} from '../quarantine'
import {
  MAX_CONTEXT_VALUE_LENGTH,
  boundedTrimmed,
  validCommandEnvelope,
  type RegistrationContext,
  type SupplyCommandActor,
} from '../shared'
import {
  beginOperation,
  failOperation,
  replayOperationResult,
  succeedOperation,
} from './policy'
import {
  ensureSupplyAudit,
  recoverBindingReplay,
  recoverEligibilityReplayDesired,
  recoverOfferingReplay,
  replayQuarantineBinding,
  trustedQuarantineParent,
  verifyReplayAudits,
} from './replay'
import type {
  OperationLedgerPorts,
  QuarantineCommand,
  RegistrationCommand,
} from './types'

export async function registerCapabilityOfferingCommand(
  ports: OperationLedgerPorts,
  command: RegistrationCommand,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const expectedResult = {
    kind: 'registered' as const,
    offeringId: registration.offeringId,
    registrationHash: capabilityOfferingRegistrationHash(registration),
  }
  const audit = {
    eventType: 'capability_offering.registered' as const,
    action: 'register_offering' as const,
    targetType: 'capability_offering' as const,
    targetRef: expectedResult.offeringId,
    actor: command.actor,
    context: command.context,
    payload: { offeringId: expectedResult.offeringId, registrationHash: expectedResult.registrationHash },
    beforeState: 'absent',
    afterState: 'inactive',
    createdAt: now,
  }
  const operation = await beginOperation(
    ports, command.actor, 'registerCapabilityOffering', command.context, { registration }, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    await verifyReplayAudits(ports, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return await recoverOfferingReplay(ports, registration, operation)
  }
  const result = await ports.registerOffering(registration, now)
  if (result.kind === 'refused') {
    await failOperation(ports, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(ports, audit)
  await succeedOperation(ports, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function registerCapabilityBindingCommand(
  ports: OperationLedgerPorts,
  command: RegistrationCommand,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const operation = await beginOperation(
    ports, command.actor, 'registerCapabilityTransportBinding', command.context, {
      registration,
    }, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const recovered = await recoverBindingReplay(ports, registration, operation)
    const audit = bindingRegistrationAudit(command.actor, command.context, registration.offeringId, recovered, now)
    await verifyReplayAudits(ports, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return recovered
  }
  const admitted = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admitted.kind === 'refused') {
    await failOperation(ports, operation.operationId, admitted.reason, now)
    return admitted
  }
  const expectedResult = {
    kind: 'registered' as const,
    bindingId: registration.bindingId,
    registrationHash: capabilityBindingRegistrationHash(registration, admitted.transport),
  }
  const result = await ports.registerBinding(registration, now)
  if (result.kind === 'refused') {
    await failOperation(ports, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(ports, bindingRegistrationAudit(
    command.actor, command.context, registration.offeringId, expectedResult, now,
  ))
  await succeedOperation(ports, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function setCapabilitySupplyEligibilityCommand(
  ports: OperationLedgerPorts,
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context) || !validEligibilityInput(command.eligibility)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(
    ports, command.actor, 'setCapabilitySupplyEligibility', command.context,
    command.eligibility as StableHashValue, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const desired = await recoverEligibilityReplayDesired(ports, operation, command)
    const expectedResult = eligibilityPublicResult(command.eligibility, desired)
    await verifyReplayAudits(ports, operation, eligibilityReplayAudits(command, desired, now))
    return replayOperationResult(operation, expectedResult)
  }
  const result = await ports.setEligibility(command.eligibility, now)
  if (result.kind === 'refused') {
    await failOperation(ports, operation.operationId, result.reason, now)
    return result
  }
  const desired = desiredEligibility(command.eligibility.decision, result.transition.offeringAfter)
  const expectedResult = eligibilityPublicResult(command.eligibility, desired)
  const offeringAuditId = await ensureSupplyAudit(ports, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: result.offeringId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      registrationHash: command.eligibility.expectedOfferingRegistrationHash,
      eligibilityHash: result.offeringEligibilityHash,
    },
    beforeState: result.transition.offeringBefore,
    afterState: result.transition.offeringAfter,
    createdAt: now,
  })
  const bindingAuditId = await ensureSupplyAudit(ports, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_binding',
    action: 'set_eligibility',
    targetRef: result.bindingId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      bindingId: result.bindingId,
      registrationHash: command.eligibility.expectedBindingRegistrationHash,
      eligibilityHash: result.bindingEligibilityHash,
    },
    beforeState: result.transition.bindingBefore,
    afterState: result.transition.bindingAfter,
    createdAt: now,
  })
  await succeedOperation(ports, operation.operationId, expectedResult, [offeringAuditId, bindingAuditId], now)
  return expectedResult
}

export async function quarantineCapabilityBindingCommand(
  ports: OperationLedgerPorts,
  command: QuarantineCommand,
  now: number,
) {
  if (
    !validCommandEnvelope(command.actor, command.context)
    || !boundedTrimmed(command.bindingId, MAX_CONTEXT_VALUE_LENGTH)
    || !isCanonicalDigest(command.expectedObservedRowDigest)
  ) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(ports, command.actor, 'quarantineCapabilityBinding', command.context, {
    bindingId: command.bindingId, expectedObservedRowDigest: command.expectedObservedRowDigest,
  }, now)
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') return await replayQuarantineBinding(ports, operation, command, now)
  const binding = await ports.loadBindingByBindingId(command.bindingId)
  if (binding === null) {
    if (operation.kind === 'ready') await failOperation(ports, operation.operationId, 'binding_not_found', now)
    return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  }
  if (bindingObservedRowDigest(binding) !== command.expectedObservedRowDigest) {
    await failOperation(ports, operation.operationId, 'observed_row_changed', now)
    return { kind: 'refused' as const, reason: 'observed_row_changed' as const }
  }
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: command.context.evidenceRefs,
    conformanceEvidenceRefs: command.context.evidenceRefs,
  })
  const parent = await trustedQuarantineParent(ports, binding)
  let parentAuditId: string | undefined
  let parentDisposition: QuarantineParentDisposition = { kind: 'unresolved' }
  if (parent !== null) {
    const siblings = await ports.listAdmittedConformantBindings(parent.offeringId, 2)
    const status = offeringStatusAfterBindingQuarantine(
      siblings.some((candidate) => candidate.bindingId !== binding.bindingId),
    )
    const parentEligibilityHash = capabilityOfferingEligibilityHash({
      offeringId: parent.offeringId, registrationHash: parent.registrationHash,
      status, admissionEvidenceRefs: command.context.evidenceRefs,
    })
    await ports.patchOfferingQuarantineParent(parent.offeringId, {
      status, admissionEvidenceRefs: [...command.context.evidenceRefs],
      eligibilityHash: parentEligibilityHash, updatedAt: now,
    })
    parentDisposition = quarantineParentUpdatedDisposition(parent, status, parentEligibilityHash)
    parentAuditId = await ensureSupplyAudit(ports, quarantineParentAudit(
      command, parent, parentDisposition, now,
    ))
  }
  await ports.patchBindingQuarantine(binding.bindingId, {
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: [...command.context.evidenceRefs],
    conformanceEvidenceRefs: [...command.context.evidenceRefs], eligibilityHash, updatedAt: now,
  })
  const result = { kind: 'quarantined' as const, bindingId: binding.bindingId, eligibilityHash }
  const auditId = await ensureSupplyAudit(ports, quarantineBindingAudit(
    command, binding, eligibilityHash, parentDisposition, now,
  ))
  await succeedOperation(ports, operation.operationId, result, [auditId, ...(parentAuditId === undefined ? [] : [parentAuditId])], now)
  return result
}
