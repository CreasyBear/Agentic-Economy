import { describe, expect, it } from 'vitest'

import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import {
  bindingObservedRowDigest,
  offeringStatusAfterBindingQuarantine,
  quarantineBindingAudit,
  quarantineParentAudit,
  quarantineParentUpdatedDisposition,
  validQuarantineAuditPayload,
} from '@/modules/capability-supply/internal/quarantine'

const digest = `sha256:${'a'.repeat(64)}`
const binding = {
  _id: 'row-1',
  _creationTime: 10,
  bindingId: 'binding-1',
  offeringId: 'offering-1',
  networkId: 'network-1',
  capabilityId: 'cap.demo',
  version: 1,
  contractDigest: digest,
  endpointUrl: 'https://example.test',
  credentialRef: 'credential:demo',
  continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:continuation'] },
  cancellation: { kind: 'unsupported' as const, evidenceRefs: ['evidence:cancellation'] },
  adapterId: 'http-json:v1',
  configJson: '{}',
  configDigest: digest,
  registrationEvidenceRefs: ['evidence:binding'],
  registrationHash: digest,
  admission: 'admitted' as const,
  conformance: 'conformant' as const,
  admissionEvidenceRefs: ['evidence:admission'],
  conformanceEvidenceRefs: ['evidence:conformance'],
  eligibilityHash: digest,
  registeredAt: 1,
  updatedAt: 1,
} satisfies CapabilityBindingRow

const command = {
  actor: { kind: 'admin' as const, ref: 'admin-1' },
  bindingId: 'binding-1',
  expectedObservedRowDigest: digest,
  context: {
    operationKey: 'op-1',
    correlationId: 'corr-1',
    reasonCode: 'quarantine',
    evidenceRefs: ['evidence:1'],
  },
}

describe('capability-supply quarantine helpers', () => {
  it('decides parent status and builds parent disposition', () => {
    expect(offeringStatusAfterBindingQuarantine(true)).toBe('active')
    expect(offeringStatusAfterBindingQuarantine(false)).toBe('inactive')
    expect(quarantineParentUpdatedDisposition(
      { offeringId: 'offering-1', registrationHash: digest },
      'inactive',
      digest,
    )).toEqual({
      kind: 'updated',
      offeringId: 'offering-1',
      status: 'inactive',
      registrationHash: digest,
      eligibilityHash: digest,
    })
  })

  it('builds quarantine audits and validates payload shape', () => {
    const parent = quarantineParentUpdatedDisposition(
      { offeringId: 'offering-1', registrationHash: digest },
      'inactive',
      digest,
    )
    const bindingAudit = quarantineBindingAudit(command, binding, digest, parent, 50)
    expect(bindingAudit).toMatchObject({
      eventType: 'capability_binding.quarantined',
      beforeState: 'admitted:conformant',
      afterState: 'not_admitted:not_conformant',
    })
    expect(quarantineParentAudit(command, { offeringId: 'offering-1', status: 'active' }, parent, 50))
      .toMatchObject({
        eventType: 'capability_supply.eligibility_changed',
        action: 'quarantine_binding',
        beforeState: 'active',
        afterState: 'inactive',
      })
    expect(validQuarantineAuditPayload({
      bindingId: 'binding-1',
      observedRowDigest: digest,
      eligibilityHash: digest,
      parent,
    }, command)).toBe(true)
    expect(validQuarantineAuditPayload({
      bindingId: 'binding-other',
      observedRowDigest: digest,
      eligibilityHash: digest,
      parent: { kind: 'unresolved' },
    }, command)).toBe(false)
  })

  it('keeps observed-row digests stable for unchanged rows', () => {
    const left = bindingObservedRowDigest(binding)
    const right = bindingObservedRowDigest({ ...binding })
    expect(left).toBe(right)
    expect(bindingObservedRowDigest({ ...binding, updatedAt: 2 })).not.toBe(left)
  })
})
