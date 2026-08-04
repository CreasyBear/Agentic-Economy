import { describe, expect, it } from 'vitest'

import {
  admitRegisteredTransport,
  importMcpCapability,
  importOpenApiHttpCapability,
  importX402Capability,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'

const JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

describe('capability publication importers', () => {
  it('normalizes OpenAPI 3.1 POST JSON through the canonical publication draft', () => {
    const result = importOpenApiHttpCapability({
      kind: 'openapi_http',
      document: openApiDocument(),
      operation: { path: '/lookup', method: 'post' },
      contract: contractMetadata('independent.lookup'),
      commercial: commercialInput(),
      evidenceRefs: ['source:openapi'],
    })

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        source: { kind: 'openapi_http', selector: { path: '/lookup', method: 'post' } },
        binding: {
          endpointUrl: 'https://api.example.test/lookup',
          adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        capabilityId: 'independent.lookup', inputSchema: inputSchema(), outputSchema: outputSchema(),
      })
      expect(result.draft.source.descriptorDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  it('normalizes and admits OpenAPI 3.1 GET with an exact query mapping', () => {
    const document = openApiDocument()
    document.paths['/lookup'] = {
      get: {
        parameters: [
          { in: 'query', name: 'query', required: true, schema: { type: 'string', minLength: 1 } },
        ],
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      },
    } as never
    const result = importOpenApiHttpCapability({
      kind: 'openapi_http',
      document,
      operation: { path: '/lookup', method: 'get' },
      contract: contractMetadata('independent.lookup-get'),
      commercial: commercialInput(),
      evidenceRefs: ['source:openapi:get'],
    })
    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        source: { selector: { path: '/lookup', method: 'get' } },
        binding: {
          adapter: {
            adapterId: 'http-json:v1',
            config: {
              method: 'GET',
              query: [{ inputPointer: '/query', parameter: 'query' }],
            },
          },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(admitRegisteredTransport({
        adapterId: result.draft.binding.adapter.adapterId,
        endpointUrl: result.draft.binding.endpointUrl,
        credentialRef: result.draft.binding.credentialRef,
        continuation: result.draft.binding.continuation,
        cancellation: result.draft.binding.cancellation,
        config: result.draft.binding.adapter.config,
      })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'http-json:v1' } })
    }
  })

  it('maps an admitted OpenAPI query name to a distinct contract input name', () => {
    const document = openApiDocument()
    document.paths['/lookup'] = {
      get: {
        parameters: [
          {
            in: 'query',
            name: 'quotes',
            'x-ae-input-name': 'quote',
            required: true,
            schema: { type: 'string', pattern: '^[A-Z]{3}$' },
          },
        ],
        responses: { '200': { content: { 'application/json': { schema: outputSchema() } } } },
      },
    } as never
    const result = importOpenApiHttpCapability({
      kind: 'openapi_http',
      document: JSON.parse(JSON.stringify(document)) as unknown,
      contract: {
        ...contractMetadata('independent.lookup-query-alias'),
        customerAnnotations: [
          { annotationId: 'request', document: 'input', pointer: '/quote', label: 'Quote', role: 'request' },
          { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
        ] as const,
        dataUse: [{
          effectId: 'release-query', inputPointer: '/quote', classification: 'public',
          phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['lookup'],
        }] as const,
      },
      operation: { path: '/lookup', method: 'get' },
      commercial: commercialInput(),
      evidenceRefs: ['source:openapi:query-alias'],
    })

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          adapter: {
            config: {
              query: [{ inputPointer: '/quote', parameter: 'quotes' }],
            },
          },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        inputSchema: {
          properties: { quote: { type: 'string', pattern: '^[A-Z]{3}$' } },
          required: ['quote'],
        },
      })
    }
  })

  it('normalizes one MCP tool with a distinct admitted JSON-RPC transport', () => {
    const result = importMcpCapability({
      kind: 'mcp',
      serverUrl: 'https://tools.example.test/mcp',
      protocolVersion: '2025-06-18',
      tool: { name: 'reference_lookup', inputSchema: inputSchema(), outputSchema: outputSchema() },
      contract: contractMetadata('independent.mcp-lookup'),
      commercial: commercialInput(),
      evidenceRefs: ['source:mcp'],
    })

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        source: { kind: 'mcp', selector: { toolName: 'reference_lookup', protocolVersion: '2025-06-18' } },
        binding: {
          endpointUrl: 'https://tools.example.test/mcp',
          adapter: {
            adapterId: 'mcp-jsonrpc:v1',
            config: { protocolVersion: '2025-06-18', toolName: 'reference_lookup', requestTimeoutMs: 5_000 },
          },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(admitRegisteredTransport({
        adapterId: result.draft.binding.adapter.adapterId,
        endpointUrl: result.draft.binding.endpointUrl,
        credentialRef: result.draft.binding.credentialRef,
        continuation: result.draft.binding.continuation,
        cancellation: result.draft.binding.cancellation,
        config: result.draft.binding.adapter.config,
      })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'mcp-jsonrpc:v1' } })
    }
  })

  it('normalizes x402 metadata into its registered bounded transport', () => {
    const result = importX402Capability({
      kind: 'x402',
      resource: {
        resourceUrl: 'https://api.example.test/lookup',
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
        price: { currency: 'AUD', amountMinor: 1_200 },
        scheme: 'exact', network: 'eip155:84532',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        routeAmountExponent: 2, assetAmountExponent: 6,
      },
      contract: contractMetadata('independent.x402-lookup'),
      commercial: commercialInput({ price: { kind: 'fixed', currency: 'AUD', amountMinor: 1_200 } }),
      evidenceRefs: ['source:x402'],
    })

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        source: { kind: 'x402', selector: { resourceUrl: 'https://api.example.test/lookup' } },
        offering: { presentation: { price: { kind: 'fixed', currency: 'AUD', amountMinor: 1_200 } } },
        binding: { adapter: { adapterId: 'x402-fetch:v2' } },
      },
    })
    if (result.kind === 'normalized') {
      expect(result.draft.documentJson).not.toMatch(/payment|settlement|wallet/i)
      expect(result.draft.binding.adapter.config).toMatchObject({
        scheme: 'exact', network: 'eip155:84532', currency: 'AUD',
      })
    }
  })

  it.each(['GET', 'POST'] as const)('normalizes and admits x402 %s without widening payment material', (method) => {
    const result = importX402Capability({
      kind: 'x402',
      resource: {
        resourceUrl: 'https://api.example.test/lookup',
        method,
        ...(method === 'GET'
          ? { query: [{ inputPointer: '/query', parameter: 'query' }] }
          : {}),
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
        price: { currency: 'AUD', amountMinor: 1_200 },
        scheme: 'exact', network: 'eip155:84532',
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
        routeAmountExponent: 2, assetAmountExponent: 6,
      },
      contract: contractMetadata(`independent.x402-${method.toLowerCase()}`),
      commercial: commercialInput({ price: { kind: 'fixed', currency: 'AUD', amountMinor: 1_200 } }),
      evidenceRefs: [`source:x402:${method}`],
    })
    expect(result).toMatchObject({
      kind: 'normalized',
      draft: { binding: { adapter: { config: { method } } } },
    })
    if (result.kind === 'normalized') {
      expect(admitRegisteredTransport({
        adapterId: result.draft.binding.adapter.adapterId,
        endpointUrl: result.draft.binding.endpointUrl,
        credentialRef: result.draft.binding.credentialRef,
        continuation: result.draft.binding.continuation,
        cancellation: result.draft.binding.cancellation,
        config: result.draft.binding.adapter.config,
      })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'x402-fetch:v2' } })
    }
  })

  it('dispatches direct envelopes without changing their canonical material', () => {
    const documentJson = JSON.stringify({
      contractFormat: 'ae.capability-contract:v2', ...contractMetadata('independent.direct'),
      inputSchema: inputSchema(), outputSchema: outputSchema(),
    })
    const result = normalizeCapabilityPublication({
      kind: 'ae_envelope', documentJson, offering: commercialInput().offering,
      binding: directBinding(), evidenceRefs: ['source:direct'],
    })
    expect(result).toMatchObject({ kind: 'normalized', draft: { source: { kind: 'ae_envelope' } } })
  })

  it('fails closed on remote refs, insecure endpoints, ambiguous OpenAPI servers, and inconsistent x402 price', () => {
    const remote = openApiDocument()
    const remoteSchema = remote.paths['/lookup'].post.requestBody.content['application/json'] as {
      schema: Record<string, unknown>
    }
    remoteSchema.schema = { $ref: 'https://evil.test/schema' }
    expect(importOpenApiHttpCapability({
      kind: 'openapi_http', document: remote, operation: { path: '/lookup', method: 'post' },
      contract: contractMetadata('independent.remote'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })).toEqual({ kind: 'refused', reason: 'schema_profile_unsupported' })

    expect(importMcpCapability({
      kind: 'mcp', serverUrl: 'http://tools.example.test/mcp', protocolVersion: '2025-06-18',
      tool: { name: 'lookup', inputSchema: inputSchema(), outputSchema: outputSchema() },
      contract: contractMetadata('independent.insecure'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })).toEqual({ kind: 'refused', reason: 'transport_unsupported' })

    const ambiguous = openApiDocument()
    ambiguous.servers.push({ url: 'https://other.example.test' })
    expect(importOpenApiHttpCapability({
      kind: 'openapi_http', document: ambiguous, operation: { path: '/lookup', method: 'post' },
      contract: contractMetadata('independent.ambiguous'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })).toEqual({ kind: 'refused', reason: 'transport_unsupported' })

    expect(importX402Capability({
      kind: 'x402',
      resource: { resourceUrl: 'https://api.example.test/lookup', inputSchema: inputSchema(), outputSchema: outputSchema(), price: { currency: 'USD', amountMinor: 1_200 } },
      contract: contractMetadata('independent.price-conflict'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })).toEqual({ kind: 'refused', reason: 'commercial_metadata_inconsistent' })
  })

  it('produces stable descriptor identity regardless of object key order', () => {
    const first = importOpenApiHttpCapability({
      kind: 'openapi_http', document: openApiDocument(), operation: { path: '/lookup', method: 'post' },
      contract: contractMetadata('independent.stable'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })
    const document = openApiDocument()
    const reordered = { paths: document.paths, servers: document.servers, info: document.info, openapi: document.openapi }
    const second = importOpenApiHttpCapability({
      kind: 'openapi_http', document: reordered, operation: { path: '/lookup', method: 'post' },
      contract: contractMetadata('independent.stable'), commercial: commercialInput(), evidenceRefs: ['source:test'],
    })
    expect(first.kind).toBe('normalized')
    expect(second.kind).toBe('normalized')
    if (first.kind === 'normalized' && second.kind === 'normalized') {
      expect(first.draft.source.descriptorDigest).toBe(second.draft.source.descriptorDigest)
      expect(first.draft.documentJson).toBe(second.draft.documentJson)
    }
  })

  it.each([
    'https://localhost/lookup',
    'https://127.0.0.1/lookup',
    'https://[::1]/lookup',
    'https://10.0.0.1/lookup',
    'https://172.16.0.1/lookup',
    'https://192.168.1.1/lookup',
    'https://169.254.169.254/latest/meta-data',
    'https://2130706433/lookup',
    'https://0x7f000001/lookup',
  ])('rejects statically private transport target %s at import and admission', (endpointUrl) => {
    expect(importMcpCapability({
      kind: 'mcp', serverUrl: endpointUrl, protocolVersion: '2025-06-18',
      tool: { name: 'lookup', inputSchema: inputSchema(), outputSchema: outputSchema() },
      contract: contractMetadata('independent.private-target'),
      commercial: commercialInput(), evidenceRefs: ['source:test'],
    })).toEqual({ kind: 'refused', reason: 'transport_unsupported' })

    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1', endpointUrl, credentialRef: 'env:CAPABILITY_KEY',
      continuation: { kind: 'single_response', evidenceRefs: ['transport:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['transport:no-cancellation'] },
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })
})

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

function commercialInput(overrides: { price?: { kind: 'fixed'; currency: string; amountMinor: number } } = {}) {
  return {
    offering: {
      offeringId: 'offering:independent:lookup', networkId: 'ae:public',
      presentation: {
        label: 'Reference lookup', summary: 'Returns one structured result.',
        price: overrides.price ?? { kind: 'fixed' as const, currency: 'AUD', amountMinor: 1_200 },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const, summary: 'No commercial influence.', influencesEligibility: false,
          influencesInclusion: false, influencesOrder: false, evidenceRefs: ['commercial:none'],
        },
      },
      searchTerms: ['reference'], registrationEvidenceRefs: ['registration:offering'],
    },
    bindingId: 'binding:independent:lookup', credentialRef: 'env:CAPABILITY_KEY',
    registrationEvidenceRefs: ['registration:binding'], requestTimeoutMs: 5_000,
  }
}

function directBinding() {
  return {
    bindingId: 'binding:independent:lookup', endpointUrl: 'https://api.example.test/lookup',
    credentialRef: 'env:CAPABILITY_KEY',
    continuation: { kind: 'single_response' as const, evidenceRefs: ['transport:response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['transport:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['registration:binding'],
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
