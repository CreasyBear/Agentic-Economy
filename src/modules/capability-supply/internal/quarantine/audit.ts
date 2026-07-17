import { isCanonicalDigest } from '@/modules/common/canonical-digest'

import type { RegistrationContext, SupplyAuditInput, SupplyCommandActor } from '../shared'
import type { QuarantineParentDisposition } from './policy'

export function quarantineBindingAudit(
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  binding: Readonly<{
    bindingId: string
    admission: 'not_admitted' | 'admitted'
    conformance: 'not_conformant' | 'conformant'
  }>,
  eligibilityHash: string,
  parent: QuarantineParentDisposition,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_binding.quarantined',
    targetType: 'capability_binding',
    action: 'quarantine_binding',
    targetRef: binding.bindingId,
    actor: command.actor,
    context: command.context,
    payload: {
      bindingId: binding.bindingId,
      observedRowDigest: command.expectedObservedRowDigest,
      eligibilityHash,
      parent,
    },
    beforeState: `${binding.admission}:${binding.conformance}`,
    afterState: 'not_admitted:not_conformant',
    createdAt,
  }
}

export function quarantineParentAudit(
  command: Readonly<{ actor: SupplyCommandActor; context: RegistrationContext }>,
  offering: Readonly<{ offeringId: string; status: 'active' | 'inactive' }>,
  parent: Extract<QuarantineParentDisposition, { kind: 'updated' }>,
  createdAt: number,
): SupplyAuditInput {
  return {
    eventType: 'capability_supply.eligibility_changed',
    targetType: 'capability_offering',
    action: 'quarantine_binding',
    targetRef: offering.offeringId,
    actor: command.actor,
    context: command.context,
    payload: {
      offeringId: offering.offeringId,
      registrationHash: parent.registrationHash,
      eligibilityHash: parent.eligibilityHash,
    },
    beforeState: offering.status,
    afterState: parent.status,
    createdAt,
  }
}

export function validQuarantineAuditPayload(
  payload: unknown,
  command: Readonly<{ bindingId: string; expectedObservedRowDigest: string }>,
): payload is {
  bindingId: string
  observedRowDigest: string
  eligibilityHash: string
  parent: QuarantineParentDisposition
} {
  if (typeof payload !== 'object' || payload === null) return false
  const value = payload as Record<string, unknown>
  if (
    value.bindingId !== command.bindingId
    || value.observedRowDigest !== command.expectedObservedRowDigest
    || typeof value.eligibilityHash !== 'string'
    || !isCanonicalDigest(value.eligibilityHash)
    || typeof value.parent !== 'object'
    || value.parent === null
  ) return false
  const parent = value.parent as Record<string, unknown>
  return parent.kind === 'unresolved' || (
    parent.kind === 'updated'
    && typeof parent.offeringId === 'string'
    && (parent.status === 'active' || parent.status === 'inactive')
    && typeof parent.registrationHash === 'string'
    && typeof parent.eligibilityHash === 'string'
    && isCanonicalDigest(parent.eligibilityHash)
  )
}
