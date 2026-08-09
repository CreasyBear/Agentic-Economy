import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import type { OperationSearchResult, PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { bindCustomerCapabilityDescriptor, type ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { requestRegistrySnapshotDigest, type RegisteredEvaluationBinding } from '@/modules/customer-request/evaluation'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'
import {
  previewCustomerRequest,
  type DiscoverCapabilities,
  type PreviewCustomerRequestResult,
  type RequestGraph,
} from '@/modules/customer-request/application/interpret-compile'

type SchemaRecord = Readonly<Record<string, JsonValue>>

const fiatSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  properties: { base: { type: 'string', minLength: 3 }, quote: { type: 'string', minLength: 3 } },
  required: ['base', 'quote'], additionalProperties: false,
}
const coinSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  properties: { ids: { type: 'string', minLength: 1 }, vs_currencies: { type: 'string', minLength: 1 } },
  required: ['ids', 'vs_currencies'], additionalProperties: false,
}
const geocodeSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  properties: { name: { type: 'string', minLength: 1 } },
  required: ['name'], additionalProperties: false,
}

interface SelectionBoundaryCapability {
  model: CapabilityDecisionModel
  descriptor: ServerCapabilityDescriptor
  binding: RegisteredEvaluationBinding
}

function makeCapability(
  capabilityId: string,
  name: string,
  description: string,
  inputSchema: SchemaRecord,
  searchTerms: string[],
): SelectionBoundaryCapability {
  const inputs = Object.keys((inputSchema as { properties?: Record<string, unknown> }).properties ?? {})
  const document = capabilityContractV2({
    capabilityId, name, description, inputSchema,
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false,
    },
    customerAnnotations: [
      ...inputs.map((input) => ({ annotationId: input, document: 'input' as const, pointer: `/${input}`, label: input, role: 'request' as const })),
      { annotationId: 'result', document: 'output' as const, pointer: '/result', label: 'Result', role: 'completion_evidence' as const },
    ],
    dataUse: inputs.map((input) => ({
      effectId: `release_${input}`, inputPointer: `/${input}`, classification: 'public' as const, phase: 'execution' as const,
      recipient: { kind: 'selected_binding' as const }, purposes: ['return_requested_result'],
    })),
    effects: inputs.map((input) => ({ effectId: `release_${input}`, class: 'data_release' as const, authority: 'mandate_or_explicit' as const, reversibility: 'irreversible' as const })),
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
  })
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  const operationRef = createTestOperationLineage(model.contractRef).operationRef
  const descriptor = bindCustomerCapabilityDescriptor({
    operationRef,
    operationRefs: [operationRef],
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    name, description,
    inputs: model.inputs,
    valueSchemas: model.inputs.map((input) => ({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(inputSchema, input),
    })),
    evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    ...(searchTerms.length === 0 ? {} : { searchTerms }),
  })
  const binding: RegisteredEvaluationBinding = {
    ...createTestOperationLineage(model.contractRef),
    businessId: `business:${operationRef}`, offeringId: `offering:${operationRef}`, bindingId: operationRef,
    contractRef: model.contractRef, offeringRegistrationHash: `sha256:${operationRef}`,
    bindingRegistrationHash: `sha256:${operationRef}`,
    publicationRef: `publication:${operationRef}`, publicationRevision: 1,
    readinessValidUntil: 999_999_999_999_999,
    price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: '100', exponent: 2 } },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [`cancellation:${operationRef}`] },
  }
  return { model, descriptor, binding }
}

const FX = makeCapability(
  'frankfurter.single-rate', 'Frankfurter ECB rate', 'Returns an ECB reference rate for a currency pair.', fiatSchema,
  ['exchange rates', 'ecb rates', 'currency conversion'],
)
const COINGECKO = makeCapability(
  'coingecko.simple-price', 'CoinGecko price', 'Returns a crypto market price.', coinSchema,
  ['bitcoin price', 'ethereum price', 'crypto price'],
)
const GEOCODE = makeCapability(
  'open-meteo.geocoding', 'Open-Meteo geocoding', 'Finds coordinates for a place name.', geocodeSchema,
  ['geocode', 'geocoding', 'place search'],
)

