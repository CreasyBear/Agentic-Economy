import { describe, expect, it } from 'vitest'

import { createInMemoryKernelStore, createNeutralRoutingKernel, type CapabilityBindingAdapter, type KernelStore } from '@/modules/routing-kernel/public'

describe('provider cancellation operation', () => {
  it('durably records an accepted cancellation request without rewriting the committed effect', async () => {
    let cancellationCalls = 0
    const { kernel, caller, rootRunId, store } = await completedRun({
      feature: 'supported',
      requestCancellation: async () => { cancellationCalls += 1; return { kind: 'cancellation_accepted', providerReference: 'cancel:req-1' } },
    })

    const first = await kernel.operations.cancel({ caller, rootRunId })
    const replay = await kernel.operations.cancel({ caller, rootRunId })

    expect(cancellationCalls).toBe(1)
    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      kind: 'provider_cancellation_recorded', rootRunId, disposition: 'accepted', providerReference: 'cancel:req-1',
      run: { state: 'completed', effectState: 'committed' },
    })
    const inspected = await kernel.operations.inspect({ caller, rootRunId })
    expect(inspected).toMatchObject({ kind: 'run_found', run: { records: expect.arrayContaining([
      expect.objectContaining({ type: 'provider_cancellation_requested' }),
      expect.objectContaining({ type: 'provider_cancellation_accepted', providerReference: 'cancel:req-1' }),
    ]) } })
  })

  it('fails closed for legacy bindings without cancellation feature evidence', async () => {
    const { kernel, caller, rootRunId } = await completedRun({ feature: 'unsupported' })
    await expect(kernel.operations.cancel({ caller, rootRunId })).resolves.toEqual({
      kind: 'cancellation_not_possible', rootRunId, reason: 'provider_cancellation_unsupported',
    })
  })

  it('records ambiguous cancellation transport without claiming acceptance or retrying', async () => {
    let calls = 0
    const { kernel, caller, rootRunId } = await completedRun({
      feature: 'supported',
      requestCancellation: async () => { calls += 1; throw new Error('connection reset after cancellation write') },
    })
    const first = await kernel.operations.cancel({ caller, rootRunId })
    const replay = await kernel.operations.cancel({ caller, rootRunId })
    expect(calls).toBe(1)
    expect(replay).toEqual(first)
    expect(first).toMatchObject({ kind: 'provider_cancellation_recorded', disposition: 'indeterminate', run: { state: 'completed', effectState: 'committed' } })
  })

  it('records a provider rejection without rewriting the committed effect', async () => {
    const { kernel, caller, rootRunId } = await completedRun({
      feature: 'supported',
      requestCancellation: async () => ({ kind: 'cancellation_rejected', reason: 'shipment_already_collected', providerReference: 'cancel:req-rejected' }),
    })
    await expect(kernel.operations.cancel({ caller, rootRunId })).resolves.toMatchObject({
      kind: 'provider_cancellation_recorded', disposition: 'rejected', reason: 'shipment_already_collected',
      providerReference: 'cancel:req-rejected', run: { state: 'completed', effectState: 'committed' },
    })
  })

  it('recovers a request persisted before a crash as indeterminate without provider retry', async () => {
    let providerCalls = 0
    const durableStore = createInMemoryKernelStore()
    let crashAfterClaim = true
    const crashingStore: KernelStore = {
      ...durableStore,
      claimProviderCancellation: async (cancellation, run) => {
        const result = await durableStore.claimProviderCancellation(cancellation, run)
        if (crashAfterClaim) {
          crashAfterClaim = false
          throw new Error('process_crashed_after_persist_before_egress')
        }
        return result
      },
    }
    const completed = await completedRun({
      feature: 'supported', store: crashingStore,
      requestCancellation: async () => { providerCalls += 1; return { kind: 'cancellation_accepted' } },
    })
    await expect(completed.kernel.operations.cancel({ caller: completed.caller, rootRunId: completed.rootRunId }))
      .rejects.toThrow('process_crashed_after_persist_before_egress')

    const recovered = await completedRunKernel({
      binding: completed.binding, store: durableStore, now: () => 2_000,
    })
    await expect(recovered.operations.cancel({ caller: completed.caller, rootRunId: completed.rootRunId })).resolves.toMatchObject({
      kind: 'provider_cancellation_recorded', disposition: 'indeterminate',
      run: { state: 'completed', effectState: 'committed' },
    })
    expect(providerCalls).toBe(0)
  })

  it('does not disclose or change a cancellation when the replay caller changes', async () => {
    let calls = 0
    const { kernel, caller, rootRunId } = await completedRun({
      feature: 'supported', requestCancellation: async () => { calls += 1; return { kind: 'cancellation_accepted' } },
    })
    await kernel.operations.cancel({ caller, rootRunId })
    await expect(kernel.operations.cancel({ caller: { ...caller, principalId: 'principal:other' }, rootRunId })).resolves.toEqual({ kind: 'run_not_found' })
    expect(calls).toBe(1)
  })

  it('reconciles an indeterminate cancellation only on its original durable identities', async () => {
    let calls = 0
    const { kernel, caller, rootRunId, store } = await completedRun({
      feature: 'supported', requestCancellation: async () => { calls += 1; return { kind: 'cancellation_unknown' } },
    })
    const unknown = await kernel.operations.cancel({ caller, rootRunId })
    if (unknown.kind !== 'provider_cancellation_recorded') throw new Error(unknown.kind)
    const cancellation = await store.getProviderCancellation(rootRunId)
    if (cancellation === undefined) throw new Error('cancellation_identity_not_found')
    const request = {
      cancellationRequestId: cancellation.cancellationRequestId,
      rootRunId, leafRunId: cancellation.leafRunId, stepGrantId: cancellation.stepGrantId,
      idempotencyKey: cancellation.idempotencyKey,
      evidence: { source: 'provider_status_lookup', observedAt: 1_100, disposition: 'accepted' as const, providerReference: 'cancel:reconciled-1' },
    }

    await expect(kernel.authority.reconcileProviderCancellation({ ...request, stepGrantId: 'step:changed' })).resolves.toEqual({
      kind: 'cancellation_reconciliation_refused', reason: 'cancellation_identity_mismatch',
    })
    await expect(kernel.authority.reconcileProviderCancellation({
      ...request, evidence: { source: 'provider_status_lookup', observedAt: 1_100, disposition: 'rejected' },
    })).resolves.toEqual({ kind: 'cancellation_reconciliation_refused', reason: 'invalid_evidence' })
    await expect(kernel.authority.reconcileProviderCancellation(request)).resolves.toMatchObject({
      kind: 'provider_cancellation_reconciled', disposition: 'accepted',
      run: { state: 'completed', effectState: 'committed', records: expect.arrayContaining([
        expect.objectContaining({
          type: 'provider_cancellation_accepted', cancellationRequestId: cancellation.cancellationRequestId,
          leafRunId: cancellation.leafRunId, evidenceSource: 'provider_status_lookup', providerReference: 'cancel:reconciled-1',
        }),
      ]) },
    })
    expect(calls).toBe(1)
  })
})

