import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  beginOperation,
  ensureSupplyAudit,
  failOperation,
  isTrustedQuarantineParent,
  registerCapabilityOfferingCommand,
  replayOperationResult,
  setCapabilitySupplyEligibilityCommand,
  succeedOperation,
  type OperationLedgerPorts,
  type OperationKeyRecord,
} from '@/modules/capability-supply/internal/operation-ledger'
import type { CapabilityBindingRow } from '@/modules/capability-supply/internal/binding'
import type { CapabilityOfferingRow } from '@/modules/capability-supply/internal/offering'
import {
  storedSupplyAuditEffectRef,
  supplyAuditEffectRef,
  type SupplyAuditEventRow,
} from '@/modules/capability-supply/internal/shared'

const digest = `sha256:${'a'.repeat(64)}`
const actor = { kind: 'admin' as const, ref: 'admin-1' }
const context = {
  operationKey: 'op-1',
  correlationId: 'corr-1',
  reasonCode: 'register',
  evidenceRefs: ['evidence:1'],
}

function emptyPorts(overrides: Partial<OperationLedgerPorts> = {}): OperationLedgerPorts {
  return {
    findOperationKey: async () => null,
    insertOperationKey: async () => 'op-row-1',
    markOperationInProgress: async () => {},
    markOperationFailed: async () => {},
    markOperationSucceeded: async () => {},
    findAuditByEventId: async () => null,
    insertAudit: async () => {},
    registerOffering: async () => ({
      kind: 'registered', offeringId: 'offering-1', registrationHash: digest, created: true,
    }),
    registerBinding: async () => ({
      kind: 'registered', bindingId: 'binding-1', registrationHash: digest, created: true,
    }),
    setEligibility: async () => ({
      kind: 'eligible',
      offeringId: 'offering-1',
      bindingId: 'binding-1',
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'inactive',
        offeringAfter: 'active',
        bindingBefore: 'not_admitted:not_conformant',
        bindingAfter: 'admitted:conformant',
      },
    }),
    loadOfferingByOfferingId: async () => null,
    loadBindingByBindingId: async () => null,
    listAdmittedConformantBindings: async () => [],
    patchOfferingQuarantineParent: async () => {},
    patchBindingQuarantine: async () => {},
    ...overrides,
  }
}

