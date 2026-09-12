import { describe, expect, it, vi } from 'vitest'

import { discoverMcpSource, previewSupplySource } from '@/modules/capability-supply/source-preview'
import { sourceRouteRef } from '@/modules/capability-supply/convex'

const responseSchema = {
  type: 'object',
  properties: { result: { type: 'string' } },
  required: ['result'],
  additionalProperties: false,
} as const

function openApiDocument() {
  return {
    openapi: '3.0.3',
    info: { title: 'Reference API', version: '2026-09-04' },
    servers: [{ url: 'https://provider.example' }],
    components: {
      securitySchemes: {
        ProviderKey: { type: 'apiKey', in: 'header', name: 'X-Provider-Key' },
      },
    },
    paths: {
      '/public': {
        get: {
          operationId: 'publicLookup',
          summary: 'Public lookup',
          description: 'Returns one public result.',
          responses: {
            '200': { description: 'Lookup result', content: { 'application/json': { schema: responseSchema } } },
          },
        },
      },
      '/protected': {
        post: {
          operationId: 'protectedLookup',
          summary: 'Protected lookup',
          description: 'Returns one protected result.',
          security: [{ ProviderKey: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                  required: ['query'],
                  additionalProperties: false,
                },
                example: { query: 'example' },
              },
            },
          },
          responses: {
            '200': { description: 'Lookup result', content: { 'application/json': { schema: responseSchema } } },
          },
        },
      },
      '/unsupported': {
        put: {
          operationId: 'unsupportedUpdate',
          summary: 'Unsupported update',
          responses: {
            '200': { description: 'Update result', content: { 'application/json': { schema: responseSchema } } },
          },
        },
      },
    },
  }
}

