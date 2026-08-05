import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  discoverAndFilterDescriptors,
  previewCustomerRequest,
  type DiscoverCapabilities,
  type RequestGraph,
} from '@/modules/customer-request/application/public'
import { requestRegistrySnapshotDigest, type RegisteredEvaluationBinding } from '@/modules/customer-request/evaluation'
import { bindCustomerCapabilityDescriptor, type ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import type { OperationSearchResult, PublicOperationDescriptor } from '@/modules/capability-supply/public'
import type { JsonValue } from '@/modules/capability-contract/public'
import { createTestOperationLineage } from '../../../helpers/customer-request-lineage'
import { capabilityContractV2 } from '../../../fixtures/capability-contract-v2'

const FX_JOB = 'convert EUR to USD'
const UNRELATED_JOB = 'book a dentist appointment for a filling'

describe('discoverAndFilterDescriptors', () => {
  it('keeps only descriptors whose operation ref was returned by discovery', async () => {
    const graph = graphWith(fx(), documentLookup())
    const discover = vi.fn<DiscoverCapabilities>(async () => searchOk(graph, graph.descriptors[0]!.operationRef))

    const filtered = await discoverAndFilterDescriptors(FX_JOB, graph, discover)

    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ query: FX_JOB }))
    expect(filtered.map((descriptor) => descriptor.name)).toEqual(['Foreign exchange single rate'])
  })

  it('falls back to the full descriptor set when discovery finds nothing', async () => {
    const graph = graphWith(fx(), documentLookup())
    const noCandidates: DiscoverCapabilities = async () => ({ kind: 'no_candidates', schemaVersion: 'registry-operations:v1' as const, query: UNRELATED_JOB, appliedFilters: {}, navigation: [] })

    const filtered = await discoverAndFilterDescriptors(UNRELATED_JOB, graph, noCandidates)

    expect(filtered.map((descriptor) => descriptor.name).sort()).toEqual(
      ['Document lookup', 'Foreign exchange single rate'],
    )
  })

  it('falls back to the full descriptor set when the discovery source is unavailable', async () => {
    const graph = graphWith(fx(), documentLookup())
    const unavailable: DiscoverCapabilities = async () => ({ kind: 'unavailable', schemaVersion: 'registry-operations:v1' as const, reason: 'source_unavailable', navigation: [] })

    const filtered = await discoverAndFilterDescriptors(FX_JOB, graph, unavailable)

    expect(filtered).toBe(graph.descriptors)
  })

  it('does not run discovery for an empty job and keeps the full set', async () => {
    const graph = graphWith(fx())
    const discover = vi.fn<DiscoverCapabilities>()

    const filtered = await discoverAndFilterDescriptors('   ', graph, discover)

    expect(discover).not.toHaveBeenCalled()
    expect(filtered).toBe(graph.descriptors)
  })
})

describe('previewCustomerRequest discovery threading', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('produces a preview plan for currency-conversion natural language via the discovered pool', async () => {
    const graph = graphWith(fx(), documentLookup())
    const selected = graph.descriptors[0]!
    const discover = vi.fn<DiscoverCapabilities>(async () => searchOk(graph, selected.operationRef))

    vi.stubGlobal('fetch', vi.fn(async () => modelResponse({
      kind: 'capability_candidates',
      selections: [{ operationRef: selected.operationRef, selectionKey: selected.selectionKey, facts: [] }],
    })))

    const result = await previewCustomerRequest(
      { customerJob: FX_JOB, network: 'ae:public', now: 2_000 },
      { loadRequestGraph: async () => graph, discoverCapabilities: discover },
      { openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000 },
    )

    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ query: FX_JOB }))
    expect(result).toMatchObject({ kind: 'preview', authority: 'inspect_only' })
    if (result.kind === 'preview') {
      expect(result.steps[0]).toMatchObject({ title: selected.name, purpose: selected.description })
      expect(result.steps[0]?.offeringRefs.length).toBeGreaterThan(0)
    }
  })

  it('does not fabricate a currency plan for an unrelated query when discovery is empty', async () => {
    const graph = graphWith(fx())
    const discover = vi.fn<DiscoverCapabilities>(async () => ({ kind: 'no_candidates', schemaVersion: 'registry-operations:v1' as const, query: UNRELATED_JOB, appliedFilters: {}, navigation: [] }))

    vi.stubGlobal('fetch', vi.fn(async () => modelResponse({
      kind: 'unsupported_request',
      reason: 'requested_result_not_available',
    })))

    const result = await previewCustomerRequest(
      { customerJob: UNRELATED_JOB, network: 'ae:public', now: 2_000 },
      { loadRequestGraph: async () => graph, discoverCapabilities: discover },
      { openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000 },
    )

    // Discovery returned nothing, so the full descriptor pool falls through and the interpreter
    // answers normally instead of an artificial 'no supply' short-circuit.
    expect(discover).toHaveBeenCalledWith(expect.objectContaining({ query: UNRELATED_JOB }))
    expect(result).not.toMatchObject({ kind: 'preview' })
  })
})

