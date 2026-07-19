import { describe, expect, it } from 'vitest'

import type { ActionInvocationView } from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import {
  comparePublishedOperationHostSemantics,
  observeEmbeddedPublishedOperation,
  observeExternalPublishedOperation,
} from '@/modules/capability-supply/published-operation-hosts'

function persistedInvocation(
  overrides: Partial<ActionInvocationView> = {},
): ActionInvocationView {
  const packet = buildDevelopmentPublishedOperationEvidence()
  return {
    invocationRef: 'mock:invocation:one',
    invocationVersion: 4,
    environment: 'MOCK/DEVELOPMENT ONLY',
    persistence: 'durable_control',
    origin: { kind: 'standalone', callerRef: 'mock:agent', principalRef: 'mock:principal' },
    owner: { callerRef: 'mock:agent', principalRef: 'mock:principal' },
    action: { id: packet.descriptor.id, contractVersion: packet.descriptor.version },
    desired: { state: 'invoke' },
    prepared: {
      materialInputDigest: 'sha256:input',
      target: { materialDigest: packet.operation.materialDigest },
      consequence: 'query_and_payment',
      dataUse: { fields: ['/symbol', '/convert'], limits: {} },
      preparedAt: '2026-07-19T08:00:00.000Z',
      freshUntil: '2026-07-19T08:05:00.000Z',
    },
    authority: { reference: 'mock:authority', expiresAt: '2026-07-19T08:05:00.000Z' },
    attempts: [{
      attemptRef: 'mock:attempt',
      attemptNumber: 1,
      actor: { callerRef: 'mock:agent', principalRef: 'mock:principal' },
      effectGeneration: 3,
      lease: { owner: 'mock:worker', expiresAt: '2026-07-19T08:01:00.000Z' },
      idempotency: {
        operationKey: 'mock:key',
        materialInputDigest: 'sha256:input',
        effectIdentity: 'mock:effect',
      },
      release: { state: 'possibly_released' },
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        message: 'mock lost response',
        reconciliationRequiredAt: '2026-07-19T08:00:01.000Z',
      },
    }],
    observedResolution: { state: 'pending' },
    freshness: { state: 'current', observedAt: '2026-07-19T08:00:00.000Z' },
    control: { state: 'reconciliation_required', attemptRef: 'mock:attempt' },
    ...overrides,
  }
}

function command(invocation = persistedInvocation()) {
  const packet = buildDevelopmentPublishedOperationEvidence()
  return {
    operation: packet.operation,
    descriptor: packet.descriptor,
    invocation,
    input: { symbol: 'BTC', convert: 'USD' },
  }
}

describe('published operation host observations', () => {
  it('compares independent adapters reading the exact same persisted invocation', () => {
    const base = command()
    const embedded = observeEmbeddedPublishedOperation({
      ...base,
      provenance: { adapterId: 'embedded_human', observationRef: 'embedded:read:1' },
    })
    const external = observeExternalPublishedOperation({
      ...base,
      provenance: { adapterId: 'external_agent', observationRef: 'external:read:1' },
    })
    expect(comparePublishedOperationHostSemantics(embedded, external)).toEqual({ kind: 'pass' })
    expect(embedded).toMatchObject({
      invocationRef: 'mock:invocation:one',
      invocationVersion: 4,
      owner: 'mock:agent',
      principal: 'mock:principal',
      actingActor: 'mock:agent',
      delegation: 'none',
      effectGeneration: 3,
    })
  })

  it.each([
    ['invocationRef', { invocationRef: 'mock:invocation:other' }],
    ['invocationVersion', { invocationVersion: 5 }],
    ['owner', { owner: { callerRef: 'other', principalRef: 'mock:principal' } }],
    ['origin', { origin: { kind: 'standalone', callerRef: 'other', principalRef: 'mock:principal' } }],
  ])('fails parity when persisted %s differs', (_field, override) => {
    const left = observeEmbeddedPublishedOperation({
      ...command(),
      provenance: { adapterId: 'embedded_human', observationRef: 'embedded:read:1' },
    })
    const right = observeExternalPublishedOperation({
      ...command(persistedInvocation(override as Partial<ActionInvocationView>)),
      provenance: { adapterId: 'external_agent', observationRef: 'external:read:1' },
    })
    expect(comparePublishedOperationHostSemantics(left, right).kind).toBe('fail')
  })

  it('refuses persisted principal mismatch before comparison', () => {
    const invalid = persistedInvocation({
      owner: { callerRef: 'mock:agent', principalRef: 'other' },
    })
    expect(() => observeExternalPublishedOperation({
      ...command(invalid),
      provenance: { adapterId: 'external_agent', observationRef: 'external:principal-mismatch' },
    })).toThrow('published_operation_persisted_attribution_invalid')
  })

  it('rejects reused provenance and inconsistent persisted attempt attribution', () => {
    const base = command()
    const embedded = observeEmbeddedPublishedOperation({
      ...base,
      provenance: { adapterId: 'embedded_human', observationRef: 'same-read' },
    })
    const external = observeExternalPublishedOperation({
      ...base,
      provenance: { adapterId: 'external_agent', observationRef: 'same-read' },
    })
    expect(comparePublishedOperationHostSemantics(embedded, external)).toEqual({
      kind: 'fail',
      fields: ['provenance'],
    })

    const invalid = persistedInvocation({
      attempts: [{
        ...persistedInvocation().attempts[0]!,
        actor: { callerRef: 'attacker', principalRef: 'other-principal' },
      }],
    })
    expect(() => observeExternalPublishedOperation({
      ...command(invalid),
      provenance: { adapterId: 'external_agent', observationRef: 'external:bad' },
    })).toThrow('published_operation_persisted_attribution_invalid')
  })
})
