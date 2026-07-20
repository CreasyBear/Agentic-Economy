import { describe, expect, it } from 'vitest'

import {
  createDevelopmentInvocationApplication,
  createDevelopmentPaidOperationApplicationService,
  createDynamicPublishedActionInvocationAdapter,
  type PaidOperationInterpreter,
} from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-dynamic-invocation-evidence'
import { createDevelopmentDynamicPublishedSource } from '@/modules/action-invocation'
import type { DynamicPublishedInvocationResult } from '@/modules/action-invocation'

describe('paid operation application service', () => {
  it('authorizes reads, fences versions, exposes semantic continuations, and projects one truth', async () => {
    const { service, host } = fixture()
    const prepared = host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)

    expect(service.inspect({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion + 1,
    })).toEqual({ kind: 'refused', code: 'stale_invocation_version' })

    const read = service.inspect({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
    })
    expect(read.kind).toBe('accepted')
    if (read.kind !== 'accepted') return
    expect(read.value.semantics.schema).toBe('agentic-paid-operation:v1')
    expect(read.value.semantics.continuations).toEqual([
      expect.objectContaining({
        kind: 'authorize',
        expectedInvocationVersion: prepared.invocationVersion,
      }),
    ])
    expect(read.value.human.semantics).toEqual(read.value.semantics)
    expect(read.value.agent.semantics).toEqual(read.value.semantics)
    expect(read.value.human.semanticDigest).toBe(read.value.agent.semanticDigest)

    await expect(service.command({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      command: { kind: 'execute' },
    })).resolves.toEqual({ kind: 'refused', code: 'continuation_not_allowed' })

    const authorized = await service.command({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      command: { kind: 'authorize', accept: true },
    })
    expect(authorized.kind).toBe('accepted')
    if (authorized.kind !== 'accepted') return
    expect(authorized.value.semantics.continuations).toEqual([
      expect.objectContaining({ kind: 'execute' }),
    ])
  })

  it('refuses a different principal and keeps operation interpretation injected', () => {
    const { host, interpreter, application } = fixture()
    const prepared = host.prepare({ symbol: 'BTC', convert: 'USD' }, 60_000)
    const other = createDevelopmentPaidOperationApplicationService({
      host: application.bindStandalone({
        actor: { callerRef: 'agent:other', principalRef: 'principal:other' },
      }),
      interpreter,
    })
    expect(other.inspect({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
    })).toEqual({ kind: 'refused', code: 'cross_principal_refused' })
  })
})

function fixture() {
  const adapter = adapterFixture()
  const actor = { callerRef: 'agent:paid-service', principalRef: 'principal:paid-service' }
  const application = createDevelopmentInvocationApplication({
    adapter,
    sourceCommands: {
      leaseOwner: () => 'worker:paid-service',
      reconciliationEvidence: () => undefined,
    },
  })
  const host = application.bindStandalone({ actor })
  const interpreter: PaidOperationInterpreter<DynamicPublishedInvocationResult> = {
    interpret: (view) => ({
      operation: {
        operationKey: 'development-paid-operation',
        providerId: 'provider:development',
        providerName: 'Development Provider',
        operationRevision: 'revision:1',
        materialInputs: { invocationRef: view.invocationRef },
      },
      presentation: {
        title: 'Run the development paid operation',
        summary: 'Execute one labelled local paid operation.',
        blocks: [{ kind: 'text', label: 'Environment', value: 'Local development' }],
      },
      maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
      queryRecipient: 'provider:development',
      resultDelivery: { state: 'not_delivered' },
      environment: {
        name: 'local-development',
        evidenceClass: 'labelled_local_mock',
        claimCeiling: 'mechanism_only_not_provider_fulfilment',
      },
    }),
  }
  return {
    host,
    application,
    interpreter,
    service: createDevelopmentPaidOperationApplicationService({ host, interpreter }),
  }
}

function adapterFixture() {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  return createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source: createDevelopmentDynamicPublishedSource([fixture.operation]),
    runtime: {
      send: async () => ({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ ok: true }),
      }),
      resolveCredential: () => undefined,
      x402PaymentSigningAvailable: () => false,
      createX402PaymentSignature: async () => undefined,
    },
    now: () => fixture.operation.readiness.observedAt + 1_000,
    nextInvocationRef: () => `invocation:paid-service:${Math.random()}`,
    nextAuthorityRef: () => `authority:paid-service:${Math.random()}`,
    nextAttemptRef: () => `attempt:paid-service:${Math.random()}`,
  })
}
