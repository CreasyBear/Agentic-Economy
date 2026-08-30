import { describe, expect, it } from 'vitest'

import {
  admitPublicationDraft,
  preparePublicationDraft,
  publicationValidationFix,
  validateCapabilityPublication,
} from '@/modules/capability-supply/internal/publication'
import { dereferenceOpenApiSchema } from '@/modules/capability-supply/internal/schema-deref'
import { dereferenceLocalSchema } from '@/modules/capability-supply/convex'
import { publicationMaterialContainsCredential } from '@/modules/capability-supply/internal/publication/source'
import type { SchemaDereferencer } from '@/modules/capability-supply/internal/admit-provider-schema'
import type { CapabilityPublicationAdmissionSource } from '@/modules/capability-supply/internal/publication/admit'

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
  it('rejects real bearer/basic credentials without rejecting authentication prose', () => {
    expect(publicationMaterialContainsCredential('Uses a bearer API key issued by the provider.')).toBe(false)
    expect(publicationMaterialContainsCredential('Authorization: Bearer opaque-provider-credential-123456')).toBe(true)
    expect(publicationMaterialContainsCredential('Authorization: Basic opaque-provider-credential-123456')).toBe(true)
    expect(publicationMaterialContainsCredential({
      parameter: 'trace',
      value: 'bearer API key',
    })).toBe(false)
    expect(publicationMaterialContainsCredential({
      parameter: 'trace',
      value: 'bearer opaque-provider-credential-123456',
    })).toBe(true)
  })

  it.each([
    'next_token',
  ])('accepts the public pagination query input mapping %s', (parameter) => {
    expect(publicationMaterialContainsCredential({
      inputPointer: `/${parameter}`,
      parameter,
    })).toBe(false)
  })

  it.each([
    'token',
    'access_token',
    'api_key',
    'authorization',
    'signature',
  ])('rejects the credential query input mapping %s', (parameter) => {
    expect(publicationMaterialContainsCredential({
      inputPointer: `/${parameter}`,
      parameter,
    })).toBe(true)
  })

  it('keeps the next_token exception dynamic and rejects fixed secret material', () => {
    expect(publicationMaterialContainsCredential({
      parameter: 'next_token',
      value: 'opaquePaginationCredentialValueThatMustNotPersist',
    })).toBe(true)
    expect(publicationMaterialContainsCredential({
      resourceUrl: 'https://api.example.test/search?next_token=fixed',
    })).toBe(true)
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
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: ['source:validate:remote'],
      derefSchema: resolveRemote,
    })).resolves.toMatchObject({ kind: 'prepared' })
  })

  it('extracts an apiKey-in-query security-scheme credential so the key is never a dynamic input', async () => {
    const document = openApiDocument()
    document.paths['/lookup'] = {
      get: {
        security: [{ apiKey: [] }],
        parameters: [
          { in: 'query', name: 'api_key', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'query', required: true, schema: { type: 'string', minLength: 1 } },
        ],
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      },
    } as never
    const withComponents = document as ReturnType<typeof openApiDocument>
      & { components: Record<string, Record<string, unknown>> }
    withComponents.components = {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'query', name: 'api_key' },
      },
    }

    const result = await validateCapabilityPublication(openApiAdmissionSource({
      document: withComponents,
      operation: { path: '/lookup', method: 'get' },
      authority: { kind: 'provider_connection', connectionRef: 'connection:validate', providerRef: 'provider:validate' },
    }))

    expect(result.kind).toBe('accepted')
    if (result.kind === 'accepted') {
      expect(result.normalized.binding.authority).toEqual({
        kind: 'provider_connection',
        connectionRef: 'connection:validate',
        providerRef: 'provider:validate',
      })
      // The api_key parameter is stripped from the dynamic input schema.
      expect(JSON.parse(result.normalized.documentJson).inputSchema).toMatchObject({
        properties: { query: { type: 'string', minLength: 1 } },
        required: ['query'],
      })
    }
  })
  it.each([
    ['a secret-bearing server URL', (document: ReturnType<typeof openApiDocument>) => {
      const server = document.servers[0]
      if (server === undefined) throw new Error('test OpenAPI server missing')
      server.url = 'https://api.example.test?api_key=sk_live_do_not_persist'
    }],
    ['a signature-bearing server URL', (document: ReturnType<typeof openApiDocument>) => {
      const server = document.servers[0]
      if (server === undefined) throw new Error('test OpenAPI server missing')
      server.url = 'https://api.example.test?sig=opaque-signature'
    }],
    ['a URL with userinfo', (document: ReturnType<typeof openApiDocument>) => {
      const server = document.servers[0]
      if (server === undefined) throw new Error('test OpenAPI server missing')
      server.url = 'https://user:password@api.example.test'
    }],
    ['a credential-bearing extension', (document: ReturnType<typeof openApiDocument>) => {
      Object.assign(document.info, { 'x-provider-token': 'opaque-provider-credential' })
    }],
  ])('refuses %s before source material can be persisted', async (_label, mutate) => {
    const document = openApiDocument()
    mutate(document)
    const admissionSource = openApiAdmissionSource({ document })
    const { sourceRevision, ...source } = admissionSource

    await expect(validateCapabilityPublication(admissionSource)).resolves.toMatchObject({
      kind: 'refused',
      reason: 'source_invalid',
    })
    await expect(preparePublicationDraft({
      source,
      sourceRevision,
      pricingConfig: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: ['source:validate'],
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
  })
  it('refuses a credential-bearing contract input example before preparation', async () => {
    const admissionSource = openApiAdmissionSource()
    const sourceWithSecretExample = {
      ...admissionSource,
      contract: {
        ...admissionSource.contract,
        inputExamples: [{ label: 'credential', input: { api_key: 'opaque-provider-secret' } }],
      },
    }
    const { sourceRevision, ...source } = sourceWithSecretExample

    await expect(preparePublicationDraft({
      source,
      sourceRevision,
      pricingConfig: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: ['source:validate:input-example'],
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
  })
  it('refuses direct-envelope fixed-query credential material at both preparation and admission', async () => {
    const baseline = await preparePublicationDraft({
      source: openApiAdmissionSource(),
      sourceRevision: '2026-08-10/baseline',
      pricingConfig: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: ['source:validate:baseline'],
    })
    if (baseline.kind !== 'prepared') throw new Error(`baseline_refused:${baseline.reason}`)

    const bindingWithSecret = {
      ...baseline.prepared.binding,
      adapter: {
        ...baseline.prepared.binding.adapter,
        config: { fixedQuery: [{ parameter: 'sig', value: 'opaque-signature' }] },
      },
    }
    const directSource = {
      kind: 'ae_envelope' as const,
      documentJson: baseline.prepared.documentJson,
      offering: baseline.prepared.offering,
      binding: bindingWithSecret,
      evidenceRefs: ['source:validate:direct-secret'],
    }
    await expect(preparePublicationDraft({
      source: directSource,
      sourceRevision: '2026-08-10/direct-secret',
      pricingConfig: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
      },
      evidenceRefs: ['source:validate:direct-secret'],
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })

    await expect(admitPublicationDraft({
      prepared: { ...baseline.prepared, binding: bindingWithSecret },
      businessId: 'business:independent',
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
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
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
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
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '1200', exponent: 2 },
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
