import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type {
  CapabilityOfferingRegistration,
  CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'

import { bindingIntegrityIsValid, type CapabilityBindingRow } from '../binding'
import {
  desiredEligibility,
  type DesiredEligibility,
  type EligibilityInput,
} from '../eligibility'
import { offeringIntegrityIsValid } from '../offering'
import { validQuarantineAuditPayload } from '../quarantine'
import {
  storedAuditMatches,
  storedSupplyAuditEffectRef,
  supplyAuditEffectRef,
  supplyAuditEventId,
  type RegistrationContext,
  type SupplyAuditInput,
  type SupplyCommandActor,
} from '../shared'
import { isTrustedQuarantineParent, replayOperationResult } from './policy'
import type { OperationLedgerPorts, QuarantineCommand, ReplayExpectation } from './types'

export async function recoverBindingReplay(
  ports: OperationLedgerPorts,
  registration: CapabilityTransportBindingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const binding = await ports.loadBindingByBindingId(registration.bindingId)
  if (binding === null || !bindingIntegrityIsValid(binding)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    bindingId: binding.bindingId,
    registrationHash: binding.registrationHash,
  })
}

export async function recoverOfferingReplay(
  ports: OperationLedgerPorts,
  registration: CapabilityOfferingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const offering = await ports.loadOfferingByOfferingId(registration.offeringId)
  if (offering === null || !offeringIntegrityIsValid(offering)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    offeringId: offering.offeringId,
    registrationHash: offering.registrationHash,
  })
}

export async function trustedQuarantineParent(
  ports: OperationLedgerPorts,
  binding: CapabilityBindingRow,
) {
  const offering = await ports.loadOfferingByOfferingId(binding.offeringId)
  if (offering === null || !isTrustedQuarantineParent(offering, binding)) return null
  return offering
}

export async function replayQuarantineBinding(
  ports: OperationLedgerPorts,
  replay: Readonly<{ resultHash: string | undefined; effectRefs: readonly string[] }>,
  command: QuarantineCommand,
  now: number,
) {
  const eventId = supplyAuditEventId({
    eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
    action: 'quarantine_binding',
    targetRef: command.bindingId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const stored = await ports.findAuditByEventId(eventId)
  if (stored === null) throw new Error('capability_supply_operation_integrity_failure')
  let payload: unknown
  try {
    payload = JSON.parse(stored.redactedPayloadJson ?? '')
  } catch {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (!validQuarantineAuditPayload(payload, command)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  const result = {
    kind: 'quarantined' as const,
    bindingId: command.bindingId,
    eligibilityHash: payload.eligibilityHash,
  }
  const expectations: Array<ReplayExpectation> = [{
    audit: {
      eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
      action: 'quarantine_binding',
      targetRef: command.bindingId, actor: command.actor, context: command.context,
      payload: {
        bindingId: payload.bindingId,
        observedRowDigest: payload.observedRowDigest,
        eligibilityHash: payload.eligibilityHash,
        parent: payload.parent,
      }, beforeState: '',
      afterState: 'not_admitted:not_conformant', createdAt: now,
    },
    allowedBeforeStates: [
      'admitted:conformant', 'admitted:not_conformant', 'not_admitted:conformant', 'not_admitted:not_conformant',
    ],
  }]
  if (payload.parent.kind === 'updated') {
    expectations.push({
      audit: {
        eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
        action: 'quarantine_binding',
        targetRef: payload.parent.offeringId, actor: command.actor, context: command.context,
        payload: {
          offeringId: payload.parent.offeringId, registrationHash: payload.parent.registrationHash,
          eligibilityHash: payload.parent.eligibilityHash,
        },
        beforeState: '', afterState: payload.parent.status, createdAt: now,
      },
      allowedBeforeStates: ['active', 'inactive'],
    })
  }
  await verifyReplayAudits(ports, replay, expectations)
  return replayOperationResult(replay, result)
}

export async function recoverEligibilityReplayDesired(
  ports: OperationLedgerPorts,
  replay: Readonly<{ effectRefs: readonly string[] }>,
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
): Promise<DesiredEligibility> {
  if (replay.effectRefs.length !== 2) throw new Error('capability_supply_operation_integrity_failure')
  const eventId = supplyAuditEventId({
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: command.eligibility.offeringId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const audit = await ports.findAuditByEventId(eventId)
  if (audit === null || (audit.afterState !== 'active' && audit.afterState !== 'inactive')) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (command.eligibility.decision === 'admit' && audit.afterState !== 'active') {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return desiredEligibility(command.eligibility.decision, audit.afterState)
}

export async function verifyReplayAudits(
  ports: OperationLedgerPorts,
  replay: Readonly<{ effectRefs: readonly string[] }>,
  expectations: readonly ReplayExpectation[],
): Promise<void> {
  if (replay.effectRefs.length !== expectations.length) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  for (const [index, expectation] of expectations.entries()) {
    const eventId = supplyAuditEventId(expectation.audit)
    const existing = await ports.findAuditByEventId(eventId)
    if (
      existing === null
      || replay.effectRefs[index] !== storedSupplyAuditEffectRef(existing)
      || !storedAuditMatches(existing, expectation.audit, expectation.allowedBeforeStates)
    ) {
      throw new Error('capability_supply_operation_integrity_failure')
    }
  }
}

export async function ensureSupplyAudit(
  ports: OperationLedgerPorts,
  input: SupplyAuditInput,
): Promise<string> {
  const eventId = supplyAuditEventId(input)
  const redactedPayloadJson = stableStringify(input.payload)
  const payloadHash = canonicalDigest(input.payload)
  const existing = await ports.findAuditByEventId(eventId)
  if (existing !== null) {
    if (!storedAuditMatches(existing, input, [input.beforeState])) {
      throw new Error('capability_supply_audit_integrity_failure')
    }
    return storedSupplyAuditEffectRef(existing)
  }
  await ports.insertAudit({
    eventId, eventType: input.eventType, actorKind: input.actor.kind, actorRef: input.actor.ref,
    targetType: input.targetType, targetRef: input.targetRef,
    beforeState: input.beforeState, afterState: input.afterState,
    idempotencyKey: input.context.operationKey, correlationId: input.context.correlationId,
    reasonCode: input.context.reasonCode, evidenceRefs: [...input.context.evidenceRefs],
    redactedPayloadJson, payloadHash, createdAt: input.createdAt,
  })
  return supplyAuditEffectRef(input)
}
