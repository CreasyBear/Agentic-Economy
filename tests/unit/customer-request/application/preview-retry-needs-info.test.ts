import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
  type JsonValue,
} from '@/modules/capability-contract/public'
import type { OperationSearchResult, PublicOperationDescriptor, PublicOperationRef } from '@/modules/capability-supply/public'
import { bindCustomerCapabilityDescriptor, type ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'
import { requestRegistrySnapshotDigest, type RegisteredEvaluationBinding } from '@/modules/customer-request/evaluation'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'
import { pricingConfigDigest } from '@/modules/money/public'
import {
  createDeterministicCustomerRequestInterpreter,
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
const weatherSchema: SchemaRecord = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
  properties: { city: { type: 'string', minLength: 1 } },
  required: ['city'], additionalProperties: false,
}

interface PreviewCapability {
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
): PreviewCapability {
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
    priceDigest: pricingConfigDigest({
      version: 'pricing:v2', unit: 'call', paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
    }),
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [`cancellation:${operationRef}`] },
  }
  return { model, descriptor, binding }
}

const FX = makeCapability(
  'frankfurter.single-rate', 'Frankfurter ECB rate', 'Returns an ECB reference rate for a currency pair.', fiatSchema,
  ['exchange rates', 'ecb rates', 'currency conversion'],
)
// The description deliberately avoids the literal 'weather'/'forecast' tokens, but the registry-
// taught searchTerms carry them. Under the ENGINE CONTRACT the deterministic leg token-matches the
// SAME discovery vocabulary (name + description + searchTerms), so a genuine forecast request
// ('weather in Paris', or even bare 'weather') is now SELECTED deterministically by this capability
// instead of needing a needs_intent_direction ask. Exact-token matching (no stemming) means
// 'reading' is NOT in this vocabulary, which is what keeps the greenfield typed ask reachable below.
const WEATHER = makeCapability(
  'open-meteo.forecast', 'Local climate snapshot', 'Returns current atmospheric conditions for a named settlement.', weatherSchema,
  ['weather', 'forecast'],
)

