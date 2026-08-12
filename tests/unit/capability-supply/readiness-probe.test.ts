import { describe, expect, it, vi } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { encodeX402PaymentRequiredHeader } from '@/modules/capability-supply/server'
import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'
import { canonicalDigest } from '@/modules/common/canonical-digest'
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-capability',
  providerRef: 'provider:test-capability',
} as const
const keylessAuthority = { kind: 'keyless' } as const

const target = {
  publicationRef: 'offering:test:lookup', revision: 1,
  bindingId: 'binding:test:http', capabilityId: 'test.lookup',
  endpointUrl: 'https://provider.example.test/capability',
  authority: providerAuthority, adapterId: 'http-json:v1',
  probeKind: 'ae_quote' as const,
  probeMethod: 'POST' as const,
  transportConfigJson: JSON.stringify({
    method: 'POST',
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' },
  }),
  probeInputJson: JSON.stringify({
    protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: 'binding:test:http',
  }),
  targetDigest: canonicalDigest({
    publicationRef: 'offering:test:lookup',
    revision: 1,
    bindingId: 'binding:test:http',
    capabilityId: 'test.lookup',
    endpointUrl: 'https://provider.example.test/capability',
    authority: providerAuthority,
    adapterId: 'http-json:v1',
    configDigest: canonicalDigest({
      method: 'POST',
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' },
    }),
  }),
}
const credentialedMcpTarget = {
  ...target,
  adapterId: 'mcp-jsonrpc:v1',
  probeKind: 'mcp' as const,
  transportConfigJson: JSON.stringify({
    protocolVersion: LATEST_PROTOCOL_VERSION,
    toolName: 'lookup',
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' },
  }),
  probeInputJson: JSON.stringify({ query: 'hello' }),
  outputSchemaJson: JSON.stringify({
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  }),
}