async function completedRun(input: {
  feature: 'supported' | 'unsupported'
  requestCancellation?: CapabilityBindingAdapter['requestCancellation']
  store?: KernelStore
}) {
  let id = 0
  const caller = { agentId: 'agent:cancel-test', principalId: 'principal:cancel-test' } as const
  const binding: CapabilityBindingAdapter = {
    binding: {
      bindingId: 'binding:cancel-provider:v1', nodeId: 'node:cancel-provider', networkId: 'network:1',
      capabilityContractId: 'capability:booking:v1', operation: 'book', admission: 'admitted', conformance: 'conformant',
      queryTerms: ['book'], adapterFeatures: { requestCancellation: input.feature },
    },
    quote: async () => ({ kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 100 }, maximumCost: { currency: 'AUD', amountMinor: 100 }, expectedLatencyMs: 100, dataFields: [], disclosures: [] }),
    execute: async () => ({ kind: 'effect_committed', providerReference: 'booking:1', outcome: { status: 'booked' } }),
    reconcile: async () => ({ kind: 'effect_committed', providerReference: 'booking:1', outcome: { status: 'booked' } }),
    ...(input.requestCancellation === undefined ? {} : { requestCancellation: input.requestCancellation }),
  }
  const store = input.store ?? createInMemoryKernelStore()
  const kernel = completedRunKernel({ binding, store, now: () => 1_000, ids: { next: (prefix) => `${prefix}:${++id}` } })
  const routed = await kernel.operations.route({ caller, networkId: 'network:1', query: 'book', constraints: { currency: 'AUD', maximumSpendMinor: 100 } })
  if (routed.kind !== 'quoted') throw new Error(routed.kind)
  const authorization = await kernel.authority.authorize({ quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId, maximumSpendMinor: 100, currency: 'AUD', expiresAt: 1_500 })
  const executed = await kernel.operations.execute({ caller, quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'booking:1' })
  if (executed.kind !== 'run_admitted') throw new Error(executed.kind)
  return { kernel, caller, rootRunId: executed.run.rootRunId, binding, store }
}

function completedRunKernel(input: { binding: CapabilityBindingAdapter; store?: KernelStore; now: () => number; ids?: { next: (prefix: string) => string } }) {
  return createNeutralRoutingKernel({
    now: input.now, executionMode: 'simulation', ids: input.ids ?? { next: (prefix) => `${prefix}:recovered` },
    quoteTtlMs: 1_000, bindings: [input.binding], ...(input.store === undefined ? {} : { store: input.store }),
  })
}