describe('supply source preview', () => {
  it('derives one stable source route identity from native endpoint facts', () => {
    const first = sourceRouteRef({
      sourceKind: 'openapi_http',
      sourceSelector: { path: '/lookup', method: 'post' },
      sourceDescriptorJson: '{}',
      endpointUrl: 'https://TOOLS.example:443/lookup#fragment',
    })
    const replay = sourceRouteRef({
      sourceKind: 'openapi_http',
      sourceSelector: { path: 'lookup', method: 'post' },
      sourceDescriptorJson: '{"different":"document"}',
      endpointUrl: 'https://tools.example/other',
    })
    const differentMethod = sourceRouteRef({
      sourceKind: 'openapi_http',
      sourceSelector: { path: '/lookup', method: 'get' },
      sourceDescriptorJson: '{}',
      endpointUrl: 'https://tools.example/lookup',
    })

    expect(first).toBe(replay)
    expect(first).not.toBe(differentMethod)
  })
  it('turns an OpenAPI URL into bounded exact candidates without publishing or invoking', async () => {
    const loadOpenApi = vi.fn().mockResolvedValue(openApiDocument())

    const result = await previewSupplySource({
      kind: 'openapi',
      definitionUrl: 'https://provider.example/openapi.yaml',
      environment: 'sandbox',
    }, { loadOpenApi })

    expect(result).toMatchObject({
      kind: 'ready',
      sourceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      sourceRevision: expect.stringMatching(/^openapi:sha256:[0-9a-f]{64}$/u),
      provenance: {
        sourceKind: 'openapi',
        sourceUrl: 'https://provider.example/openapi.yaml',
      },
      candidates: [
        {
          sourceSelector: { serverUrl: 'https://provider.example/', path: '/public', method: 'get' },
          title: 'Public lookup',
          description: 'Returns one public result.',
          authentication: { kind: 'public' },
          disposition: { kind: 'supported' },
        },
        {
          sourceSelector: { serverUrl: 'https://provider.example/', path: '/protected', method: 'post' },
          title: 'Protected lookup',
          authentication: { kind: 'api_key', location: 'header', name: 'X-Provider-Key' },
          validationExampleAvailable: true,
          disposition: { kind: 'supported' },
        },
        {
          sourceSelector: { serverUrl: 'https://provider.example/', path: '/unsupported', method: 'put' },
          title: 'Unsupported update',
          disposition: { kind: 'unsupported', reason: 'openapi_operation_unsupported' },
        },
      ],
    })
    if (result.kind !== 'ready') return
    expect(result.candidates[0]?.inputSchema).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    })
    expect(result.candidates[1]?.outputSchema).toEqual(responseSchema)
    expect(new Set(result.candidates.map(({ candidateRef }) => candidateRef)).size).toBe(3)
    expect(loadOpenApi).toHaveBeenCalledTimes(1)
  })

  it('returns one source-native correction when the URL cannot be loaded', async () => {
    const result = await previewSupplySource({
      kind: 'openapi',
      definitionUrl: 'https://provider.example/openapi.yaml',
      environment: 'production',
    }, {
      loadOpenApi: vi.fn().mockRejectedValue(new Error('upstream unavailable')),
    })

    expect(result).toEqual({
      kind: 'action_required',
      requiredAction: {
        action: 'supply.source.preview',
        blockedCapabilities: ['supply.publish'],
        cta: null,
        ctaLabel: 'Check source',
        description: 'Make the OpenAPI document available at the same public HTTPS URL, then preview it again.',
        iconUrl: null,
        status: 'required',
        title: 'OpenAPI source unavailable',
      },
    })
  })

  it('derives an x402 candidate and payment facts from the live signed challenge inspection', async () => {
    const inspectX402 = vi.fn().mockResolvedValue({
      kind: 'observed',
      authority: 'observed_external',
      canonical: false,
      usageVerified: false,
      endpoint: { endpointId: 'endpoint:one', url: 'https://provider.example/paid' },
      backend: { backendId: 'backend:one', method: 'POST', resource: 'https://provider.example/paid' },
      payment: {
        profile: 'base_sepolia_usdc_exact_eip3009',
        accepts: [{
          alternativeId: 'alternative:one', scheme: 'exact', network: 'eip155:84532',
          amount: '1000000', asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002', maxTimeoutSeconds: 60,
          extra: {}, supportedByAe: true,
        }],
        selection: { kind: 'selected', alternativeId: 'alternative:one' },
      },
      discovery: {
        kind: 'admitted',
        method: 'POST',
        inputSchema: {
          type: 'object', properties: { query: { type: 'string' } },
          required: ['query'], additionalProperties: false,
        },
        inputExample: { query: 'example' },
        outputSchema: responseSchema,
      },
      probe: { status: 'payment_required', httpStatus: 402, observedAt: 10 },
      digest: `sha256:${'2'.repeat(64)}`,
    })

    const result = await previewSupplySource({
      kind: 'x402',
      resourceUrl: 'https://provider.example/paid',
      method: 'POST',
      environment: 'sandbox',
    }, { inspectX402 })

    expect(result).toMatchObject({
      kind: 'ready',
      sourceDigest: `sha256:${'2'.repeat(64)}`,
      provenance: { sourceKind: 'x402', sourceUrl: 'https://provider.example/paid' },
      candidates: [{
        sourceSelector: { resourceUrl: 'https://provider.example/paid', method: 'POST' },
        authentication: { kind: 'x402_wallet' },
        validationExampleAvailable: true,
        disposition: { kind: 'supported' },
        x402: {
          scheme: 'exact', network: 'eip155:84532', amount: '1000000',
          asset: '0x0000000000000000000000000000000000000001',
          payTo: '0x0000000000000000000000000000000000000002',
        },
      }],
    })
    expect(inspectX402).toHaveBeenCalledWith({
      endpointUrl: 'https://provider.example/paid',
      method: 'POST',
      aeEnvironment: 'sandbox',
    })
  })

  it('maps official MCP tool discovery and keeps a missing output schema visible as one correction', async () => {
    const discoverMcp = vi.fn().mockResolvedValue({
      kind: 'ready',
      serverUrl: 'https://tools.example/mcp',
      protocolVersion: '2025-11-25',
      sourceDigest: `sha256:${'3'.repeat(64)}`,
      tools: [
        {
          name: 'lookup',
          title: 'Reference lookup',
          description: 'Looks up one reference.',
          inputSchema: {
            type: 'object', properties: { query: { type: 'string' } },
            required: ['query'], additionalProperties: false,
          },
          outputSchema: responseSchema,
        },
        {
          name: 'legacy_lookup',
          description: 'Has no declared output schema.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
    })

    const result = await previewSupplySource({
      kind: 'mcp',
      serverUrl: 'https://tools.example/mcp',
      environment: 'production',
    }, { discoverMcp })

    expect(result).toMatchObject({
      kind: 'ready',
      sourceDigest: `sha256:${'3'.repeat(64)}`,
      provenance: { sourceKind: 'mcp', sourceUrl: 'https://tools.example/mcp' },
      authentication: [{ kind: 'public' }],
      candidates: [
        {
          sourceSelector: { serverUrl: 'https://tools.example/mcp', toolName: 'lookup', protocolVersion: '2025-11-25' },
          title: 'Reference lookup',
          disposition: { kind: 'supported' },
        },
        {
          sourceSelector: { serverUrl: 'https://tools.example/mcp', toolName: 'legacy_lookup', protocolVersion: '2025-11-25' },
          disposition: { kind: 'unsupported', reason: 'schema_missing' },
        },
      ],
    })
  })

  it('keeps authenticated MCP candidates connected to their OAuth requirement', async () => {
    const result = await previewSupplySource({
      kind: 'mcp',
      serverUrl: 'https://tools.example/mcp',
      environment: 'production',
    }, {
      mcpAuthentication: { kind: 'mcp_oauth' },
      discoverMcp: vi.fn().mockResolvedValue({
        kind: 'ready',
        serverUrl: 'https://tools.example/mcp',
        protocolVersion: '2025-11-25',
        sourceDigest: `sha256:${'8'.repeat(64)}`,
        tools: [{
          name: 'lookup',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        }],
      }),
    })

    expect(result).toMatchObject({
      kind: 'ready',
      authentication: [{ kind: 'mcp_oauth' }],
      candidates: [{ authentication: { kind: 'mcp_oauth' } }],
    })
  })

  it('uses the official MCP client to initialize and read every public tools page without invoking a tool', async () => {
    const observedMethods: string[] = []
    const send = vi.fn(async (request: Request) => {
      if (request.method === 'DELETE') return new Response(null, { status: 200 })
      const body = JSON.parse(await request.text()) as {
        id?: number
        method?: string
        params?: { cursor?: string }
      }
      if (body.method !== undefined) observedMethods.push(body.method)
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'reference', version: '1' },
          },
        }, { headers: { 'Mcp-Session-Id': 'session:preview' } })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
      if (body.method === 'tools/list' && body.params?.cursor === undefined) {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: {
            tools: [{
              name: 'first', inputSchema: { type: 'object' }, outputSchema: responseSchema,
            }],
            nextCursor: 'page:2',
          },
        }, { headers: { 'Mcp-Session-Id': 'session:registry-preview' } })
      }
      if (body.method === 'tools/list' && body.params?.cursor === 'page:2') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: {
            tools: [{
              name: 'second', inputSchema: { type: 'object' }, outputSchema: responseSchema,
            }],
          },
        }, { headers: { 'Mcp-Session-Id': 'session:registry-preview' } })
      }
      throw new Error(`unexpected MCP request: ${body.method ?? request.method}`)
    })

    const result = await discoverMcpSource({
      serverUrl: 'https://tools.example/mcp',
      environment: 'production',
    }, { isPublicTarget: async () => true, send })

    expect(result).toMatchObject({
      kind: 'ready',
      serverUrl: 'https://tools.example/mcp',
      protocolVersion: '2025-11-25',
      tools: [{ name: 'first' }, { name: 'second' }],
    })
    expect(send.mock.calls.some(([request]) => request.method === 'DELETE')).toBe(true)
    expect(observedMethods).not.toContain('tools/call')
  })

  it('returns one hosted connection action when the official MCP client receives an OAuth challenge', async () => {
    const result = await discoverMcpSource({
      serverUrl: 'https://tools.example/mcp',
      environment: 'production',
    }, {
      isPublicTarget: async () => true,
      send: async () => new Response(null, {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer resource_metadata="https://tools.example/.well-known/oauth-protected-resource"',
        },
      }),
    })

    expect(result).toEqual({
      kind: 'authentication_required',
      authenticationUrl: '/owner/offerings?source=mcp&serverUrl=https%3A%2F%2Ftools.example%2Fmcp',
      serverUrl: 'https://tools.example/mcp',
    })
  })

  it('projects exact active MCP Registry provenance from a registry-located remote', async () => {
    const result = await previewSupplySource({
      kind: 'mcp',
      registryName: 'io.example/reference-tools',
      environment: 'production',
    }, {
      discoverMcp: vi.fn().mockResolvedValue({
        kind: 'ready',
        serverUrl: 'https://tools.example/mcp',
        registryName: 'io.example/reference-tools',
        verifiedNamespace: true,
        protocolVersion: '2025-11-25',
        sourceDigest: `sha256:${'5'.repeat(64)}`,
        tools: [{
          name: 'lookup', inputSchema: { type: 'object' }, outputSchema: responseSchema,
        }],
      }),
    })

    expect(result).toMatchObject({
      kind: 'ready',
      provenance: {
        sourceKind: 'mcp',
        sourceUrl: 'https://tools.example/mcp',
        authority: 'verified_registry',
      },
    })
  })

  it('reads Registry metadata without contacting an endpoint until one exact remote is selected', async () => {
    const endpointRequests: string[] = []
    const send = vi.fn(async (request: Request) => {
      const url = new URL(request.url)
      if (url.hostname === 'registry.modelcontextprotocol.io') {
        return Response.json({
          server: {
            $schema: 'https://static.modelcontextprotocol.io/schemas/2026-07-29/server.schema.json',
            name: 'io.example/reference-tools',
            version: '1.0.0',
            remotes: [
              { type: 'streamable-http', url: 'https://east.tools.example/mcp' },
              { type: 'streamable-http', url: 'https://west.tools.example/mcp' },
            ],
          },
          _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } },
        })
      }
      endpointRequests.push(request.url)
      if (request.method === 'DELETE') return new Response(null, { status: 200 })
      const body = JSON.parse(await request.text()) as { id?: number; method?: string }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'reference', version: '1' },
          },
        }, { headers: { 'Mcp-Session-Id': 'session:registry-preview' } })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: { tools: [{ name: 'lookup', inputSchema: { type: 'object' }, outputSchema: responseSchema }] },
        })
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    })

    const metadata = await discoverMcpSource({
      registryName: 'io.example/reference-tools',
      environment: 'production',
    }, { isPublicTarget: async () => true, send })

    expect(metadata).toMatchObject({
      kind: 'remote_selection_required',
      registryName: 'io.example/reference-tools',
      remotes: [
        { remoteRef: expect.stringMatching(/^sha256:/u), serverUrl: 'https://east.tools.example/mcp' },
        { remoteRef: expect.stringMatching(/^sha256:/u), serverUrl: 'https://west.tools.example/mcp' },
      ],
    })
    expect(endpointRequests).toEqual([])
    if (metadata.kind !== 'remote_selection_required') return

    const selected = metadata.remotes[1]
    if (selected === undefined) throw new Error('expected second Registry remote')
    const discovered = await discoverMcpSource({
      registryName: 'io.example/reference-tools',
      remoteRef: selected.remoteRef,
      environment: 'production',
    }, { isPublicTarget: async () => true, send })

    expect(discovered).toMatchObject({
      kind: 'ready',
      serverUrl: 'https://west.tools.example/mcp',
      registryName: 'io.example/reference-tools',
      verifiedNamespace: true,
      tools: [{ name: 'lookup' }],
    })
    expect(endpointRequests.length).toBeGreaterThan(0)
    expect(endpointRequests.every((url) => url.startsWith('https://west.tools.example/mcp'))).toBe(true)
  })

  it('validates an official Agent Plugins 1.0 bundle and reuses MCP discovery for its remote server', async () => {
    const discoverMcp = vi.fn().mockResolvedValue({
      kind: 'ready',
      serverUrl: 'https://tools.example/mcp',
      protocolVersion: '2025-11-25',
      sourceDigest: `sha256:${'4'.repeat(64)}`,
      tools: [{
        name: 'lookup',
        description: 'Looks up one reference.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        outputSchema: responseSchema,
      }],
    })

    const source = {
      kind: 'agent_plugin',
      pluginJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'reference-tools',
      },
      mcpJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: {
          remote: { type: 'streamable-http', url: 'https://tools.example/mcp' },
          local: { type: 'stdio', command: 'reference-server' },
        },
      },
      environment: 'production',
    } as const

    const metadata = await previewSupplySource(source, { discoverMcp })
    expect(metadata).toMatchObject({
      kind: 'remote_selection_required',
      sourceKind: 'agent_plugin',
      remotes: [{ name: 'remote', serverUrl: 'https://tools.example/mcp' }],
    })
    expect(discoverMcp).not.toHaveBeenCalled()
    if (metadata.kind !== 'remote_selection_required') return

    const result = await previewSupplySource({
      ...source,
      remoteRef: metadata.remotes[0]?.remoteRef,
    }, { discoverMcp })

    expect(result).toMatchObject({
      kind: 'ready',
      provenance: {
        sourceKind: 'agent_plugin',
        sourceUrl: 'https://tools.example/mcp',
      },
      candidates: [{
        sourceSelector: {
          serverName: 'remote',
          serverUrl: 'https://tools.example/mcp',
          toolName: 'lookup',
        },
        disposition: { kind: 'supported' },
      }],
    })
    expect(discoverMcp).toHaveBeenCalledOnce()
  })

  it('keeps a valid Agent Plugin remote when an invalid or configured-header sibling is present', async () => {
    const discoverMcp = vi.fn().mockResolvedValue({
      kind: 'ready',
      serverUrl: 'https://good.tools.example/mcp',
      protocolVersion: '2026-07-28',
      sourceDigest: `sha256:${'7'.repeat(64)}`,
      tools: [{ name: 'lookup', inputSchema: { type: 'object' }, outputSchema: responseSchema }],
    })
    const source = {
      kind: 'agent_plugin' as const,
      pluginJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'reference-tools',
      },
      mcpJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: {
          good: { type: 'streamable-http', url: 'https://good.tools.example/mcp' },
          configured: {
            type: 'streamable-http',
            url: 'https://configured.tools.example/mcp',
            headers: { Authorization: '${PROVIDER_TOKEN}' },
          },
          malformed: { type: 'streamable-http', url: 42 },
        },
      },
      environment: 'production' as const,
    }

    const metadata = await previewSupplySource(source, { discoverMcp })

    expect(metadata).toMatchObject({
      kind: 'remote_selection_required',
      remotes: [{ name: 'good', serverUrl: 'https://good.tools.example/mcp' }],
    })
    expect(discoverMcp).not.toHaveBeenCalled()
  })

  it('rejects Agent Plugin credentials and legacy remote transports instead of importing them', async () => {
    const base = {
      kind: 'agent_plugin' as const,
      pluginJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'reference-tools',
      },
      environment: 'production' as const,
    }
    const credentialed = await previewSupplySource({
      ...base,
      mcpJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: {
          remote: {
            type: 'streamable-http',
            url: 'https://tools.example/mcp',
            headers: { Authorization: 'Bearer secret' },
          },
        },
      },
    })
    const legacyOnly = await previewSupplySource({
      ...base,
      mcpJson: {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: { legacy: { type: 'sse', url: 'https://tools.example/sse' } },
      },
    })

    expect(credentialed).toMatchObject({ kind: 'action_required' })
    expect(legacyOnly).toMatchObject({ kind: 'action_required' })
    expect(JSON.stringify(credentialed)).not.toContain('secret')
  })
})
