import { describe, expect, it } from 'vitest'

import {
  admitPublicationDraft,
  dereferenceOpenApiSchema,
  preparePublicationDraft,
  publicationValidationFix,
  validateCapabilityPublication,
  type CapabilityPublicationAdmissionSource,
  type SchemaDereferencer,
} from '@/modules/capability-supply/public'
import { dereferenceLocalSchema } from '@/modules/capability-supply/convex'

const JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

describe('capability publication validate (pre-flight admission)', () => {
  it('accepts a valid import with a normalized draft summary and source digest', async () => {
    const result = await validateCapabilityPublication(openApiAdmissionSource())

    expect(result).toMatchObject({
      kind: 'accepted',
      sourceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
    if (result.kind === 'accepted') {
      expect(result.normalized.source).toMatchObject({
        kind: 'openapi_http',
        selector: { path: '/lookup', method: 'post' },
      })
      expect(JSON.parse(result.normalized.documentJson)).toMatchObject({
        capabilityId: 'independent.validate',
        inputSchema: expect.any(Object),
        outputSchema: expect.any(Object),
      })
      expect(result.normalized.source.descriptorDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(result.sourceDigest).not.toBe(result.normalized.source.descriptorDigest)
    }
  })
  it('refuses opaque executable input without a validating example at pre-flight and preparation', async () => {
    const document = openApiDocument()
    const request = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    request.schema = {
      $schema: JSON_SCHEMA,
      type: 'object',
      properties: { query: { type: 'object', additionalProperties: { type: 'string' } } },
      required: ['query'],
      additionalProperties: false,
    }
    const source = {
      ...openApiAdmissionSource({ document }),
      contract: { ...contractMetadata('independent.validate'), description: 'Just pass a city name to get current weather.' },
    }
    const validated = await validateCapabilityPublication(source)
    expect(validated).toMatchObject({
      kind: 'refused',
      reason: 'opaque_input_without_valid_example',
      next: [{ action: 'revise-publication', field: '/inputSchema/query' }],
    })
    const { sourceRevision, ...publication } = source
    await expect(preparePublicationDraft({
      source: publication,
      sourceRevision,
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:opaque-weather'],
    })).resolves.toMatchObject({ kind: 'refused', reason: 'opaque_input_without_valid_example' })

    const withExample = {
      ...source,
      contract: {
        ...source.contract,
        inputExamples: [{ label: 'Weather for Sydney', input: { query: { city: 'Sydney' } } }],
      },
    }
    await expect(validateCapabilityPublication(withExample)).resolves.toMatchObject({ kind: 'accepted' })
    await expect(validateCapabilityPublication({
      ...withExample,
      contract: { ...withExample.contract, inputExamples: [{ input: { query: {} } }] },
    })).resolves.toMatchObject({ kind: 'refused', reason: 'opaque_input_without_valid_example' })
    await expect(validateCapabilityPublication({
      ...withExample,
      contract: { ...withExample.contract, inputExamples: [{ input: { query: { city: 123 } } }] },
    })).resolves.toMatchObject({ kind: 'refused', reason: 'opaque_input_without_valid_example' })

    request.schema = {
      $schema: JSON_SCHEMA,
      type: 'object',
      properties: {
        query: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false },
      },
      required: ['query'],
      additionalProperties: false,
    }
    await expect(validateCapabilityPublication(source)).resolves.toMatchObject({ kind: 'accepted' })
  })
  it('refuses the first-party OCR request file object even with a valid example, without weakening complete nested inputs', async () => {
    // Relaystation POST /v1/pdf/ocr OpenAPI: the file source is required but its children are prose only.
    // The /lookup response here is an existing test fixture, NOT an asserted OCR output schema.
    const document = openApiDocument()
    const request = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    request.schema = {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'object',
          description: 'cputools input-source: { inline: <base64 ≤ 4 MiB> } or { inputKey: <scratch key from /v1/cputools/upload-url, ≤ 50 MB> }.',
        },
        pages: { type: 'string', description: '1-based pages/ranges, e.g. "1-3,5" (default all).' },
        lang: { type: 'string', enum: ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'nld', 'pol', 'rus', 'chi_sim'] },
      },
    }
    const sourceRequestSchema = request.schema
    const metadata = contractMetadata('independent.validate')
    const requestAnnotation = metadata.customerAnnotations[0]
    const resultAnnotation = metadata.customerAnnotations[1]
    const disclosure = metadata.dataUse[0]
    const effect = metadata.effects[0]
    if (requestAnnotation === undefined || resultAnnotation === undefined || disclosure === undefined || effect === undefined) {
      throw new Error('reference_contract_metadata_missing')
    }
    const source = {
      ...openApiAdmissionSource({ document }),
      contract: {
        ...metadata,
        customerAnnotations: [
          { ...requestAnnotation, pointer: '/file' },
          resultAnnotation,
        ],
        dataUse: [
          { ...disclosure, inputPointer: '/file' },
          { ...disclosure, effectId: 'release-pages', inputPointer: '/pages' },
          { ...disclosure, effectId: 'release-lang', inputPointer: '/lang' },
        ],
        effects: [
          effect,
          { ...effect, effectId: 'release-pages' },
          { ...effect, effectId: 'release-lang' },
        ],
        inputExamples: [{ label: 'Inline PDF source', input: { file: { inline: 'JVBERi0xLjQ=' } } }],
      },
    }
    const rejected = await validateCapabilityPublication(source)
    expect(rejected).toMatchObject({
      kind: 'refused',
      reason: 'opaque_input_without_valid_example',
      next: [{ field: '/inputSchema/file' }],
    })
    expect(rejected).not.toHaveProperty('normalized')
    const { sourceRevision, ...publication } = source
    await expect(preparePublicationDraft({
      source: publication,
      sourceRevision,
      pricingConfig: { version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: '12000000' },
      evidenceRefs: ['source:relaystation-ocr-openapi'],
    })).resolves.toMatchObject({ kind: 'refused', reason: 'opaque_input_without_valid_example' })

    request.schema = {
      ...request.schema,
      properties: {
        ...request.schema.properties as object,
        file: {
          type: 'object',
          properties: { inline: { type: 'string' } },
          required: ['inline'],
          additionalProperties: false,
        },
      },
    }
    // This complete child schema is test-only; the current OCR OpenAPI does not publish it.
    await expect(validateCapabilityPublication(source)).resolves.toMatchObject({ kind: 'accepted' })
    const currentOcrSource = {
      ...source,
      document: {
        openapi: '3.1.0',
        info: { title: 'Relaystation', version: 'v1' },
        servers: [{ url: 'https://api.relaystation.ai' }],
        paths: {
          '/v1/pdf/ocr': {
            post: {
              requestBody: { required: true, content: { 'application/json': { schema: sourceRequestSchema } } },
              responses: { '200': { description: 'Per-page + merged OCR text.' } },
            },
          },
        },
      },
      operation: { path: '/v1/pdf/ocr', method: 'post' as const },
    }
    const current = await validateCapabilityPublication(currentOcrSource)
    expect(current).toMatchObject({ kind: 'refused', reason: 'schema_missing' })
    expect(current).not.toHaveProperty('normalized')
  })
  it('checks the versioned prepared contract again before admission or republication', async () => {
    const baseline = await preparePublicationDraft({
      source: openApiAdmissionSource(),
      sourceRevision: '2026-09-23/quality',
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:quality'],
    })
    if (baseline.kind !== 'prepared') throw new Error(`baseline_refused:${baseline.reason}`)
    const contract = JSON.parse(baseline.prepared.documentJson)
    contract.inputSchema.properties.query = { type: 'object', additionalProperties: { type: 'string' } }
    const result = await admitPublicationDraft({
      prepared: { ...baseline.prepared, documentJson: JSON.stringify(contract) },
      businessId: 'business:independent',
    })
    expect(result).toMatchObject({
      kind: 'refused',
      reason: 'opaque_input_without_valid_example',
      next: [{ action: 'revise-publication', field: '/inputSchema/query' }],
    })
  })
  it.each([
    'openapi_query_parameter_definition_unsupported',
    'openapi_query_parameter_serialization_unsupported',
    'openapi_query_parameter_schema_unsupported',
  ] as const)('provides a focused fix for %s', (reason) => {
    expect(publicationValidationFix(reason)).toContain('OpenAPI query parameter')
  })
  it.each([
    ['openapi_request_body_parameter_mix_unsupported', 'Separate the JSON request body'],
    ['openapi_response_status_unsupported', 'exactly one explicit 2xx'],
  ] as const)('provides an actionable fix for %s', (reason, expected) => {
    expect(publicationValidationFix(reason)).toContain(expected)
  })

  it('refuses a circular $ref import with the NAMED admit-schema code (not blanket schema_profile_unsupported)', async () => {
    const document = openApiDocument()
    const schema = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    schema.schema = { $ref: '#/components/schemas/Node' }
    const withComponents = document as ReturnType<typeof openApiDocument>
      & { components: Record<string, Record<string, unknown>> }
    withComponents.components = {
      schemas: {
        Node: {
          type: 'object',
          properties: { child: { $ref: '#/components/schemas/Node' } },
        },
      },
    }

    const result = await validateCapabilityPublication(openApiAdmissionSource({ document: withComponents }), dereferenceOpenApiSchema)

    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.reason).toBe('admit_schema_circular_reference')
      expect(result.fix.length).toBeGreaterThan(0)
    }
  })

  it('refuses an unresolvable $ref import with the NAMED admit-schema code', async () => {
    const document = openApiDocument()
    const schema = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    schema.schema = { $ref: '#/components/schemas/Missing' }

    const result = await validateCapabilityPublication(openApiAdmissionSource({ document }), dereferenceOpenApiSchema)

    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.reason).toBe('admit_schema_reference_unresolvable')
      expect(result.fix.length).toBeGreaterThan(0)
    }
  })

  it('passes remote refs through the shared normalizer and preserves named outcomes', async () => {
    const document = openApiDocument()
    const schema = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    schema.schema = { $ref: 'https://schemas.example.test/input' }
    const source = openApiAdmissionSource({ document })
    const resolveRemote: SchemaDereferencer = async (candidate) => {
      if (candidate.$ref === 'https://schemas.example.test/input') return inputSchema()
      throw new Error('unexpected_schema_reference')
    }

    await expect(validateCapabilityPublication(source)).resolves.toMatchObject({
      kind: 'refused', reason: 'admit_schema_deref_unavailable',
    })
    await expect(validateCapabilityPublication(source, dereferenceOpenApiSchema)).resolves.toMatchObject({
      kind: 'refused', reason: 'admit_schema_reference_unresolvable',
    })
    const validation = await validateCapabilityPublication(source, resolveRemote)
    expect(validation).toMatchObject({ kind: 'accepted' })

    const { sourceRevision, ...withoutRevision } = source
    await expect(preparePublicationDraft({
      source: withoutRevision,
      sourceRevision,
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:validate:remote'],
      derefSchema: resolveRemote,
    })).resolves.toMatchObject({ kind: 'prepared' })
  })

  it('is idempotent and side-effect-free (never mutates its input or writes a store)', async () => {
    const source = openApiAdmissionSource()
    const snapshot = structuredClone(source)

    const first = await validateCapabilityPublication(source)
    const second = await validateCapabilityPublication(source)

    expect(second).toEqual(first)
    // No store is touched: the pure command neither mutates its input nor returns handles to it.
    expect(source).toEqual(snapshot)
    expect(await validateCapabilityPublication(source)).toBeInstanceOf(Object)
  })

  it('prepares a local-reference publication with the same dereferencer used by owner preflight', async () => {
    const document = {
      ...openApiDocument(),
      components: { schemas: { Input: inputSchema() } },
    }
    const request = document.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    request.schema = { $ref: '#/components/schemas/Input' }
    const { sourceRevision, ...source } = openApiAdmissionSource({ document })

    const result = await preparePublicationDraft({
      source,
      sourceRevision,
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:validate'],
      derefSchema: dereferenceLocalSchema,
    })
    const validation = await validateCapabilityPublication(
      { ...source, sourceRevision },
      dereferenceLocalSchema,
    )

    expect(result.kind).toBe('prepared')
    if (result.kind === 'prepared') {
      expect(JSON.parse(result.prepared.documentJson).inputSchema).toEqual(inputSchema())
      expect(JSON.parse(result.prepared.sourceDescriptorJson)).toMatchObject({
        openapi: '3.1.0',
        components: { schemas: { Input: inputSchema() } },
      })
      expect(validation).toMatchObject({
        kind: 'accepted',
        sourceDigest: result.prepared.sourceDigest,
      })
    }
  })

  it('binds an MCP source digest to the selected server URL', async () => {
    const result = await preparePublicationDraft({
      source: {
        kind: 'mcp',
        serverUrl: 'https://tools.example.test/mcp',
        protocolVersion: '2025-06-18',
        tool: { name: 'reference_lookup', inputSchema: inputSchema(), outputSchema: outputSchema() },
        contract: contractMetadata('independent.validate-mcp'),
        commercial: commercialInput(),
        evidenceRefs: ['source:validate:mcp'],
      },
      sourceRevision: '2026-08-09/mcp',
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:validate:mcp'],
    })
    expect(result.kind).toBe('prepared')
    if (result.kind === 'prepared') {
      expect(JSON.parse(result.prepared.sourceDescriptorJson)).toMatchObject({
        serverUrl: 'https://tools.example.test/mcp',
        tool: { name: 'reference_lookup' },
      })
    }
  })

  it('refuses an output schema with no guaranteed field via the NAMED admit-schema code', async () => {
    const document = openApiDocument()
    const response = document.paths['/lookup'].post.responses['200']
    const content = response.content['application/json'] as { schema: Record<string, unknown> }
    content.schema = {
      $schema: JSON_SCHEMA,
      // Non-object output can never root a canonical completion-evidence pointer.
      type: 'string',
    }

    const result = await validateCapabilityPublication(openApiAdmissionSource({ document }))

    expect(result.kind).toBe('refused')
    if (result.kind === 'refused') {
      expect(result.reason).toBe('admit_output_no_guaranteed_field')
      expect(result.fix.length).toBeGreaterThan(0)
    }
  })
})