function graphWith(...caps: SelectionBoundaryCapability[]): RequestGraph {
  const bindings = caps.map((cap) => cap.binding)
  return {
    kind: 'available',
    models: caps.map((cap) => cap.model),
    descriptors: caps.map((cap) => cap.descriptor),
    bindings,
    mappings: [],
    registrySnapshotDigest: requestRegistrySnapshotDigest(bindings),
  }
}

function searchOk(graph: RequestGraph, query: string, ...operationRefs: string[]): OperationSearchResult {
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1' as const,
    query,
    items: operationRefs.map((operationRef) => ({
      operationRef,
      name: graph.descriptors.find((descriptor) => descriptor.operationRef === operationRef)?.name ?? 'unknown',
      navigation: [],
    }) as unknown as PublicOperationDescriptor),
    pagination: { limit: 20, hasMore: false },
    navigation: [],
  }
}

function modelReturnsSelection(content: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{
      message: { role: 'assistant', content: JSON.stringify({
        canonicalStatements: [], supersededStatements: [], ...(content as Record<string, unknown>),
      }) }, finish_reason: 'stop',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

async function preview(job: string, discover: DiscoverCapabilities): Promise<PreviewCustomerRequestResult> {
  const graph = graphWith(FX, COINGECKO, GEOCODE)
  return previewCustomerRequest(
    { customerJob: job, network: 'ae:public', now: 2_000 },
    { loadRequestGraph: async () => graph, discoverCapabilities: discover },
    { openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000 },
  )
}

function discoverOnly(cap: SelectionBoundaryCapability): DiscoverCapabilities {
  const graph = graphWith(FX, COINGECKO, GEOCODE)
  return async (input) => searchOk(graph, input.query, cap.descriptor.operationRef)
}

function zeroSelectionModel(): void {
  modelReturnsSelection({ kind: 'capability_candidates', selections: [] })
}

// The live model signs a well-formed 'requested_result_not_available' refusal for crypto/geocode
// even though the ops are registered+routeable and discovery resolves them. This stubs that exact
// proposal (kind=unsupported_request) so the composite recovery seam is exercised end to end.
function unsupportedRequestModel(): void {
  modelReturnsSelection({
    kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '',
  })
}


describe('selection boundary: crypto/geocode resolve (never opaque preview_unavailable)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('resolves a crypto query deterministically to CoinGecko when the model returns no selections', async () => {
    zeroSelectionModel()
    const result = await preview('bitcoin price in usd', discoverOnly(COINGECKO))
    expect(result).toMatchObject({ kind: 'preview', authority: 'inspect_only' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('CoinGecko price')
      expect(result.steps.map((step) => step.title)).not.toContain('Frankfurter ECB rate')
    }
  })

  it('resolves a geocode query to the geocoding op', async () => {
    zeroSelectionModel()
    const result = await preview('geocode Paris', discoverOnly(GEOCODE))
    expect(result).toMatchObject({ kind: 'preview' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('Open-Meteo geocoding')
    }
  })

  it('resolves ethereum to CoinGecko (never a fiat plan)', async () => {
    zeroSelectionModel()
    const result = await preview('ethereum price', discoverOnly(COINGECKO))
    expect(result).toMatchObject({ kind: 'preview' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('CoinGecko price')
    }
  })
})

describe('selection boundary: unsupported_request recovers on a non-empty pool (AI-SDK no-tool-call is non-terminal)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('resolves "bitcoin price in usd" to CoinGecko when the model judges it unsupported', async () => {
    unsupportedRequestModel()
    const result = await preview('bitcoin price in usd', discoverOnly(COINGECKO))
    expect(result).toMatchObject({ kind: 'preview', authority: 'inspect_only' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('CoinGecko price')
      expect(result.steps.map((step) => step.title)).not.toContain('Frankfurter ECB rate')
    }
  })

  it('resolves "ethereum price" to CoinGecko via recovery on unsupported_request', async () => {
    unsupportedRequestModel()
    const result = await preview('ethereum price', discoverOnly(COINGECKO))
    expect(result).toMatchObject({ kind: 'preview' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('CoinGecko price')
    }
  })

  it('resolves "geocode Paris" to the geocoding op via recovery on unsupported_request', async () => {
    unsupportedRequestModel()
    const result = await preview('geocode Paris', discoverOnly(GEOCODE))
    expect(result).toMatchObject({ kind: 'preview' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('Open-Meteo geocoding')
    }
  })

  it('keeps an unsupported_request on an EMPTY pool an honest refusal (preview_unavailable)', async () => {
    unsupportedRequestModel()
    const emptyGraph: RequestGraph = {
      kind: 'available', models: [], descriptors: [], bindings: [], mappings: [],
      registrySnapshotDigest: requestRegistrySnapshotDigest([]),
    }
    const result = await previewCustomerRequest(
      { customerJob: 'turn me into a dragon', network: 'ae:public', now: 2_000 },
      {
        loadRequestGraph: async () => emptyGraph,
        discoverCapabilities: async (input) => searchOk(emptyGraph, input.query),
      },
      { openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000 },
    )
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'preview_unavailable' })
  })
})

