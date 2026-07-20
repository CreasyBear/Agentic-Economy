import { describe, expect, it, vi } from 'vitest'

import {
  createDevelopmentInvocationApplication,
  createDevelopmentPaidOperationApplicationService,
  createPaidOperationApplicationService,
  createDynamicPublishedActionInvocationAdapter,
  type ActionInvocationView,
  type PaidOperationPaymentAttemptSnapshot,
  type PaidOperationInterpreter,
} from '@/modules/action-invocation'
import type { ActionResult } from '@/modules/common/action'
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
    expect(authorized.value.semantics.paymentAuthorization).toEqual({ state: 'not_created' })
    expect(authorized.value.semantics.continuations).toEqual([
      expect.objectContaining({ kind: 'execute' }),
    ])
  })

  it('reconstructs an authorized zero-attempt prepared payment through declared support', () => {
    const view = authorizedZeroAttemptView()
    const payment = preparedPayment()
    const loadPreparedPaymentAttempt = vi.fn(() => payment)
    const loadPaymentAttempt = vi.fn(() => undefined)
    const service = createPaidOperationApplicationService({
      actor: view.owner,
      interpreter: paidOperationInterpreter(),
      reads: {
        loadInvocation: () => view,
        loadPreparedPaymentAttempt,
        loadPaymentAttempt,
      },
      commands: inertCommands(),
    })

    const reconstructed = service.inspect({
      invocationRef: view.invocationRef,
      expectedInvocationVersion: 2,
    })

    expect(reconstructed.kind).toBe('accepted')
    if (reconstructed.kind !== 'accepted') return
    expect(reconstructed.value.semantics).toMatchObject({
      paymentAuthorization: {
        state: 'created',
        paymentIdentifier: payment.paymentIdentifier,
      },
      paymentSubmission: { state: 'not_submitted' },
      settlement: { state: 'no_evidence' },
      resultDelivery: { state: 'not_delivered' },
    })
    expect(reconstructed.value.semantics.continuations.map(({ kind }) => kind))
      .toEqual(['execute'])
    expect(loadPreparedPaymentAttempt).toHaveBeenCalledOnce()
    expect(loadPreparedPaymentAttempt).toHaveBeenCalledWith({
      invocationRef: view.invocationRef,
    })
    expect(loadPaymentAttempt).not.toHaveBeenCalled()
  })

  it('does not read a prepared payment while version one is awaiting authority', () => {
    const view = awaitingAuthorityView()
    const loadPreparedPaymentAttempt = vi.fn(() => preparedPayment())
    const loadPaymentAttempt = vi.fn(() => undefined)
    const service = createPaidOperationApplicationService({
      actor: view.owner,
      interpreter: paidOperationInterpreter(),
      reads: {
        loadInvocation: () => view,
        loadPreparedPaymentAttempt,
        loadPaymentAttempt,
      },
      commands: inertCommands(),
    })

    const reconstructed = service.inspect({
      invocationRef: view.invocationRef,
      expectedInvocationVersion: 1,
    })

    expect(reconstructed.kind).toBe('accepted')
    if (reconstructed.kind !== 'accepted') return
    expect(reconstructed.value.semantics.paymentAuthorization).toEqual({ state: 'not_created' })
    expect(reconstructed.value.semantics.continuations.map(({ kind }) => kind))
      .toEqual(['authorize'])
    expect(loadPreparedPaymentAttempt).not.toHaveBeenCalled()
    expect(loadPaymentAttempt).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['non-prepared', {
      ...preparedPayment(),
      state: 'possibly_submitted' as const,
    }],
  ] satisfies readonly (readonly [string, PaidOperationPaymentAttemptSnapshot | undefined])[])(
    'fails closed when declared pre-attempt payment support returns %s state',
    (_case, payment) => {
      const view = authorizedZeroAttemptView()
      const service = createPaidOperationApplicationService({
        actor: view.owner,
        interpreter: paidOperationInterpreter(),
        reads: {
          loadInvocation: () => view,
          loadPreparedPaymentAttempt: () => payment,
          loadPaymentAttempt: () => undefined,
        },
        commands: inertCommands(),
      })

      expect(() => service.inspect({
        invocationRef: view.invocationRef,
        expectedInvocationVersion: 2,
      })).toThrow('paid_operation_pre_attempt_payment_invariant')
    },
  )

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
    const loadPaymentAttempt = vi.fn(() => ({
      paymentIdentifier: 'payment:reconcile',
      custodyRef: `sha256:${'b'.repeat(64)}`,
      state: 'reconciliation_required' as const,
      evidenceRefs: [],
    }))
    const service = createPaidOperationApplicationService({
      actor: view.owner,
      interpreter,
      reads: {
        loadInvocation: () => view,
        loadPaymentAttempt,
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
      .toEqual([])
    expect(loadPaymentAttempt).toHaveBeenCalledWith({
      invocationRef: view.invocationRef,
      attemptRef: evidenceMaterial.attemptRef,
      effectGeneration: 1,
    })
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

function authorizedZeroAttemptView(): ActionInvocationView<ActionResult> {
  return {
    invocationRef: 'invocation:prepared-payment',
    invocationVersion: 2,
    environment: 'MOCK/DEVELOPMENT ONLY',
    persistence: 'durable_control',
    origin: {
      kind: 'standalone',
      callerRef: 'agent:prepared-payment',
      principalRef: 'principal:prepared-payment',
    },
    owner: {
      callerRef: 'agent:prepared-payment',
      principalRef: 'principal:prepared-payment',
    },
    action: { id: 'paid-operation', contractVersion: '1' },
    desired: { state: 'invoke' },
    prepared: {
      materialInputDigest: `sha256:${'a'.repeat(64)}`,
      target: {
        providerId: 'provider:prepared-payment',
        sourceRef: 'source:prepared-payment',
        operationRevision: 'revision:1',
      },
      consequence: 'Release one paid query.',
      dataUse: { fields: ['symbol'], limits: {} },
      preparedAt: '2026-07-20T00:00:00.000Z',
      freshUntil: '2026-07-20T01:00:00.000Z',
    },
    authority: {
      reference: 'authority:prepared-payment',
      expiresAt: '2026-07-20T01:00:00.000Z',
    },
    acceptedAuthority: {
      kind: 'approve_each',
      authorityRef: 'authority:prepared-payment',
    },
    attempts: [],
    observedResolution: { state: 'pending' },
    freshness: { state: 'current', observedAt: '2026-07-20T00:00:00.000Z' },
    control: { state: 'authorized', decidedAt: '2026-07-20T00:01:00.000Z' },
  }
}

function awaitingAuthorityView(): ActionInvocationView<ActionResult> {
  const current = authorizedZeroAttemptView()
  const { acceptedAuthority: _acceptedAuthority, ...awaiting } = current
  return {
    ...awaiting,
    invocationVersion: 1,
    control: { state: 'awaiting_authority' },
  }
}

function preparedPayment(): PaidOperationPaymentAttemptSnapshot {
  return {
    paymentIdentifier: 'payment:prepared',
    custodyRef: `sha256:${'b'.repeat(64)}`,
    state: 'prepared',
    evidenceRefs: [],
  }
}

function paidOperationInterpreter(): PaidOperationInterpreter<ActionResult> {
  return {
    interpret: () => ({
      operation: {
        operationKey: 'prepared-payment',
        providerId: 'provider:prepared-payment',
        providerName: 'Prepared payment provider',
        operationRevision: 'revision:1',
        materialInputs: { symbol: 'BTC', convert: 'USD' },
      },
      presentation: {
        title: 'Run prepared paid operation',
        summary: 'One labelled local prepared payment fixture.',
        blocks: [],
      },
      maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
      queryRecipient: 'provider:prepared-payment',
      resultDelivery: { state: 'not_delivered' },
      environment: {
        name: 'local-labelled-fixture',
        evidenceClass: 'local_unit_fixture',
        claimCeiling: 'contract_mechanics_only',
      },
    }),
  }
}

function inertCommands() {
  return {
    authorize: () => undefined,
    execute: () => undefined,
    reconcile: () => undefined,
  }
}

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
