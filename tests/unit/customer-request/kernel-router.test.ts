import { describe, expect, it } from 'vitest'

import {
  createKernelCustomerRequestActionRouter,
  prepareKernelCustomerRequestEvaluationOptions,
} from '@/modules/customer-request/kernel-router'
import {
  createCapabilityContractRegistry,
  createCustomerRequest,
  createPlanRevision,
  defineCapabilityContract,
} from '@/modules/customer-request/legacy-v1'
import { createNeutralRoutingKernel, type CapabilityBindingAdapter } from '@/modules/routing-kernel/application'

describe('customer request kernel router', () => {
  it('prepares comparable options from public inputs without inventing disclosure authority', async () => {
    const contract = defineCapabilityContract({
      capabilityContractId: 'sandbox.option.quote:v1', name: 'Prepare a sandbox option', operation: 'quote',
      preparation: { purpose: 'sandbox_option_comparison', customerLabel: 'Compare sandbox options' },
      input: { requestContext: {
        valueType: 'string', customerLabel: 'Request details', required: true, decisionRelevance: 'option_selection',
        disclosure: { classification: 'public', phase: 'preparation', recipient: 'candidate_provider', purposes: ['sandbox_option_comparison'] },
      } },
      output: { optionSummary: { valueType: 'string', customerLabel: 'Option', required: true, decisionRelevance: 'option_selection', evidenceRole: 'provider_offer' } },
      consequence: { commitment: 'none', spend: 'quoted', reversibility: 'not_applicable', approval: 'explicit' },
    })
    let receivedData: Readonly<Record<string, string | number | boolean>> | undefined
    const adapter: CapabilityBindingAdapter = {
      binding: {
        bindingId: 'sandbox.option.one:v1', nodeId: 'sandbox:option-one', networkId: 'ae:public', capabilityContractId: contract.capabilityContractId,
        operation: 'quote', admission: 'admitted', conformance: 'conformant', queryTerms: ['sandbox option'],
        registrationHash: 'sha256:sandbox-one', environment: 'production',
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
      },
      quote: async () => ({ kind: 'refused', reason: 'structured_only' }),
      quoteStructured: async (input) => {
        receivedData = input.data
        return {
          kind: 'quoted', issuerBindingId: input.recipient.bindingId, issuerNodeId: input.recipient.nodeId,
          capabilityContractId: input.capabilityContractId, capabilityContractVersion: input.capabilityContractVersion,
          registrationHash: input.registrationHash, environment: input.environment,
          expectedCost: { currency: 'AUD', amountMinor: 900 }, maximumCost: { currency: 'AUD', amountMinor: 900 }, expectedLatencyMs: 100,
          providerQuoteRef: 'sandbox:offer:1', providerQuoteExpiresAt: 70_000,
          offerOutputs: [{ field: 'optionSummary', valueType: 'string', value: 'Sandbox Option One' }],
          priceComponents: [{ label: 'Sandbox amount', amountMinor: 900 }],
          materialTerms: [{ key: 'sandbox', label: 'Supply status', value: 'Verification only' }],
          cancellation: { kind: 'unsupported', summary: 'No effect.' }, dataFields: [], disclosures: [],
        }
      },
      execute: async () => ({ kind: 'effect_not_committed', reason: 'sandbox' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }
    const kernel = createNeutralRoutingKernel({
      now: () => 1_000, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:1` }, quoteTtlMs: 60_000, bindings: [adapter],
    })
    const result = await prepareKernelCustomerRequestEvaluationOptions(kernel, presentationDirectory(), {
      preparationRequestId: 'route:sandbox:1', request: {
        requestId: 'request:sandbox:1', revision: 1, principalId: 'principal:1', delegatedAgentId: 'agent:1',
        networkId: 'ae:public',
      },
      evaluation: { evaluationId: 'evaluation:sandbox:1', evaluationDigest: 'sha256:evaluation-sandbox-1' },
      allowedBindingIds: ['sandbox.option.one:v1'], preparationGeneration: 1,
      contract, publicInput: { requestContext: 'Compare options' },
    })
    expect(result).toMatchObject({ kind: 'candidate_set', candidateSet: { candidates: [{ expectedCost: { amountMinor: 900 } }] } })
    expect(receivedData).toEqual({ requestContext: 'Compare options' })

    const protectedContract = defineCapabilityContract({
      ...contract,
      input: { requestContext: {
        ...contract.input.requestContext,
        disclosure: {
          classification: 'personal', phase: 'preparation', recipient: 'candidate_provider',
          purposes: ['sandbox_option_comparison'],
        },
      } },
    })
    const releases: string[] = []
    receivedData = undefined
    const protectedResult = await prepareKernelCustomerRequestEvaluationOptions(kernel, presentationDirectory(), {
      preparationRequestId: 'route:sandbox:protected:1', request: {
        requestId: 'request:sandbox:protected:1', revision: 1, principalId: 'principal:1', delegatedAgentId: 'agent:1',
        networkId: 'ae:public',
      },
      evaluation: { evaluationId: 'evaluation:sandbox:protected:1', evaluationDigest: 'sha256:evaluation-protected-1' },
      allowedBindingIds: ['sandbox.option.one:v1'], preparationGeneration: 1,
      contract: protectedContract, publicInput: { requestContext: 'Compare protected options' },
      releasePreparationData: async (release) => {
        releases.push(release.recipient.bindingId)
        const provider = await release.release({
          allocationId: `allocation:${release.recipient.bindingId}`,
          protectedValues: { requestContext: 'Compare protected options' },
        })
        return { ...provider, kind: 'released', allocationId: `allocation:${release.recipient.bindingId}`, disposition: 'released', releasedAt: 1_100 }
      },
    })
    expect(protectedResult.kind).toBe('candidate_set')
    expect(releases).toEqual(['sandbox.option.one:v1'])
    expect(receivedData).toEqual({ requestContext: 'Compare protected options' })
  })

  it('routes structured preparation through allocation-bound recipient releases without legacy query smuggling', async () => {
    let legacyQuoteCalls = 0
    let providerCalls = 0
    const releases: Array<{ bindingId: string; fields: readonly string[]; purpose: string }> = []
    const contract = defineCapabilityContract({
      capabilityContractId: 'shipping.quote:v1', name: 'Prepare a shipping quote', operation: 'quote',
      preparation: { purpose: 'prepare_shipping_quote', customerLabel: 'Prepare comparable shipping quotes' },
      input: {
        destinationPostcode: {
          valueType: 'string', customerLabel: 'Destination postcode', required: true,
          disclosure: { classification: 'personal', phase: 'preparation', recipient: 'candidate_provider', purposes: ['check_service_area', 'prepare_shipping_quote'] },
        },
        parcelWeightGrams: {
          valueType: 'integer', customerLabel: 'Parcel weight', required: true,
          disclosure: { classification: 'personal', phase: 'preparation', recipient: 'candidate_provider', purposes: ['calculate_price', 'prepare_shipping_quote'] },
        },
      },
      output: {
        providerOfferRef: { valueType: 'provider_offer_ref', customerLabel: 'Provider offer', required: true, evidenceRole: 'provider_offer' },
        serviceLevel: { valueType: 'string', customerLabel: 'Service level', required: true, decisionRelevance: 'option_selection' },
      },
      consequence: { commitment: 'none', spend: 'quoted', reversibility: 'not_applicable', approval: 'explicit' },
    })
    const structuredBindings = ['binding:a', 'binding:b'].map((bindingId): CapabilityBindingAdapter => ({
      binding: {
        bindingId, nodeId: `node:${bindingId}`, networkId: 'network:businesses', capabilityContractId: contract.capabilityContractId,
        operation: 'quote', admission: 'admitted', conformance: 'conformant', queryTerms: ['shipping'],
        adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
        registrationHash: `sha256:${bindingId}`, environment: 'production',
      },
      quote: async () => { legacyQuoteCalls += 1; return { kind: 'refused', reason: 'structured_only' } },
      quoteStructured: async (input) => {
        providerCalls += 1
        return {
          kind: 'quoted', issuerBindingId: bindingId, issuerNodeId: `node:${bindingId}`,
          capabilityContractId: input.capabilityContractId, registrationHash: input.registrationHash, environment: input.environment,
          capabilityContractVersion: input.capabilityContractVersion,
          expectedCost: { currency: 'AUD', amountMinor: bindingId.endsWith('a') ? 1_000 : 1_200 },
          maximumCost: { currency: 'AUD', amountMinor: bindingId.endsWith('a') ? 1_100 : 1_300 }, expectedLatencyMs: 500,
          providerQuoteRef: `offer:${bindingId}`, providerQuoteExpiresAt: 70_000,
          offerOutputs: [{ field: 'serviceLevel', valueType: 'string', value: 'Tracked' }],
          priceComponents: [{ label: 'Service', amountMinor: bindingId.endsWith('a') ? 1_000 : 1_200 }],
          materialTerms: [{ key: 'service', label: 'Service', value: 'Tracked service' }],
          cancellation: { kind: 'unsupported', summary: 'No commitment is created by this quote.' },
          dataFields: [], disclosures: ['Tracked service'],
        }
      },
      execute: async () => ({ kind: 'effect_not_committed', reason: 'not_used' }),
      reconcile: async () => ({ kind: 'reconciliation_pending' }),
    }))
    let id = 0
    const kernel = createNeutralRoutingKernel({
      now: (() => { let now = 1_000; return () => ++now })(), executionMode: 'simulation',
      ids: { next: (prefix) => `${prefix}:${++id}` }, quoteTtlMs: 60_000, bindings: structuredBindings,
    })
    const router = createKernelCustomerRequestActionRouter(kernel, presentationDirectory())

    const result = await router.route({
      routingRequestId: 'preparation:shipping:1',
      request: {
        requestId: 'request:shipping:1', revision: 1, principalId: 'principal:1', delegatedAgentId: 'agent:1',
        routing: { networkId: 'network:businesses', currency: 'AUD', maximumSpendMinor: 2_000, optimizeFor: 'cost' },
      },
      action: { actionId: 'action:quote', capabilityContractId: contract.capabilityContractId }, contract, publicInput: {},
      planRevisionId: 'plan:shipping:1', preparationGeneration: 1,
      releasePreparationData: async (release) => {
        releases.push({ bindingId: release.recipient.bindingId, fields: release.fields, purpose: release.purpose })
        const provider = await release.release({
          allocationId: `allocation:${release.recipient.bindingId}`,
          protectedValues: { destinationPostcode: '6000', parcelWeightGrams: 750 },
        })
        return { ...provider, kind: 'released', allocationId: `allocation:${release.recipient.bindingId}`, disposition: 'released', releasedAt: 1_100 }
      },
    })

    expect(result).toMatchObject({ kind: 'candidate_set', candidateSet: { candidates: [{ business: { name: 'Business A' } }, { business: { name: 'Business B' } }] } })
    if (result.kind !== 'candidate_set') throw new Error('expected_candidate_set')
    expect(result.candidateSet.candidates[0]).toMatchObject({
        comparableOutputs: [{ label: 'Service level', value: 'Tracked' }],
        priceComponents: [{ label: 'Service', amountMinor: 1_000 }],
        cancellation: { kind: 'unsupported', summary: 'No commitment is created by this quote.' },
        inspectionRef: expect.stringMatching(/^evidence_[a-f0-9]{64}$/),
    })
    expect(releases).toEqual([
      { bindingId: 'binding:a', fields: ['destinationPostcode', 'parcelWeightGrams'], purpose: 'prepare_shipping_quote' },
      { bindingId: 'binding:b', fields: ['destinationPostcode', 'parcelWeightGrams'], purpose: 'prepare_shipping_quote' },
    ])
    expect(legacyQuoteCalls).toBe(0)
    expect(providerCalls).toBe(2)
    expect(JSON.stringify(result)).not.toMatch(/sha256|provider-offer|prepared-options|bindingId|capabilityContractId|candidateSetDigest|providerOfferDigest|RootRun|grant|selected|recommended|cheapest|best/i)
  })

  it('prepares one exact neutral-kernel quote and never releases a provider action', async () => {
    let quoteCalls = 0
    let executeCalls = 0
    let id = 0
    const contract = defineCapabilityContract({
      capabilityContractId: 'inventory.summary.query:v1', name: 'Query public inventory summary', operation: 'query',
      input: {}, output: { summary: { valueType: 'string', customerLabel: 'Inventory summary', required: true, evidenceRole: 'status' } },
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
    })
    const registry = createCapabilityContractRegistry([contract])
    const request = createCustomerRequest({
      requestId: 'request:inventory:1', principalId: 'principal:1', delegatedAgentId: 'agent:1', intent: 'Compare inventory summaries.',
      routing: { networkId: 'network:businesses', currency: 'AUD', maximumSpendMinor: 0, optimizeFor: 'latency' }, createdAt: 1_000,
    })
    const plan = createPlanRevision({
      planRevisionId: 'plan:inventory:1', requestId: request.requestId, requestRevision: request.revision,
      proposedByAgentId: request.delegatedAgentId,
      proposalProvenance: directProposal(), createdAt: 1_010,
      completionEvidence: [{ actionId: 'action:inventory', field: 'summary' }],
      actions: [{ actionId: 'action:inventory', capabilityContractId: contract.capabilityContractId, dependsOn: [], input: {} }],
    }, registry)
    const bindings = [binding('binding:a', 'node:a', 800), binding('binding:b', 'node:b', 600)]
    const kernel = createNeutralRoutingKernel({
      now: () => 1_100, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:${++id}` }, quoteTtlMs: 60_000,
      bindings: bindings.map((adapter) => ({
        ...adapter,
        quote: async (input) => { quoteCalls += 1; return await adapter.quote(input) },
        execute: async (input) => { executeCalls += 1; return await adapter.execute(input) },
      })),
    })
    const router = createKernelCustomerRequestActionRouter(kernel, {
      resolve: async (bindingIds) => bindingIds.map((bindingId) => ({
        bindingId, nodeId: bindingId === 'binding:a' ? 'node:a' : 'node:b',
        businessName: bindingId === 'binding:a' ? 'Business A' : 'Business B',
        cancellation: { kind: 'unsupported', summary: 'A public inventory query creates nothing to cancel.' },
      })),
    })
    const routeInput = {
      routingRequestId: 'route:request:inventory:1',
      request: {
        requestId: request.requestId, revision: request.revision, principalId: request.principalId,
        delegatedAgentId: request.delegatedAgentId, routing: request.routing,
      },
      action: { actionId: plan.actions[0]!.actionId, capabilityContractId: plan.actions[0]!.capabilityContractId },
      planRevisionId: plan.planRevisionId, preparationGeneration: request.revision,
      contract, publicInput: {},
    }

    const first = await router.route(routeInput)
    const replay = await router.route(routeInput)

    expect(first).toEqual(replay)
    expect(first).toMatchObject({
      kind: 'quoted', quote: {
        selected: { business: { bindingId: 'binding:b', name: 'Business B' } },
        alternatives: [{ business: { bindingId: 'binding:a', name: 'Business A' } }],
        commercialInfluence: 'none', preparationDisclosures: [],
      },
    })
    expect(quoteCalls).toBe(2)
    expect(executeCalls).toBe(0)
  })
})

function presentationDirectory() {
  return {
    resolve: async (bindingIds: readonly string[]) => bindingIds.map((bindingId) => ({
      bindingId, nodeId: `node:${bindingId}`,
      businessName: bindingId === 'binding:a' ? 'Business A' : 'Business B',
      cancellation: { kind: 'conditional' as const, summary: 'Carrier terms apply.' },
    })),
  }
}

function binding(bindingId: string, nodeId: string, latency: number): CapabilityBindingAdapter {
  return {
    binding: {
      bindingId, nodeId, networkId: 'network:businesses', capabilityContractId: 'inventory.summary.query:v1',
      operation: 'query', admission: 'admitted', conformance: 'conformant', queryTerms: ['inventory.summary.query:v1'],
    },
    quote: async () => ({
      kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 0 }, maximumCost: { currency: 'AUD', amountMinor: 0 },
      expectedLatencyMs: latency, dataFields: [], disclosures: [],
    }),
    execute: async () => ({ kind: 'effect_committed', providerReference: `${bindingId}:result`, outcome: { summary: 'available' } }),
    reconcile: async () => ({ kind: 'reconciliation_pending' }),
  }
}

function directProposal() {
  return { kind: 'direct_structured' as const, proposalDigest: 'sha256:' + '1'.repeat(64) }
}
