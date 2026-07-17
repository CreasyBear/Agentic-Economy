import { describe, expect, it } from 'vitest'

import {
  capabilityBindingRegistrationHash,
  defineCapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import {
  bindingIntegrityIsValid,
  bindingRegistrationAudit,
  bindingRegistrationFromRow,
  transportAdmissionInput,
  type CapabilityBindingRow,
} from '@/modules/capability-supply/internal/binding'

const contractRef = {
  capabilityId: 'reference.lookup',
  version: 1,
  contractDigest: `sha256:${'1'.repeat(64)}`,
}
const registration = defineCapabilityTransportBindingRegistration({
  bindingId: 'binding:sandbox-one:http',
  offeringId: 'offering:sandbox-one:lookup',
  networkId: 'ae:public',
  contractRef,
  endpointUrl: 'https://example.test/api/capability',
  credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
  continuation: { kind: 'single_response', evidenceRefs: ['seed:http-response'] },
  cancellation: { kind: 'unsupported', evidenceRefs: ['seed:no-cancellation'] },
  adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
  registrationEvidenceRefs: ['seed:production-protocol-contract-test'],
})
const admitted = {
  configJson: '{"method":"POST","requestTimeoutMs":5000}',
  configDigest: `sha256:${'2'.repeat(64)}`,
}

function validRow(overrides: Partial<CapabilityBindingRow> = {}): CapabilityBindingRow {
  return {
    _id: 'row-1',
    _creationTime: 10,
    bindingId: registration.bindingId,
    offeringId: registration.offeringId,
    networkId: registration.networkId,
    capabilityId: registration.contractRef.capabilityId,
    version: registration.contractRef.version,
    contractDigest: registration.contractRef.contractDigest,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: registration.continuation,
    cancellation: registration.cancellation,
    adapterId: registration.adapter.adapterId,
    configJson: admitted.configJson,
    configDigest: admitted.configDigest,
    registrationEvidenceRefs: registration.registrationEvidenceRefs,
    registrationHash: capabilityBindingRegistrationHash(registration, admitted),
    admission: 'not_admitted',
    conformance: 'not_conformant',
    admissionEvidenceRefs: [],
    conformanceEvidenceRefs: [],
    eligibilityHash: `sha256:${'3'.repeat(64)}`,
    registeredAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('capability-supply binding helpers', () => {
  it('reconstructs registration and validates integrity fail-closed', () => {
    const row = validRow()
    expect(bindingRegistrationFromRow(row).adapter.config).toBeNull()
    expect(bindingIntegrityIsValid(row)).toBe(true)
    expect(bindingIntegrityIsValid(validRow({
      registrationHash: `sha256:${'4'.repeat(64)}`,
    }))).toBe(false)
  })

  it('builds transport admission input and registration audit', () => {
    expect(transportAdmissionInput(registration)).toEqual({
      adapterId: registration.adapter.adapterId,
      endpointUrl: registration.endpointUrl,
      credentialRef: registration.credentialRef,
      continuation: registration.continuation,
      cancellation: registration.cancellation,
      config: registration.adapter.config,
    })
    expect(bindingRegistrationAudit(
      { kind: 'admin', ref: 'admin-1' },
      {
        operationKey: 'op-1',
        correlationId: 'corr-1',
        reasonCode: 'register',
        evidenceRefs: ['evidence:1'],
      },
      'offering:sandbox-one:lookup',
      { bindingId: registration.bindingId, registrationHash: admitted.configDigest },
      99,
    )).toMatchObject({
      eventType: 'capability_binding.registered',
      action: 'register_binding',
      targetRef: registration.bindingId,
      beforeState: 'absent',
      afterState: 'not_admitted',
      createdAt: 99,
    })
  })
})