function openApiAdmissionSource(overrides: {
  document?: ReturnType<typeof openApiDocument>
  operation?: { path: string; method: 'get' | 'post' }
  authority?: { kind: 'public_upstream' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string }
} = {}): Extract<CapabilityPublicationAdmissionSource, { kind: 'openapi_http' }> {
  const document = overrides.document ?? openApiDocument()
  const operation = overrides.operation ?? { path: '/lookup', method: 'post' as const }
  return {
    kind: 'openapi_http',
    document,
    operation,
    contract: contractMetadata('independent.validate'),
    commercial: commercialInput(overrides.authority),
    evidenceRefs: ['source:validate'],
    sourceRevision: '2026-08-05/r1',
  }
}

function contractMetadata(capabilityId: string) {
  return {
    capabilityId, version: 1, name: 'Reference lookup', description: 'Looks up one reference.',
    customerAnnotations: [
      { annotationId: 'request', document: 'input' as const, pointer: '/query', label: 'Query', role: 'request' as const },
      { annotationId: 'result', document: 'output' as const, pointer: '/result', label: 'Result', role: 'completion_evidence' as const },
    ],
    dataUse: [{
      effectId: 'release-query', inputPointer: '/query', classification: 'public' as const,
      phase: 'execution' as const, recipient: { kind: 'selected_binding' as const }, purposes: ['lookup'],
    }],
    effects: [{ effectId: 'release-query', class: 'data_release' as const, authority: 'explicit' as const, reversibility: 'irreversible' as const }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' as const }],
    lifecycle: { idempotency: 'required' as const, recovery: 'reconcile_required' as const },
  }
}

function inputSchema() {
  return { $schema: JSON_SCHEMA, type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }
}

function outputSchema() {
  return { $schema: JSON_SCHEMA, type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false }
}

function commercialInput(authority: { kind: 'public_upstream' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string } = {
  kind: 'public_upstream',
}) {
  return {
    offering: {
      offeringId: 'offering:independent:validate', networkId: 'ae:public',
      presentation: {
        label: 'Reference lookup', summary: 'Returns one structured result.',
        price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: '1200', exponent: 2 } },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const, summary: 'No commercial influence.', influencesEligibility: false,
          influencesInclusion: false, influencesOrder: false, evidenceRefs: ['commercial:none'],
        },
      },
      searchTerms: ['reference'], registrationEvidenceRefs: ['registration:offering'],
    },
    bindingId: 'binding:independent:validate', authority,
    registrationEvidenceRefs: ['registration:binding'], requestTimeoutMs: 5_000,
  }
}

function openApiDocument() {
  return {
    openapi: '3.1.0', info: { title: 'Reference API', version: '1' },
    servers: [{ url: 'https://api.example.test' }],
    paths: {
      '/lookup': { post: {
        requestBody: { content: { 'application/json': { schema: inputSchema() } } },
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      } },
    },
  }
}
