import { describe, expect, it } from 'vitest'

import {
  admitPublicationDraft,
  preparePublicationDraft,
  publicationMaterialContainsCredential,
  validateCapabilityPublication,
  type CapabilityPublicationAdmissionSource,
} from '@/modules/capability-supply/public'

const JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

describe('capability publication validate (credential material)', () => {
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
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
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
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:validate:input-example'],
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
  })
  it('refuses direct-envelope fixed-query credential material at both preparation and admission', async () => {
    const baseline = await preparePublicationDraft({
      source: openApiAdmissionSource(),
      sourceRevision: '2026-08-10/baseline',
      pricingConfig: {
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
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
        version: 'pricing:v3', kind: 'fixed_aud', currency: 'AUD', exponent: 6,
        amountUnits: '12000000',
      },
      evidenceRefs: ['source:validate:direct-secret'],
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })

    await expect(admitPublicationDraft({
      prepared: { ...baseline.prepared, binding: bindingWithSecret },
      businessId: 'business:independent',
    })).resolves.toEqual({ kind: 'refused', reason: 'source_invalid' })
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