describe('selection boundary: FX false-positive prevention', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('does not emit a Frankfurter plan for a pair-less "convert money"', async () => {
    zeroSelectionModel()
    const result = await preview('convert money', discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'needs_information' })
    expect(result).not.toMatchObject({ kind: 'preview' })
  })

  it('does not emit a Frankfurter plan when the model itself picks it for "convert money"', async () => {
    modelReturnsSelection({
      kind: 'capability_candidates',
      selections: [{ operationRef: FX.descriptor.operationRef, selectionKey: FX.descriptor.selectionKey, facts: [] }],
    })
    const result = await preview('convert money', discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'needs_information' })
    expect(result).not.toMatchObject({ kind: 'preview' })
  })

  it('refuses a same-pair degenerate conversion instead of emitting a Frankfurter plan', async () => {
    zeroSelectionModel()
    const result = await preview('convert USD to USD', discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'needs_information' })
    expect(result).not.toMatchObject({ kind: 'preview' })
  })

  it('still resolves a genuine distinct-pair conversion to Frankfurter', async () => {
    zeroSelectionModel()
    const result = await preview('convert EUR to USD', discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'preview' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('Frankfurter ECB rate')
    }
  })
})

describe('selection boundary: needs_information is specific and deterministic', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('names the missing required fields (base and quote) for "convert money"', async () => {
    zeroSelectionModel()
    const first = await preview('convert money', discoverOnly(FX))
    const second = await preview('convert money', discoverOnly(FX))
    expect(first).toMatchObject({ kind: 'needs_information' })
    if (first.kind === 'needs_information' && second.kind === 'needs_information') {
      expect(first.prompt).toContain('base')
      expect(first.prompt).toContain('quote')
      // Deterministic: the same ambiguous query always asks the same typed question.
      expect(second.prompt).toBe(first.prompt)
    }
  })

  it('names the repeated currency for a same-pair conversion', async () => {
    zeroSelectionModel()
    const result = await preview('convert USD to USD', discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'needs_information' })
    if (result.kind === 'needs_information') {
      expect(result.prompt).toMatch(/same currency/i)
    }
  })

  it('normalizes a non-deterministic model direction ask to the deterministic field-naming ask', async () => {
    modelReturnsSelection({
      kind: 'needs_intent_direction', prompt: 'What exactly do you want?', reason: '',
    })
    const first = await preview('convert money', discoverOnly(FX))
    const second = await preview('convert money', discoverOnly(FX))
    expect(first).toMatchObject({ kind: 'needs_information' })
    if (first.kind === 'needs_information' && second.kind === 'needs_information') {
      expect(first.prompt).toContain('base')
      expect(first.prompt).toContain('quote')
      expect(first.prompt).not.toMatch(/What exactly do you want/)
      expect(second.prompt).toBe(first.prompt)
    }
  })
})