function graphWith(...caps: PreviewCapability[]): RequestGraph {
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

function operationDescriptorFor(graph: RequestGraph, operationRef: PublicOperationRef): PublicOperationDescriptor {
  const source = graph.descriptors.find((descriptor) => descriptor.operationRef === operationRef)
  if (source === undefined) throw new Error('test_operation_descriptor_missing')
  return {
    operationRef,
    operationId: `operation:${source.name}`,
    contract: {
      capabilityId: source.name,
      version: 1,
      inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
      customerAnnotations: [],
    },
    business: { businessId: `business:${operationRef}`, slug: source.name, name: source.name },
    offering: { offeringRef: `offering:${operationRef}`, revision: 1, label: source.name, summary: source.description },
    summary: source.description,
    commercial: {
      price: { kind: 'on_request' },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'Test operation.' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    authentication: { kind: 'keyless' },
    transport: { method: 'GET', requestTimeoutMs: 1_000 },
    provenance: { publisher: 'ae_curated_external', sourceKind: 'openapi_http' },
    availability: { posture: 'routeable' },
    navigation: [],
  }
}

function searchOk(graph: RequestGraph, query: string, ...operationRefs: PublicOperationRef[]): OperationSearchResult {
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1' as const,
    query,
    items: operationRefs.map((operationRef) => operationDescriptorFor(graph, operationRef)),
    matchedCount: operationRefs.length,
    ranking: operationRefs.map((operationRef, index) => ({ operationRef, rank: index + 1, score: operationRefs.length - index })),
    pagination: { limit: 20, hasMore: false },
    navigation: [],
  }
}

function stubModel(content: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{
      message: { role: 'assistant', content: JSON.stringify({
        canonicalStatements: [], supersededStatements: [], ...(content as Record<string, unknown>),
      }) }, finish_reason: 'stop',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

function zeroSelectionModel(): void {
  stubModel({ kind: 'capability_candidates', selections: [] })
}

function unsupportedRequestModel(): void {
  stubModel({ kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '' })
}

async function preview(job: string, graph: RequestGraph, discover: DiscoverCapabilities): Promise<PreviewCustomerRequestResult> {
  return previewCustomerRequest(
    { customerJob: job, network: 'ae:public', now: 2_000 },
    { loadRequestGraph: async () => graph, discoverCapabilities: discover },
    { openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000 },
  )
}

function discoverOnly(cap: PreviewCapability): DiscoverCapabilities {
  const graph = graphWith(FX, WEATHER)
  return async (input) => searchOk(graph, input.query, cap.descriptor.operationRef)
}

const GRAPH = graphWith(FX, WEATHER)

describe('planPreview bounded retry: a single transient provider failure still previews', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('retries once after a first-call transport throw and returns kind preview (2 invocations)', async () => {
    // The transport's generateText has its own maxRetries:1, but a raw network throw is not a
    // retryable APICallError, so it must surface to produceThenCompile's propose_failed and be
    // retried by planPreview's outer ladder.
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('ECONNRESET: upstream transport failure')
      return new Response(JSON.stringify({
        choices: [{
          message: { role: 'assistant', content: JSON.stringify({
            canonicalStatements: [], supersededStatements: [],
            kind: 'capability_candidates',
            selections: [{ operationRef: FX.descriptor.operationRef, selectionKey: FX.descriptor.selectionKey, facts: [] }],
          }) }, finish_reason: 'stop',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const result = await preview('convert EUR to USD', GRAPH, discoverOnly(FX))
    expect(calls).toBe(2)
    expect(result).toMatchObject({ kind: 'preview', authority: 'inspect_only' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('Frankfurter ECB rate')
    }
  })

  it('degrades to the deterministic SELECTION when the retry also fails (never a fabricated selection)', async () => {
    // On the exhausted attempt (finalAttempt: true) the composite interpreter does not rethrow and
    // does not return preview_unavailable: it recovers via recoverFromPool. Under the ENGINE
    // CONTRACT a GENUINE request is now deterministically selected by the forecast capability, so
    // that recovery returns the real capability_candidates selection (which compiles to a preview)
    // instead of a needs_intent_direction ask. The 'no fabrication' floor is preserved by the
    // eligibility gate: this is a genuine token overlap ('weather' in the fixture vocabulary), not
    // an arbitrary pool grab.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNRESET: persistent upstream transport failure')
    }))

    const result = await preview('weather in Paris', GRAPH, discoverOnly(WEATHER))
    expect(result).toMatchObject({ kind: 'preview', authority: 'inspect_only' })
    expect(result).not.toMatchObject({ kind: 'unavailable' })
    if (result.kind === 'preview') {
      expect(result.steps.map((step) => step.title)).toContain('Local climate snapshot')
    }
  })
})

describe('planPreview needs_information: under-specified capability-eligible queries ask, not collapse', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('resolves a genuine forecast request to the forecast capability on the deterministic path', async () => {
    // ENGINE CONTRACT: a genuine request ('weather in Paris') shares the literal token 'weather'
    // with the forecast fixture's searchTerms, so the eligibility gate returns 'genuine' and the
    // deterministic leg selects the forecast capability directly — no needs_intent_direction ask.
    // This is the change-2 seam under the new contract: genuine requests resolve to a real
    // capability, while only greenfield / under-specified wording falls through to the typed
    // needs_information ask asserted by the following tests.
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'weather in Paris',
      capabilities: [WEATHER.descriptor],
    })
    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: [{ selectionKey: WEATHER.descriptor.selectionKey, facts: [] }],
    })
  })

  it('returns a typed needs_information when an under-specified query resolves a pool but not a field', async () => {
    // Under the ENGINE CONTRACT 'please give me a reading' is GREENFIELD: 'reading' is not in the
    // forecast fixture vocabulary (name/description/searchTerms), so the eligibility gate returns
    // 'greenfield' and the deterministic leg proposes nothing. The model's zero-selection decline
    // therefore falls to recoverFromPool's stopWhen case — a candidate exists but no leg can
    // confidently map the request — which surfaces a typed needs_intent_direction ask naming the
    // op's required 'city' field instead of a fabricated selection or an opaque preview_unavailable.
    // This keeps the typed ask reachable for genuinely-ambiguous queries.
    zeroSelectionModel()
    const result = await preview('please give me a reading', GRAPH, discoverOnly(WEATHER))
    expect(result).toMatchObject({ kind: 'needs_information' })
    expect(result).not.toMatchObject({ kind: 'preview' })
    expect(result).not.toMatchObject({ kind: 'unavailable' })
    if (result.kind === 'needs_information') {
      expect(result.prompt).toMatch(/city/)
    }
  })

  it('names the missing base and quote fields for a bare convert query', async () => {
    // Under the ENGINE CONTRACT 'convert money' is GREENFIELD ('convert'/'money' share no token with
    // the FX fixture vocabulary), so the deterministic leg proposes nothing and recoverFromPool's
    // stopWhen case asks the typed question, naming the FX input schema's required 'base' and
    // 'quote' fields via needsInformationPrompt.
    zeroSelectionModel()
    const result = await preview('convert money', GRAPH, discoverOnly(FX))
    expect(result).toMatchObject({ kind: 'needs_information' })
    expect(result).not.toMatchObject({ kind: 'preview' })
    if (result.kind === 'needs_information') {
      expect(result.prompt).toContain('base')
      expect(result.prompt).toContain('quote')
    }
  })
})

describe('planPreview honesty: a truly unmatched query stays unavailable', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('keeps an unsupported_request on an EMPTY pool an honest preview_unavailable', async () => {
    unsupportedRequestModel()
    const emptyGraph: RequestGraph = {
      kind: 'available', models: [], descriptors: [], bindings: [], mappings: [],
      registrySnapshotDigest: requestRegistrySnapshotDigest([]),
    }
    const result = await preview(
      'turn me into a dragon',
      emptyGraph,
      async (input) => searchOk(emptyGraph, input.query),
    )
    expect(result).toMatchObject({ kind: 'unavailable', reason: 'preview_unavailable' })
  })
})
