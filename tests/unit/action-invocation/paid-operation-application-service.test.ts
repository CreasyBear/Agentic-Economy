import { describe, expect, it } from 'vitest'

import {
  createDevelopmentInvocationApplication,
  createDevelopmentPaidOperationApplicationService,
  createPaidOperationApplicationService,
  createDynamicPublishedActionInvocationAdapter,
  type PaidOperationInterpreter,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
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

  it('accepts and forwards the exact advertised bounded reconciliation evidence', async () => {
    const { interpreter } = fixture()
    const evidenceMaterial = {
      kind: 'action_invocation_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'evidence:provider-readback',
      source: 'provider:development',
      invocationRef: 'invocation:reconcile',
      attemptRef: 'attempt:reconcile',
      effectGeneration: 1,
      resolution: 'released' as const,
      observedAt: '2026-07-20T00:00:00.000Z',
    }
    const reconciliationEvidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial),
    }
    const paymentMaterial = {
      kind: 'x402_payment_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'evidence:x402-readback',
      evidenceRefs: ['provider-receipt:x402-readback'],
      source: 'x402:https://provider.example/paid',
      paymentIdentifier: 'payment:reconcile',
      challengeDigest: 'sha256:challenge',
      providerEndpoint: 'https://provider.example/paid',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xasset',
      payTo: '0xrecipient',
      amount: '10000',
      invocationRef: evidenceMaterial.invocationRef,
      attemptRef: evidenceMaterial.attemptRef,
      effectGeneration: 1,
      resolution: 'not_settled' as const,
      observedAt: evidenceMaterial.observedAt,
    }
    const paymentReconciliationEvidence = {
      ...paymentMaterial,
      digest: canonicalDigest(paymentMaterial),
    }
    const view = {
      invocationRef: evidenceMaterial.invocationRef,
      invocationVersion: 3,
      owner: { callerRef: 'agent:paid-service', principalRef: 'principal:paid-service' },
      attempts: [{
        attemptRef: evidenceMaterial.attemptRef,
        effectGeneration: 1,
        release: { state: 'possibly_released' },
        outcome: { state: 'uncertain' },
      }],
      control: {
        state: 'reconciliation_required',
        attemptRef: evidenceMaterial.attemptRef,
        effectGeneration: 1,
      },
      observedResolution: { state: 'threw', message: 'provider_outcome_unknown' },
    } as any
    let received: unknown
    const service = createPaidOperationApplicationService({
      actor: view.owner,
      interpreter,
      reads: {
        loadInvocation: () => view,
        loadPaymentAttempt: () => ({
          paymentIdentifier: 'payment:reconcile',
          custodyRef: `sha256:${'b'.repeat(64)}`,
          state: 'reconciliation_required',
          evidenceRefs: [],
        }),
      },
      commands: {
        authorize: () => undefined,
        execute: () => undefined,
        reconcile: (input) => {
          received = input
          return { ...view, invocationVersion: 4 }
        },
      },
    })
    const current = service.inspect({
      invocationRef: view.invocationRef,
      expectedInvocationVersion: 3,
    })
    expect(current.kind === 'accepted'
      && current.value.semantics.continuations[0]?.requiredInput)
      .toEqual(['reconciliationEvidence', 'paymentReconciliationEvidence'])
    await service.command({
      invocationRef: view.invocationRef,
      expectedInvocationVersion: 3,
      command: {
        kind: 'reconcile',
        reconciliationEvidence,
        paymentReconciliationEvidence,
      },
    })
    expect(received).toEqual({
      reconciliationEvidence,
      paymentReconciliationEvidence,
      invocationRef: view.invocationRef,
      expectedInvocationVersion: 3,
    })
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
    },
    now: () => fixture.operation.readiness.observedAt + 1_000,
    nextInvocationRef: () => `invocation:paid-service:${Math.random()}`,
    nextAuthorityRef: () => `authority:paid-service:${Math.random()}`,
    nextAttemptRef: () => `attempt:paid-service:${Math.random()}`,
  })
}