function fx() {
  const document = capabilityContractV2({
    capabilityId: 'frankfurter.single-rate',
    name: 'Foreign exchange single rate',
    description: 'Return a current European Central Bank reference rate for a currency pair.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        base: { type: 'string', minLength: 3 },
        quote: { type: 'string', minLength: 3 },
      },
      required: ['base', 'quote'],
      additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'base', document: 'input', pointer: '/base', label: 'Base currency', role: 'request' },
      { annotationId: 'quote', document: 'input', pointer: '/quote', label: 'Quote currency', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [
      {
        effectId: 'rate_release',
        inputPointer: '/base',
        classification: 'personal',
        phase: 'execution',
        recipient: { kind: 'selected_binding' },
        purposes: ['return_requested_result'],
      },
      {
        effectId: 'rate_release',
        inputPointer: '/quote',
        classification: 'personal',
        phase: 'execution',
        recipient: { kind: 'selected_binding' },
        purposes: ['return_requested_result'],
      },
    ],
    effects: [{
      effectId: 'rate_release',
      class: 'data_release',
      authority: 'mandate_or_explicit',
      reversibility: 'irreversible',
    }],
  })
  return capability(document)
}

function documentLookup() {
  const document = capabilityContractV2({
    capabilityId: 'document.lookup',
    name: 'Document lookup',
    description: 'Return referenced content for a stored document.',
  })
  return capability(document)
}

function capability(document: ReturnType<typeof capabilityContractV2>) {
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const operationRef = createTestOperationLineage(model.contractRef).operationRef
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef,
    operationRefs: [operationRef],
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    name: document.name,
    description: document.description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(document.inputSchema as Record<string, JsonValue>, input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
  })
  return {
    model,
    descriptor,
    operationRef,
    selectionKey: model.selectionKey,
    binding: supply(descriptor.selectionKey, model),
  }
}

function graphWith(...items: ReturnType<typeof capability>[]): RequestGraph {
  const models = items.map((item) => item.model)
  const descriptors = items.map((item) => item.descriptor)
  const bindings = items.map((item) => item.binding)
  return {
    kind: 'available',
    models,
    descriptors,
    bindings,
    mappings: [],
    registrySnapshotDigest: requestRegistrySnapshotDigest(bindings),
  }
}

function supply(bindingId: string, model: CapabilityDecisionModel): RegisteredEvaluationBinding {
  return {
    ...createTestOperationLineage(model.contractRef),
    businessId: `business:${bindingId}`, offeringId: `offering:${bindingId}`, bindingId,
    contractRef: model.contractRef, offeringRegistrationHash: `sha256:offering:${bindingId}`,
    bindingRegistrationHash: `sha256:binding:${bindingId}`,
    publicationRef: `publication:${bindingId}`, publicationRevision: 1, readinessValidUntil: 20_000,
    price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 100 },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [`cancellation:${bindingId}`] },
  }
}

function searchOk(graph: RequestGraph, ...operationRefs: string[]): OperationSearchResult {
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1' as const,
    query: FX_JOB,
    items: operationRefs.map((operationRef) => ({
      operationRef,
      name: graph.descriptors.find((descriptor) => descriptor.operationRef === operationRef)?.name ?? 'unknown',
      navigation: [],
    }) as unknown as PublicOperationDescriptor),
    pagination: { limit: 20, hasMore: false },
    navigation: [],
  }
}

function modelResponse(content: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{
      message: {
        role: 'assistant',
        content: JSON.stringify({
          canonicalStatements: [],
          supersededStatements: [],
          ...(content as Record<string, unknown>),
        }),
      },
      finish_reason: 'stop',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