describe('capability readiness probe', () => {
  it('records ready and healthy only after a credentialed public endpoint responds successfully', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.get('authorization')).toBe('Bearer test-secret')
      expect(request.redirect).toBe('manual')
      await expect(request.json()).resolves.toMatchObject({
        protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: target.bindingId,
      })
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', units: '1200', exponent: 2 },
        maximumCost: { currency: 'AUD', units: '1200', exponent: 2 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const result = await runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => 'test-secret',
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready', healthState: 'healthy', validUntil: 310_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('probes a public HTTP endpoint without resolving or sending a credential', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.headers.has('Authorization')).toBe(false)
      return Response.json({
        kind: 'quoted',
        expectedCost: { currency: 'AUD', units: '1200', exponent: 2 },
        maximumCost: { currency: 'AUD', units: '1200', exponent: 2 },
        expectedLatencyMs: 120, dataFields: [], disclosures: [],
      })
    })
    const resolveProviderConnectionCredential = vi.fn(async () => 'must-not-be-used')
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'none' },
      }),
    }, {
      resolveProviderConnectionCredential, validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready', healthState: 'healthy', validUntil: 310_000,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(resolveProviderConnectionCredential).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledOnce()
  })

  it('fails closed without resolving or transmitting a credential', async () => {
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })).resolves.toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable', healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_unavailable'],
    })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    { response: new Response(null, { status: 401 }), credentialState: 'unavailable', outcome: 'credential_rejected', evidence: 'probe:credential_rejected' },
    { response: new Response(null, { status: 503 }), credentialState: 'ready', outcome: 'http_5xx', evidence: 'probe:http_5xx' },
  ] as const)('fails closed for an unhealthy response', async ({ response, credentialState, outcome, evidence }) => {
    await expect(runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true,
      send: async () => response, now: () => 10_000,
    })).resolves.toMatchObject({
      outcome,
      credentialState, healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', evidence],
    })
  })

  it('never sends when DNS validation rejects the target', async () => {
    const resolveProviderConnectionCredential = vi.fn(async () => 'must-not-be-used')
    const validateTarget = vi.fn(async () => false)
    const send = vi.fn()
    await expect(runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential, validateTarget,
      send, now: () => 10_000,
    })).resolves.toMatchObject({
      outcome: 'target_not_public',
      credentialState: 'ready', healthState: 'unhealthy', validUntil: 70_000,
      evidenceRefs: ['probe:target_not_public'],
    })
    expect(validateTarget).toHaveBeenCalledOnce()
    expect(resolveProviderConnectionCredential).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses missing or mismatched credential placement before DNS or send', async () => {
    const missingValidateTarget = vi.fn(async () => true)
    const missingSend = vi.fn()
    const missingResolve = vi.fn(async () => 'must-not-be-used')
    const missing = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
    }, {
      resolveProviderConnectionCredential: missingResolve,
      validateTarget: missingValidateTarget,
      send: missingSend,
      now: () => 10_000,
    })
    expect(missing).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(missingResolve).not.toHaveBeenCalled()
    expect(missingValidateTarget).not.toHaveBeenCalled()
    expect(missingSend).not.toHaveBeenCalled()

    const mismatchedValidateTarget = vi.fn(async () => true)
    const mismatchedSend = vi.fn()
    const mismatchedResolve = vi.fn(async () => 'provider-secret')
    const mismatched = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
    }, {
      resolveProviderConnectionCredential: mismatchedResolve,
      validateTarget: mismatchedValidateTarget,
      send: mismatchedSend,
      now: () => 10_000,
    })
    expect(mismatched).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(mismatchedResolve).not.toHaveBeenCalled()
    expect(mismatchedValidateTarget).not.toHaveBeenCalled()
    expect(mismatchedSend).not.toHaveBeenCalled()
  })

  it('refuses an opaque environment locator after DNS and before send', async () => {
    const locator = 'env:TEST_CAPABILITY_KEY'
    const events: string[] = []
    const resolveProviderConnectionCredential = vi.fn(async () => {
      events.push('resolve')
      return locator
    })
    const validateTarget = vi.fn(async () => {
      events.push('dns')
      return true
    })
    const send = vi.fn(async () => {
      events.push('send')
      return Response.json({})
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: '1' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
    }, {
      resolveProviderConnectionCredential,
      validateTarget,
      send,
      now: () => 10_000,
    })

    expect(result).toMatchObject({
      outcome: 'credential_unavailable',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
    })
    expect(JSON.stringify(result)).not.toContain(locator)
    expect(resolveProviderConnectionCredential).toHaveBeenCalledOnce()
    expect(validateTarget).toHaveBeenCalledOnce()
    expect(events).toEqual(['dns', 'resolve'])
    expect(send).not.toHaveBeenCalled()
  })

  it('fails closed for a malformed endpoint before network access', async () => {
    const send = vi.fn()
    const result = await runCapabilityReadinessProbe({ ...target, endpointUrl: 'not a url' }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('target_not_public')
    expect(send).not.toHaveBeenCalled()
  })

  it('executes the MCP initialize -> initialized -> tools/list -> tools/call handshake', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp' as const,
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        toolName: 'lookup',
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      }),
    }
    const send = vi.fn(async (request: Request) => {
      if (request.method === 'DELETE') return new Response(null, { status: 200 })
      const body = await request.json() as { id?: string | number; method?: string }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id, result: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }, { headers: { 'Mcp-Session-Id': 'session-1' } })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] },
        })
      }
      expect(body.method).toBe('tools/call')
      return new Response([
        'event: message',
        'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}',
        '',
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { answer: 'world' } } })}`,
        '',
        '',
      ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const result = await runCapabilityReadinessProbe(targetMcp, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:mcp_tools_call_valid'],
    })
    expect(send).toHaveBeenCalledTimes(5)
    expect(send.mock.calls[1]![0].headers.get('Mcp-Session-Id')).toBe('session-1')
    expect(send.mock.calls.at(-1)?.[0].method).toBe('DELETE')
    expect(result.responseDigest).toMatch(/^sha256:/)
  })
  it('aborts a blackholed MCP DELETE at the configured request timeout before closing', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp' as const,
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        toolName: 'lookup',
        requestTimeoutMs: 100,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      }),
    }
    const methods: string[] = []
    let deleteSignal: AbortSignal | undefined
    const send = vi.fn(async (request: Request) => {
      methods.push(request.method)
      if (request.method === 'DELETE') {
        deleteSignal = request.signal
        return await new Promise<Response>((resolve) => {
          request.signal.addEventListener(
            'abort',
            () => resolve(new Response(null, { status: 204 })),
            { once: true },
          )
        })
      }
      const body = await request.json() as { id?: string | number; method?: string }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }, { headers: { 'Mcp-Session-Id': 'session:blackholed-delete' } })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] },
        })
      }
      return new Response([
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { structuredContent: { answer: 'world' } } })}`,
        '',
        '',
      ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const result = await runCapabilityReadinessProbe(targetMcp, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      healthState: 'healthy',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:mcp_tools_call_valid'],
    })
    expect(methods).toEqual(['POST', 'POST', 'POST', 'POST', 'DELETE'])
    expect(deleteSignal?.aborted).toBe(true)
  })
  it('refuses an older configured MCP protocol before public validation or transport', async () => {
    const validateTarget = vi.fn(async () => true)
    const send = vi.fn()
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp',
      transportConfigJson: JSON.stringify({
        protocolVersion: '2025-06-18',
        toolName: 'lookup',
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'response_invalid',
      credentialState: 'ready',
      healthState: 'unhealthy',
      evidenceRefs: ['probe:mcp_protocol_unsupported'],
    })
    expect(validateTarget).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('terminates a stateful MCP session when readiness refuses before tool listing', async () => {
    const methods: string[] = []
    const send = vi.fn(async (request: Request) => {
      methods.push(request.method)
      if (request.method === 'DELETE') return new Response(null, { status: 200 })
      const body = await request.json() as { id?: string | number; method?: string }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: { name: 'provider', version: '1' },
          },
        }, { headers: { 'Mcp-Session-Id': 'session:early-refusal' } })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      throw new Error('tools_list_must_not_run')
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp',
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        toolName: 'lookup',
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'response_invalid',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:mcp_initialize_invalid'],
    })
    expect(methods).toEqual(['POST', 'POST', 'DELETE'])
  })


  it('follows a second MCP tools/list page before tools/call', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp' as const,
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION, toolName: 'lookup', requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object', required: ['answer'], properties: { answer: { type: 'string' } } }),
    }
    const listParams: unknown[] = []
    const send = vi.fn(async (request: Request) => {
      const body = await request.json() as { id?: string; method?: string; params?: Record<string, unknown> }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'provider', version: '1' } },
        })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      if (body.method === 'tools/list') {
        listParams.push(body.params)
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: body.params?.cursor === 'page-2'
            ? { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] }
            : { tools: [{ name: 'other', inputSchema: { type: 'object' } }], nextCursor: 'page-2' },
        })
      }
      expect(body.method).toBe('tools/call')
      return Response.json({
        jsonrpc: '2.0', id: body.id, result: { structuredContent: { answer: 'world' } },
      })
    })
    const result = await runCapabilityReadinessProbe(targetMcp, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(listParams).toEqual([{}, { cursor: 'page-2' }])
    expect(send).toHaveBeenCalledTimes(5)
  })

  it('refuses a repeated MCP tools/list cursor before tools/call', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp' as const,
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION, toolName: 'lookup', requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    }
    const send = vi.fn(async (request: Request) => {
      const body = await request.json() as { id?: string; method?: string; params?: Record<string, unknown> }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'provider', version: '1' } },
        })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      if (body.method === 'tools/list') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: { tools: [{ name: 'other', inputSchema: { type: 'object' } }], nextCursor: 'loop' },
        })
      }
      throw new Error('tools_call_must_not_run')
    })
    const result = await runCapabilityReadinessProbe(targetMcp, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result).toMatchObject({
      outcome: 'response_invalid',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:mcp_tools_list_cursor_cycle'],
    })
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('uses the first matching MCP JSON-RPC SSE error and never scans to a later result', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp' as const,
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION, toolName: 'lookup', requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    }
    const send = vi.fn(async (request: Request) => {
      const body = await request.json() as { id?: string; method?: string }
      if (body.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: body.id,
          result: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'provider', version: '1' } },
        })
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 200 })
      expect(body.method).toBe('tools/list')
      return new Response([
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32600, message: 'invalid request' } })}`,
        '',
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] } })}`,
        '',
      ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const result = await runCapabilityReadinessProbe(targetMcp, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result).toMatchObject({
      outcome: 'response_invalid',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:mcp_tools_list_invalid'],
    })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('refuses a malformed MCP handshake before tools/call', async () => {
    const send = vi.fn(async (request: Request) => {
      const body = await request.json() as { id?: string | number }
      return Response.json({ jsonrpc: '2.0', id: body.id, result: {} })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
      probeKind: 'mcp',
      transportConfigJson: JSON.stringify({
        protocolVersion: LATEST_PROTOCOL_VERSION, toolName: 'lookup', requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({ type: 'object' }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(send).toHaveBeenCalledOnce()
  })
  it('classifies a credential rejection at MCP initialize before parsing and stops the handshake', async () => {
    const send = vi.fn(async () => new Response('not-json', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }))
    const result = await runCapabilityReadinessProbe(credentialedMcpTarget, {
      resolveProviderConnectionCredential: async () => 'test-secret',
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result).toMatchObject({
      outcome: 'credential_rejected',
      credentialState: 'unavailable',
      healthState: 'unhealthy',
      responseStatus: 401,
      responseContentType: 'application/json',
      evidenceRefs: ['probe:credential_resolved', 'probe:target_public', 'probe:credential_rejected'],
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it.each(['notifications/initialized', 'tools/list', 'tools/call'] as const)(
    'classifies a credential rejection at MCP %s before parsing and stops later requests',
    async (rejectedStage) => {
      const methods: string[] = []
      const send = vi.fn(async (request: Request) => {
        if (request.method === 'DELETE') return new Response(null, { status: 200 })
        const body = await request.json() as { id?: string | number; method?: string }
        const method = body.method
        if (method !== undefined) methods.push(method)
        if (method === rejectedStage) {
          return new Response('not-json', {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0', id: body.id, result: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
          }, { headers: { 'Mcp-Session-Id': 'session-1' } })
        }
        if (method === 'notifications/initialized') return new Response(null, { status: 200 })
        if (method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }] },
          })
        }
        return Response.json({
          jsonrpc: '2.0', id: body.id, result: { structuredContent: { answer: 'world' } },
        })
      })
      const result = await runCapabilityReadinessProbe(credentialedMcpTarget, {
        resolveProviderConnectionCredential: async () => 'test-secret',
        validateTarget: async () => true,
        send,
        now: () => 10_000,
      })

      expect(result).toMatchObject({
        outcome: 'credential_rejected',
        credentialState: 'unavailable',
        healthState: 'unhealthy',
        responseStatus: 401,
        responseContentType: 'application/json',
        evidenceRefs: ['probe:credential_resolved', 'probe:target_public', 'probe:credential_rejected'],
      })
      expect(methods).toEqual(rejectedStage === 'notifications/initialized'
        ? ['initialize', 'notifications/initialized']
        : rejectedStage === 'tools/list'
          ? ['initialize', 'notifications/initialized', 'tools/list']
          : ['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])
    },
  )

  it('uses the declared read-only GET with fixed query parameters for imported HTTP descriptions', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.url).toBe('https://provider.example.test/capability?providers=ECB')
      expect(request.headers.get('Authorization')).toBe('Bearer test-secret')
      return Response.json({ rates: { USD: 1.08 } })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      probeKind: 'openapi_http',
      probeQuery: [{ parameter: 'providers', value: 'ECB' }],
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'bearer' },
      }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { rates: { type: 'object' } },
        required: ['rates'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => 'test-secret', validateTarget: async () => true, send, now: () => 10_000,
    })
    expect(result.outcome).toBe('healthy')
  })
  it('requires the imported response status before media and body validation', async () => {
    const openApiTarget = {
      ...target,
      authority: keylessAuthority,
      probeKind: 'openapi_http' as const,
      probeMethod: 'GET' as const,
      transportConfigJson: JSON.stringify({
        method: 'GET',
        fixedQuery: [{ parameter: 'probe', value: 'readiness' }],
        requestTimeoutMs: 5_000,
        responseStatus: 201,
        responseContentType: 'application/json',
        credential: { kind: 'none' },
      }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { rates: { type: 'object' } },
        required: ['rates'],
        additionalProperties: false,
      }),
    }
    const body = JSON.stringify({ rates: { USD: 1.08 } })
    const wrongStatus = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json-invalid' },
      }),
      now: () => 10_000,
    })
    expect(wrongStatus).toMatchObject({
      outcome: 'response_invalid',
      responseStatus: 200,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:response_status_invalid'],
    })

    const accepted = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
      now: () => 10_000,
    })
    expect(accepted).toMatchObject({ outcome: 'healthy', responseStatus: 201 })

    const wrongMedia = await runCapabilityReadinessProbe(openApiTarget, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(body, {
        status: 201,
        headers: { 'Content-Type': 'application/json-invalid' },
      }),
      now: () => 10_000,
    })
    expect(wrongMedia).toMatchObject({
      outcome: 'response_content_type_invalid',
      responseStatus: 201,
    })
  })
  it('sends the validated OpenAPI POST input example as a JSON body', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      expect(request.url).toBe('https://provider.example.test/capability')
      expect(request.headers.get('Content-Type')).toContain('application/json')
      await expect(request.json()).resolves.toEqual({ query: 'hello' })
      return Response.json({ result: 'world' })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeKind: 'openapi_http',
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST',
        requestContentType: 'application/json',
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      validUntil: 310_000,
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:http_2xx'],
    })
    expect(send).toHaveBeenCalledOnce()
  })
  it('sends no JSON body when probing a POST with query mappings only', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      expect(request.url).toBe('https://provider.example.test/capability?query=hello')
      await expect(request.text()).resolves.toBe('')
      return Response.json({ result: 'world' })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeKind: 'openapi_http',
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST',
        query: [{ inputPointer: '/query', parameter: 'query', required: true, style: 'form', explode: true }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(send).toHaveBeenCalledOnce()
  })


  it('omits absent optional query inputs while probing the same request shape as execution', async () => {
    const send = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://provider.example.test/capability?ids=bitcoin')
      return Response.json({ ok: true })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        query: [
          { inputPointer: '/ids', parameter: 'ids', required: true, style: 'form', explode: false },
          { inputPointer: '/include_24hr_change', parameter: 'include_24hr_change', required: false, style: 'form', explode: true },
        ],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ ids: 'bitcoin' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('healthy')
    expect(send).toHaveBeenCalledOnce()
  })
  it('refuses an absent required query input before readiness fetch', async () => {
    const send = vi.fn<(request: Request) => Promise<Response>>()
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'http-json:v1',
      probeKind: 'openapi_http',
      probeMethod: 'GET',
      transportConfigJson: JSON.stringify({
        method: 'GET',
        query: [{ inputPointer: '/ids', parameter: 'ids', required: true, style: 'form', explode: false }],
        requestTimeoutMs: 5_000,
        credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({}),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })

    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:request_unrepresentable')
    expect(send).not.toHaveBeenCalled()
  })
  it('refuses an OpenAPI POST response that violates the admitted output schema', async () => {
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      probeKind: 'openapi_http',
      probeMethod: 'POST',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, credential: { kind: 'none' },
      }),
      probeInputJson: JSON.stringify({ query: 'hello' }),
      outputSchemaJson: JSON.stringify({
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => Response.json({ result: 42 }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:response_invalid')
  })

  it('validates an x402 PaymentRequired challenge and exact amount', async () => {
    const challenge = encodeX402PaymentRequiredHeader({
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '12000000',
        asset: '0xasset',
        payTo: '0xpayee',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    })
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe('POST')
      await expect(request.json()).resolves.toMatchObject({ operation: 'quote' })
      expect(request.headers.has('Payment-Signature')).toBe(false)
      return new Response(null, { status: 402, headers: { 'Payment-Required': challenge } })
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      probeKind: 'x402',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send,
      now: () => 10_000,
    })
    expect(result).toMatchObject({
      targetDigest: target.targetDigest,
      responseStatus: 402,
      outcome: 'healthy',
      credentialState: 'ready',
      healthState: 'healthy',
      evidenceRefs: ['probe:credential_not_required', 'probe:target_public', 'probe:x402_payment_required_valid'],
    })
    expect(result.requestDigest).toMatch(/^sha256:/)
    expect(result.responseDigest).toMatch(/^sha256:/)
  })

  it('rejects an x402 challenge with a mismatched payee or amount', async () => {
    const challenge = encodeX402PaymentRequiredHeader({
      x402Version: 2,
      resource: { url: target.endpointUrl },
      accepts: [{
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1',
        asset: '0xasset',
        payTo: '0xother',
        maxTimeoutSeconds: 30,
        extra: {},
      }],
    })
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      probeKind: 'x402',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'Payment-Required': challenge } }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:x402_payment_required_mismatch')
  })
  it('rejects a malformed x402 PaymentRequired header', async () => {
    const result = await runCapabilityReadinessProbe({
      ...target,
      authority: keylessAuthority,
      adapterId: 'x402-fetch:v2',
      probeKind: 'x402',
      transportConfigJson: JSON.stringify({
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact',
        network: 'eip155:8453', currency: 'USD', routeAmountExponent: 2,
        assetAmountExponent: 6, asset: '0xasset', payTo: '0xpayee',
      }),
      expectedPaymentJson: JSON.stringify({
        scheme: 'exact', network: 'eip155:8453', asset: '0xasset', payTo: '0xpayee',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        paidAmount: { currency: 'USD', units: '1200', exponent: 2 },
      }),
    }, {
      resolveProviderConnectionCredential: async () => undefined,
      validateTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'Payment-Required': 'not-base64' } }),
      now: () => 10_000,
    })
    expect(result.outcome).toBe('response_invalid')
    expect(result.evidenceRefs).toContain('probe:x402_payment_required_invalid')
  })
})
