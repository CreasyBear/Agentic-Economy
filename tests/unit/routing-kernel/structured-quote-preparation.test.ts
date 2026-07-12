import { describe, expect, it } from 'vitest'

import { createAllowingIncidentEvaluator } from '@/modules/routing-kernel/incident-control'
import { createStructuredQuotePreparationOperation } from '@/modules/routing-kernel/structured-quote-preparation'
import { createInMemoryStructuredQuotePreparationStore } from '@/modules/routing-kernel/structured-quote-preparation-store'
import { createNeutralRoutingKernel, type CapabilityBindingAdapter } from '@/modules/routing-kernel/application'

describe('structured quote preparation', () => {
  it('cannot invoke a structured-authorized binding through the legacy query route', async () => {
    let legacyQuoteCalls = 0
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:protected', nodeId: 'node:protected', networkId: 'network:businesses',
        capabilityContractId: 'shipping.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['shipping.quote:v1'], registrationHash: 'sha256:protected', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => { legacyQuoteCalls += 1; return { kind: 'refused', reason: 'must_not_run' } },
      quoteStructured: async () => ({ kind: 'refused', reason: 'not_used' }),
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    let id = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 1_000, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:${++id}` },
      quoteTtlMs: 60_000, bindings: [adapter],
    })

    await expect(kernel.operations.route({
      networkId: 'network:businesses', caller: { principalId: 'principal:1', agentId: 'agent:1' },
      query: 'shipping.quote:v1', constraints: { currency: 'AUD', maximumSpendMinor: 2_000 },
    })).resolves.toEqual({ kind: 'no_route', reason: 'no_eligible_graph' })
    expect(legacyQuoteCalls).toBe(0)
  })

  it('freezes candidates before allocation, releases separately, and replays without another provider call', async () => {
    const events: string[] = []
    let providerCalls = 0
    const store = createInMemoryStructuredQuotePreparationStore()
    const prepare = createStructuredQuotePreparationOperation({
      bindings: [binding('binding:a'), binding('binding:b')], store,
      incidentControl: createAllowingIncidentEvaluator(), now: clock(),
    })
    const input = {
      preparationRequestId: 'preparation:shipping:1', customerRequestId: 'request:shipping:1',
      planRevisionId: 'plan:shipping:1', actionId: 'action:quote', generation: 1,
      networkId: 'network:businesses', caller: { principalId: 'principal:1', agentId: 'agent:1' },
      capabilityContractId: 'shipping.quote:v1', capabilityContractVersion: '1',
      currency: 'AUD', maximumSpendMinor: 2_000,
      purpose: 'compare_shipping_options', protectedFieldNames: ['destinationPostcode', 'parcelWeightGrams'],
      allowedExecutionDataFields: [], requiredOfferOutputs: [{ field: 'serviceLevel', valueType: 'string' as const }],
      releaseForCandidate: async (release: Parameters<ReturnType<typeof createStructuredQuotePreparationOperation>>[0]['releaseForCandidate'] extends (value: infer V) => unknown ? V : never) => {
        events.push(`release:${release.recipient.bindingId}`)
        const result = await release.release({ allocationId: `allocation:${release.recipient.bindingId}`, protectedValues: { destinationPostcode: '6000', parcelWeightGrams: 750 } })
        return { ...result, allocationId: `allocation:${release.recipient.bindingId}`, releasedAt: 1_100 }
      },
    } as const

    const first = await prepare(input)
    const replay = await prepare(input)

    expect(first.kind).toBe('candidates_prepared')
    expect(replay).toEqual(first)
    expect(providerCalls).toBe(2)
    expect(events).toHaveLength(4)
    for (const bindingId of ['binding:a', 'binding:b']) {
      expect(events.indexOf(`release:${bindingId}`)).toBeLessThan(events.indexOf(`provider:${bindingId}`))
    }
    expect(collectValues(first)).not.toContain('6000')

    function binding(bindingId: string): CapabilityBindingAdapter {
      return {
        binding: {
          bindingId, nodeId: `node:${bindingId}`, networkId: 'network:businesses', capabilityContractId: 'shipping.quote:v1',
          operation: 'quote', admission: 'admitted', conformance: 'conformant', queryTerms: ['shipping'],
          adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
          registrationHash: `sha256:${bindingId}`, environment: 'production',
        },
        quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
        quoteStructured: async (request) => {
          providerCalls += 1
          events.push(`provider:${bindingId}`)
          return {
            kind: 'quoted', issuerBindingId: bindingId, issuerNodeId: `node:${bindingId}`,
            capabilityContractId: request.capabilityContractId, registrationHash: request.registrationHash,
            capabilityContractVersion: request.capabilityContractVersion,
            environment: request.environment, expectedCost: { currency: 'AUD', amountMinor: bindingId.endsWith('a') ? 1_100 : 1_300 },
            maximumCost: { currency: 'AUD', amountMinor: bindingId.endsWith('a') ? 1_200 : 1_400 }, expectedLatencyMs: 500,
            providerQuoteRef: `offer:${bindingId}`, providerQuoteExpiresAt: 60_000,
            ...commercialEvidence([{ field: 'serviceLevel', valueType: 'string', value: 'Tracked' }]),
            dataFields: [], disclosures: ['Tracked service'],
          }
        },
        execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
        reconcile: async () => ({ kind: 'reconciliation_pending' }),
      }
    }
  })

  it('does not contact the provider again after a crash between provider response and offer persistence', async () => {
    let providerCalls = 0
    let reconcileCalls = 0
    let crash = true
    const durable = createInMemoryStructuredQuotePreparationStore()
    const crashingStore = {
      ...durable,
      resolveQuoteAttempt: async (resolution: Parameters<typeof durable.resolveQuoteAttempt>[0]) => {
        if (crash && resolution.disposition === 'quoted') {
          crash = false
          throw new Error('simulated_store_crash_after_provider_response')
        }
        return await durable.resolveQuoteAttempt(resolution)
      },
    }
    const prepare = createStructuredQuotePreparationOperation({
      bindings: [singleBinding()], store: crashingStore,
      incidentControl: createAllowingIncidentEvaluator(), now: clock(),
    })
    const request = {
      preparationRequestId: 'preparation:crash:1', customerRequestId: 'request:crash:1',
      planRevisionId: 'plan:crash:1', actionId: 'action:quote', generation: 1,
      networkId: 'network:businesses', caller: { principalId: 'principal:1', agentId: 'agent:1' },
      capabilityContractId: 'shipping.quote:v1', capabilityContractVersion: '1',
      currency: 'AUD', maximumSpendMinor: 2_000,
      purpose: 'compare_shipping_options', protectedFieldNames: ['destinationPostcode'],
      allowedExecutionDataFields: [], requiredOfferOutputs: [],
      releaseForCandidate: async (release: Parameters<ReturnType<typeof createStructuredQuotePreparationOperation>>[0]['releaseForCandidate'] extends (value: infer V) => unknown ? V : never) => ({
        ...await release.release({ allocationId: 'allocation:crash:1', protectedValues: { destinationPostcode: '6000' } }),
        allocationId: 'allocation:crash:1', releasedAt: 1_100,
      }),
    } as const

    await expect(prepare(request)).rejects.toThrow('simulated_store_crash_after_provider_response')
    await expect(prepare(request)).resolves.toMatchObject({ kind: 'candidates_prepared', candidates: [{ offer: { providerOfferRef: 'offer:crash:1' } }] })
    expect(providerCalls).toBe(1)
    expect(reconcileCalls).toBe(1)

    function singleBinding(): CapabilityBindingAdapter {
      return {
        binding: {
          bindingId: 'binding:crash', nodeId: 'node:crash', networkId: 'network:businesses',
          capabilityContractId: 'shipping.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
          queryTerms: ['shipping'], registrationHash: 'sha256:binding:crash', environment: 'production',
          adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
        },
        quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
        quoteStructured: async (input) => {
          providerCalls += 1
          return {
            kind: 'quoted', issuerBindingId: input.recipient.bindingId, issuerNodeId: input.recipient.nodeId,
            capabilityContractId: input.capabilityContractId, registrationHash: input.registrationHash, environment: input.environment,
            capabilityContractVersion: input.capabilityContractVersion,
            expectedCost: { currency: 'AUD', amountMinor: 1_000 }, maximumCost: { currency: 'AUD', amountMinor: 1_100 },
            expectedLatencyMs: 500, providerQuoteRef: 'offer:crash:1', providerQuoteExpiresAt: 60_000,
            ...commercialEvidence(), dataFields: [], disclosures: ['Tracked service'],
          }
        },
        reconcileStructuredQuote: async (input) => {
          reconcileCalls += 1
          return {
            kind: 'quoted', issuerBindingId: input.recipient.bindingId, issuerNodeId: input.recipient.nodeId,
            capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
            registrationHash: input.registrationHash, environment: input.environment,
            expectedCost: { currency: 'AUD', amountMinor: 1_000 }, maximumCost: { currency: 'AUD', amountMinor: 1_100 },
            expectedLatencyMs: 500, providerQuoteRef: 'offer:crash:1', providerQuoteExpiresAt: 60_000,
            ...commercialEvidence(), dataFields: [], disclosures: ['Tracked service'],
          }
        },
        execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
        reconcile: async () => ({ kind: 'reconciliation_pending' }),
      }
    }
  })

  it('composes a non-shipping registered contract without changing the kernel operation', async () => {
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:rooms', nodeId: 'node:rooms', networkId: 'network:businesses',
        capabilityContractId: 'meeting-room.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['meeting room'], registrationHash: 'sha256:rooms', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async (input) => ({
        kind: 'quoted', issuerBindingId: input.recipient.bindingId, issuerNodeId: input.recipient.nodeId,
        capabilityContractId: input.capabilityContractId, registrationHash: input.registrationHash, environment: input.environment,
        capabilityContractVersion: input.capabilityContractVersion,
        expectedCost: { currency: 'AUD', amountMinor: 8_000 }, maximumCost: { currency: 'AUD', amountMinor: 9_000 },
        expectedLatencyMs: 300, providerQuoteRef: 'offer:room:1', providerQuoteExpiresAt: 60_000,
        ...commercialEvidence(), dataFields: ['attendeeNames'], disclosures: ['Refundable until Monday'],
      }),
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const store = createInMemoryStructuredQuotePreparationStore()
    const prepare = createStructuredQuotePreparationOperation({
      bindings: [adapter], store,
      incidentControl: createAllowingIncidentEvaluator(), now: clock(),
    })

    const result = await prepare({
      preparationRequestId: 'preparation:room:1', customerRequestId: 'request:room:1', planRevisionId: 'plan:room:1',
      actionId: 'action:room-quote', generation: 1, networkId: 'network:businesses',
      caller: { principalId: 'principal:1', agentId: 'agent:1' },
      capabilityContractId: 'meeting-room.quote:v1', capabilityContractVersion: '1', currency: 'AUD', maximumSpendMinor: 10_000,
      purpose: 'compare_meeting_rooms', protectedFieldNames: ['meetingDate', 'attendeeCount'],
      allowedExecutionDataFields: ['attendeeNames'], requiredOfferOutputs: [],
      releaseForCandidate: async (release) => ({
        ...await release.release({ allocationId: 'allocation:room:1', protectedValues: { meetingDate: '2026-08-04', attendeeCount: 8 } }),
        allocationId: 'allocation:room:1', releasedAt: 1_100,
      }),
    })

    expect(result).toMatchObject({
      kind: 'candidates_prepared',
      candidates: [{ offer: { capabilityContractId: 'meeting-room.quote:v1' }, disclosures: ['Service: Registered service'] }],
    })
  })

  it('refuses a newly frozen recipient before allocation or provider contact', async () => {
    let providerCalls = 0
    let releaseCalls = 0
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:frozen', nodeId: 'node:frozen', networkId: 'network:businesses',
        capabilityContractId: 'shipping.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['shipping'], registrationHash: 'sha256:frozen', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async () => { providerCalls += 1; return { kind: 'refused', reason: 'should_not_run' } },
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const prepare = createStructuredQuotePreparationOperation({
      bindings: [adapter], store: createInMemoryStructuredQuotePreparationStore(), now: clock(),
      incidentControl: {
        evaluate: async (_scope, action) => action === 'data_release'
          ? { kind: 'frozen', epochDigest: 'sha256:epoch', freezeOrderId: 'freeze:1', incidentId: 'incident:1', reason: 'provider_frozen' }
          : { kind: 'allowed', epochDigest: 'sha256:epoch' },
      },
    })

    const result = await prepare({
      preparationRequestId: 'preparation:frozen:1', customerRequestId: 'request:frozen:1', planRevisionId: 'plan:frozen:1',
      actionId: 'action:quote', generation: 1, networkId: 'network:businesses',
      caller: { principalId: 'principal:1', agentId: 'agent:1' }, capabilityContractId: 'shipping.quote:v1',
      capabilityContractVersion: '1', currency: 'AUD', maximumSpendMinor: 2_000,
      purpose: 'compare_shipping_options', protectedFieldNames: ['destinationPostcode'],
      allowedExecutionDataFields: [], requiredOfferOutputs: [],
      releaseForCandidate: async () => {
        releaseCalls += 1
        return { kind: 'refused', reason: 'should_not_run', nextAction: 'none' }
      },
    })

    expect(result).toMatchObject({ kind: 'insufficient_options', reason: 'no_structured_offer', attempts: [] })
    expect(releaseCalls).toBe(0)
    expect(providerCalls).toBe(0)
  })

  it('refuses registration drift before releasing protected data', async () => {
    let releases = 0
    let providerCalls = 0
    let evidenceReads = 0
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:drift', nodeId: 'node:drift', networkId: 'network:businesses',
        capabilityContractId: 'shipping.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['shipping'], registrationHash: 'sha256:original', environment: 'https://original.example',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async () => { providerCalls += 1; return { kind: 'refused', reason: 'should_not_run' } },
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const store = createInMemoryStructuredQuotePreparationStore()
    const prepare = createStructuredQuotePreparationOperation({
      bindings: [adapter], store,
      incidentControl: createAllowingIncidentEvaluator(), now: clock(),
      resolveCurrentBinding: async () => {
        evidenceReads += 1
        return {
          bindingId: 'binding:drift', nodeId: 'node:drift', networkId: 'network:businesses',
          capabilityContractId: 'shipping.quote:v1', admission: 'admitted' as const, conformance: 'conformant' as const,
          registrationHash: evidenceReads === 1 ? 'sha256:original' : 'sha256:changed',
          environment: evidenceReads === 1 ? 'https://original.example' : 'https://changed.example',
          quotePreparation: 'structured_authorized' as const,
        }
      },
    })

    const result = await prepare({
      preparationRequestId: 'preparation:drift:1', customerRequestId: 'request:drift:1', planRevisionId: 'plan:drift:1',
      actionId: 'action:quote', generation: 1, networkId: 'network:businesses',
      caller: { principalId: 'principal:1', agentId: 'agent:1' }, capabilityContractId: 'shipping.quote:v1',
      capabilityContractVersion: '1', currency: 'AUD', maximumSpendMinor: 2_000,
      purpose: 'compare_shipping_options', protectedFieldNames: ['destinationPostcode'], allowedExecutionDataFields: [], requiredOfferOutputs: [],
      releaseForCandidate: async (release) => {
        releases += 1
        try {
          await release.release({ allocationId: 'allocation:drift:1', protectedValues: { destinationPostcode: '6000' } })
          throw new Error('expected_registration_refusal')
        } catch {
          return { kind: 'uncertain', allocationId: 'allocation:drift:1', nextAction: 'Recheck registration.' }
        }
      },
    })

    expect(result).toMatchObject({ kind: 'insufficient_options', attempts: [] })
    expect(releases).toBe(1)
    expect(providerCalls).toBe(0)
    const candidateSet = await store.getCandidateSet('preparation:drift:1')
    expect(candidateSet).toBeDefined()
    expect(await store.listCandidateCoverage(candidateSet!.candidateSetDigest)).toEqual([
      expect.objectContaining({
        bindingId: 'binding:drift', disposition: 'registration_stale', protectedData: 'not_released',
        providerContact: 'none', reasonCode: 'registration_evidence_changed',
      }),
    ])
  })

  it('uses the frozen candidate set as replay authority when a binding disappears', async () => {
    const store = createInMemoryStructuredQuotePreparationStore()
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'binding:vanishing', nodeId: 'node:vanishing', networkId: 'network:businesses',
        capabilityContractId: 'inventory.quote:v1', operation: 'quote', admission: 'admitted', conformance: 'conformant',
        queryTerms: ['inventory'], registrationHash: 'sha256:vanishing', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async () => ({ kind: 'uncertain', reason: 'provider_quote_timeout' }),
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const request = {
      preparationRequestId: 'preparation:vanishing:1', customerRequestId: 'request:vanishing:1',
      planRevisionId: 'plan:vanishing:1', actionId: 'action:quote', generation: 1,
      networkId: 'network:businesses', caller: { principalId: 'principal:1', agentId: 'agent:1' },
      capabilityContractId: 'inventory.quote:v1', capabilityContractVersion: '1', currency: 'AUD', maximumSpendMinor: 2_000,
      purpose: 'prepare_inventory_quote', protectedFieldNames: ['accountRef'], allowedExecutionDataFields: [], requiredOfferOutputs: [],
      releaseForCandidate: async (release: Parameters<ReturnType<typeof createStructuredQuotePreparationOperation>>[0]['releaseForCandidate'] extends (value: infer V) => unknown ? V : never) => {
        try {
          await release.release({ allocationId: 'allocation:vanishing:1', protectedValues: { accountRef: 'private' } })
          throw new Error('expected_uncertainty')
        } catch {
          return { kind: 'uncertain' as const, allocationId: 'allocation:vanishing:1', nextAction: 'Check the same request.' }
        }
      },
    } as const
    const first = createStructuredQuotePreparationOperation({
      bindings: [adapter], store, incidentControl: createAllowingIncidentEvaluator(), now: clock(),
    })
    expect(await first(request)).toMatchObject({ kind: 'preparation_pending' })

    const resumedWithoutBinding = createStructuredQuotePreparationOperation({
      bindings: [], store, incidentControl: createAllowingIncidentEvaluator(), now: clock(),
    })
    const replay = await resumedWithoutBinding(request)
    expect(replay).toMatchObject({
      kind: 'preparation_pending', attempts: [expect.objectContaining({ disposition: 'uncertain' })],
      coverage: [expect.objectContaining({ bindingId: 'binding:vanishing', disposition: 'uncertain' })],
    })
  })
})

function clock() {
  let value = 1_000
  return () => ++value
}

function collectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(collectValues)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(collectValues)
  return [value]
}

function commercialEvidence(offerOutputs: readonly Readonly<{
  field: string; valueType: 'string' | 'integer' | 'boolean' | 'url' | 'money_minor'; value: string | number | boolean
}>[] = []) {
  return {
    offerOutputs, priceComponents: [{ label: 'Service', amountMinor: 1_000 }],
    materialTerms: [{ key: 'service', label: 'Service', value: 'Registered service' }],
    cancellation: { kind: 'unsupported' as const, summary: 'No commitment is created by this quote.' },
  }
}
