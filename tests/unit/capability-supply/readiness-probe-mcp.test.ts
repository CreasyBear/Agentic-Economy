import { describe, expect, it, vi } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { runCapabilityReadinessProbe } from '@/modules/capability-supply/internal/readiness-probe'

import { keylessAuthority, target } from './readiness-probe-harness'

const credentialedMcpTarget = {
  ...target,
  adapterId: 'mcp-jsonrpc:v1',
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
  it('executes the MCP initialize -> initialized -> tools/list -> tools/call handshake', async () => {
    const targetMcp = {
      ...target,
      authority: keylessAuthority,
      adapterId: 'mcp-jsonrpc:v1',
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
})