describe('capability-supply operation-ledger', () => {
  it('beginOperation conflicts on in-progress or request-hash mismatch', async () => {
    const existing: OperationKeyRecord = {
      operationId: 'op-row-1',
      requestHash: digest,
      status: 'in_progress',
      effectRefs: [],
    }
    const conflict = await beginOperation(
      emptyPorts({ findOperationKey: async () => existing }),
      actor, 'registerCapabilityOffering', context, { registration: { offeringId: 'x' } }, 10,
    )
    expect(conflict).toEqual({ kind: 'conflict' })

    const mismatch = await beginOperation(
      emptyPorts({
        findOperationKey: async () => ({
          ...existing, status: 'succeeded', resultHash: digest, requestHash: `sha256:${'b'.repeat(64)}`,
        }),
      }),
      actor, 'registerCapabilityOffering', context, { registration: { offeringId: 'x' } }, 10,
    )
    expect(mismatch).toEqual({ kind: 'conflict' })
  })

  it('beginOperation replays succeeded keys and reopens failed_terminal', async () => {
    const requestMaterial = { registration: { offeringId: 'offering-1' } }
    const requestHash = canonicalDigest({
      requestMaterial,
      correlationId: context.correlationId,
      reasonCode: context.reasonCode,
      evidenceRefs: context.evidenceRefs,
    })
    const replay = await beginOperation(
      emptyPorts({
        findOperationKey: async () => ({
          operationId: 'op-row-1',
          requestHash,
          status: 'succeeded',
          resultHash: digest,
          effectRefs: ['effect:1'],
        }),
      }),
      actor, 'registerCapabilityOffering', context, requestMaterial, 10,
    )
    expect(replay).toEqual({
      kind: 'replay', operationId: 'op-row-1', resultHash: digest, effectRefs: ['effect:1'],
    })

    const marked: string[] = []
    const reopened = await beginOperation(
      emptyPorts({
        findOperationKey: async () => ({
          operationId: 'op-row-1',
          requestHash,
          status: 'failed_terminal',
          effectRefs: [],
        }),
        markOperationInProgress: async (operationId) => { marked.push(operationId) },
      }),
      actor, 'registerCapabilityOffering', context, requestMaterial, 10,
    )
    expect(reopened).toEqual({ kind: 'ready', operationId: 'op-row-1' })
    expect(marked).toEqual(['op-row-1'])
  })

  it('replayOperationResult matches digest and throws on mismatch', () => {
    const expected = { kind: 'registered' as const, offeringId: 'offering-1', registrationHash: digest }
    expect(replayOperationResult({ resultHash: canonicalDigest(expected) }, expected)).toEqual(expected)
    expect(() => replayOperationResult({ resultHash: digest }, expected)).toThrow(
      'capability_supply_operation_integrity_failure',
    )
  })

  it('fresh offering command succeeds with audit effectRefs', async () => {
    const effectRefs: string[][] = []
    const audits: unknown[] = []
    const registration = {
      offeringId: 'offering:sandbox-one:lookup',
      businessId: 'businesses:sandbox-one',
      networkId: 'ae:public',
      contractRef: { capabilityId: 'reference.lookup', version: 1, contractDigest: digest },
      presentation: {
        label: 'Sandbox reference lookup',
        summary: 'A labelled sandbox capability used only for source verification.',
        price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
        materialTerms: [{ termId: 'sandbox', label: 'Environment', value: 'Sandbox only' }],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'No payment, sponsorship, rebate, or ownership relationship.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['seed:sandbox-commercial-neutrality'],
        },
      },
      searchTerms: ['reference', 'lookup'],
      registrationEvidenceRefs: ['seed:sandbox-labelled-business'],
    }
    const result = await registerCapabilityOfferingCommand(
      emptyPorts({
        insertAudit: async (row) => { audits.push(row) },
        markOperationSucceeded: async (_id, _hash, refs) => { effectRefs.push([...refs]) },
      }),
      { actor, registration, context },
      50,
    )
    expect(result).toMatchObject({ kind: 'registered', offeringId: registration.offeringId })
    expect(audits).toHaveLength(1)
    expect(effectRefs).toHaveLength(1)
    expect(effectRefs[0]).toHaveLength(1)
    expect(effectRefs[0]![0]).toContain('audit:capability_supply:')
  })

  it('eligibility dual-audit succeed path records two effectRefs', async () => {
    const effectRefs: string[][] = []
    const eligibility = {
      offeringId: 'offering-1',
      bindingId: 'binding-1',
      contractRef: { capabilityId: 'cap.demo', version: 1, contractDigest: digest },
      decision: 'admit' as const,
      expectedOfferingRegistrationHash: digest,
      expectedBindingRegistrationHash: digest,
      admissionEvidenceRefs: ['evidence:admission'],
      conformanceEvidenceRefs: ['evidence:conformance'],
    }
    const result = await setCapabilitySupplyEligibilityCommand(
      emptyPorts({
        markOperationSucceeded: async (_id, _hash, refs) => { effectRefs.push([...refs]) },
      }),
      { actor, eligibility, context: { ...context, reasonCode: 'admit' } },
      50,
    )
    expect(result.kind).toBe('eligible')
    expect(effectRefs).toEqual([expect.arrayContaining([
      expect.stringContaining('audit:capability_supply:'),
      expect.stringContaining('audit:capability_supply:'),
    ])])
    expect(effectRefs[0]).toHaveLength(2)
  })

  it('ensureSupplyAudit reuses matching stored audit and fails on mismatch', async () => {
    const input = {
      eventType: 'capability_offering.registered' as const,
      action: 'register_offering' as const,
      targetType: 'capability_offering' as const,
      targetRef: 'offering-1',
      actor,
      context,
      payload: { offeringId: 'offering-1', registrationHash: digest },
      beforeState: 'absent',
      afterState: 'inactive',
      createdAt: 10,
    }
    const matching: SupplyAuditEventRow = {
      eventId: 'audit:match',
      eventType: input.eventType,
      actorKind: actor.kind,
      actorRef: actor.ref,
      targetType: input.targetType,
      targetRef: input.targetRef,
      beforeState: input.beforeState,
      afterState: input.afterState,
      idempotencyKey: context.operationKey,
      correlationId: context.correlationId,
      reasonCode: context.reasonCode,
      evidenceRefs: context.evidenceRefs,
      redactedPayloadJson: JSON.stringify(input.payload),
      payloadHash: canonicalDigest(input.payload),
      createdAt: 10,
    }
    // Build a real matching row via insert path first
    let stored: SupplyAuditEventRow | null = null
    const ports = emptyPorts({
      findAuditByEventId: async () => stored,
      insertAudit: async (row) => {
        stored = {
          eventId: row.eventId,
          eventType: row.eventType,
          actorKind: row.actorKind,
          actorRef: row.actorRef,
          targetType: row.targetType,
          targetRef: row.targetRef,
          beforeState: row.beforeState,
          afterState: row.afterState,
          idempotencyKey: row.idempotencyKey,
          correlationId: row.correlationId,
          reasonCode: row.reasonCode,
          evidenceRefs: row.evidenceRefs,
          redactedPayloadJson: row.redactedPayloadJson,
          payloadHash: row.payloadHash,
          createdAt: row.createdAt,
        }
      },
    })
    const first = await ensureSupplyAudit(ports, input)
    expect(first).toBe(supplyAuditEffectRef(input))
    const second = await ensureSupplyAudit(ports, input)
    expect(second).toBe(storedSupplyAuditEffectRef(stored!))

    await expect(ensureSupplyAudit(
      emptyPorts({
        findAuditByEventId: async () => ({ ...matching, afterState: 'active' }),
      }),
      input,
    )).rejects.toThrow('capability_supply_audit_integrity_failure')
  })

  it('failOperation and succeedOperation mark terminal states', async () => {
    const failed: Array<{ id: string; hash: string }> = []
    const succeeded: Array<{ id: string; hash: string; refs: readonly string[] }> = []
    const ports = emptyPorts({
      markOperationFailed: async (operationId, resultHash) => {
        failed.push({ id: operationId, hash: resultHash })
      },
      markOperationSucceeded: async (operationId, resultHash, effectRefs) => {
        succeeded.push({ id: operationId, hash: resultHash, refs: effectRefs })
      },
    })
    await failOperation(ports, 'op-1', 'binding_not_found', 10)
    await succeedOperation(ports, 'op-2', { kind: 'registered', offeringId: 'o', registrationHash: digest }, ['e1'], 10)
    expect(failed).toEqual([{ id: 'op-1', hash: canonicalDigest({ reason: 'binding_not_found' }) }])
    expect(succeeded[0]?.id).toBe('op-2')
    expect(succeeded[0]?.refs).toEqual(['e1'])
  })

  it('isTrustedQuarantineParent requires integrity, network, and contract match', () => {
    const offering = {
      offeringId: 'offering-1',
      businessId: 'biz-1',
      networkId: 'network-1',
      capabilityId: 'cap.demo',
      version: 1,
      contractDigest: digest,
      presentation: {
        label: 'Demo',
        summary: 'Demo',
        price: { kind: 'on_request' as const },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'none',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [],
        },
      },
      searchTerms: [],
      registrationEvidenceRefs: [],
      registrationHash: digest,
      status: 'active' as const,
      admissionEvidenceRefs: [],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    } satisfies CapabilityOfferingRow
    const binding = {
      _id: 'row-1',
      _creationTime: 1,
      bindingId: 'binding-1',
      offeringId: 'offering-1',
      networkId: 'network-1',
      capabilityId: 'cap.demo',
      version: 1,
      contractDigest: digest,
      endpointUrl: 'https://example.test',
      credentialRef: 'credential:demo',
      continuation: { kind: 'single_response' as const, evidenceRefs: [] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: [] },
      adapterId: 'http-json:v1',
      configJson: '{}',
      configDigest: digest,
      registrationEvidenceRefs: [],
      registrationHash: digest,
      admission: 'admitted' as const,
      conformance: 'conformant' as const,
      admissionEvidenceRefs: [],
      conformanceEvidenceRefs: [],
      eligibilityHash: digest,
      registeredAt: 1,
      updatedAt: 1,
    } satisfies CapabilityBindingRow
    // Integrity fails when registrationHash does not match reconstructed registration.
    expect(isTrustedQuarantineParent(
      { ...offering, registrationHash: `sha256:${'c'.repeat(64)}` },
      binding,
    )).toBe(false)
    expect(isTrustedQuarantineParent(offering, { ...binding, networkId: 'other' })).toBe(false)
  })
})
