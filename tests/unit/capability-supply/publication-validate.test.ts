import { describe, expect, it } from 'vitest'

import {
  validateCapabilityPublication,
} from '@/modules/capability-supply/internal/publication/validate'
import { dereferenceOpenApiSchema } from '@/modules/capability-supply/internal/schema-deref'
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
      expect(result.sourceDigest).toBe(result.normalized.source.descriptorDigest)
    }
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
  authority?: { kind: 'keyless' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string }
} = {}): CapabilityPublicationAdmissionSource {
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

function commercialInput(authority: { kind: 'keyless' } | { kind: 'provider_connection'; connectionRef: string; providerRef: string } = {
  kind: 'provider_connection', connectionRef: 'connection:validate', providerRef: 'provider:validate',
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
