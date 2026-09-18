import { describe, expect, it, vi } from 'vitest'

import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  authority,
  invocation,
  invokeRouteTransport,
  providerAuthority,
  registeredBinding,
  resolveProviderCredential,
} from './route-transport-test-harness'

/**
 * Streamable HTTP MCP endpoint exercised by every scenario in this file.
 */
const MCP_ENDPOINT_URL = 'https://provider.example/mcp'

/**
 * MCP protocol version accepted on success paths; the protocol-refusal scenario
 * configures an older version instead.
 */
const MCP_PROTOCOL_VERSION = '2025-11-25'

/** Legacy protocol version that must be refused before any MCP fetch runs. */
const MCP_LEGACY_PROTOCOL_VERSION = '2025-06-18'

/**
 * Tool name on the registered binding and in mock tools/list payloads before
 * tools/call.
 */
const MCP_TOOL_NAME = 'resolve_service'

/**
 * Default bearer MCP binding config; scenarios override credential or
 * protocolVersion when exercising API-key placement or protocol refusal.
 */
const MCP_BEARER_BINDING_CONFIG = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  toolName: MCP_TOOL_NAME,
  requestTimeoutMs: 5_000,
  credential: { kind: 'bearer' as const },
} as const

/**
 * Narrowed maximumSpend on scenarios that succeed without using the harness
 * invocation default spend cap.
 */
const MCP_MINIMUM_SPEND_AUTHORITY = {
  ...authority,
  maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
}

/**
 * `initialize` result body returned by mock MCP servers on supported paths.
 */
const MCP_INITIALIZE_RESULT_BODY = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  capabilities: { tools: {} },
  serverInfo: { name: 'provider', version: '1' },
} as const

/** Single-page tools/list payload advertising the bound resolve_service tool. */
const MCP_TOOLS_LIST_RESOLVE_SERVICE = {
  tools: [{ name: MCP_TOOL_NAME, inputSchema: { type: 'object' } }],
} as const

/**
 * Registered MCP provider binding with the shared adapter, endpoint, and
 * provider authority; only binding config JSON differs per scenario.
 */
function mcpRegisteredBinding(
  config: Readonly<Record<string, StableHashValue>>,
) {
  return registeredBinding(
    'mcp-jsonrpc:v1',
    MCP_ENDPOINT_URL,
    providerAuthority,
    config,
  )
}

/**
 * Runtime slice shared by MCP scenarios: outbound fetch plus provider credential
 * resolution for the harness default connection ref.
 */
function mcpTransportRuntime(
  send: RouteTransportFetch,
  credential = 'mcp-secret',
) {
  return {
    send,
    resolveCredential: resolveProviderCredential(credential),
  }
}

describe('registered route transport runtime', () => {
  it('initializes a Streamable HTTP MCP session and normalizes a tool result', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            jsonrpc: '2.0',
            id: 0,
            result: MCP_INITIALIZE_RESULT_BODY,
          },
          { headers: { 'Mcp-Session-Id': 'session:123' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: MCP_TOOLS_LIST_RESOLVE_SERVICE,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: { structuredContent: { serviceReference: 'service:mcp' } },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
        authority: MCP_MINIMUM_SPEND_AUTHORITY,
      }),
      mcpTransportRuntime(fetch),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:mcp' }),
    })
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(fetch.mock.calls[3]?.[1]?.headers).toMatchObject({
      'mcp-session-id': 'session:123',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'idempotency-key': authority.operationKeyDigest,
    })
    expect(fetch.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer mcp-secret',
    })
    expect(fetch.mock.calls[4]?.[1]?.method).toBe('DELETE')
    expect(fetch.mock.calls[4]?.[1]?.headers).toMatchObject({
      'mcp-session-id': 'session:123',
    })
  })
  it('refuses an older configured MCP protocol before execution', async () => {
    const fetch = vi.fn<RouteTransportFetch>()
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding({
          ...MCP_BEARER_BINDING_CONFIG,
          protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
        }),
      }),
      mcpTransportRuntime(fetch),
    )
    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_protocol_unsupported',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails closed when an MCP result echoes its credential or call signature', async () => {
    const credential = 'mcp-secret'
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: MCP_INITIALIZE_RESULT_BODY,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: MCP_TOOLS_LIST_RESOLVE_SERVICE,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: {
            structuredContent: {
              nested: {
                echo: `Bearer ${credential}; AE-Call-Signature: ${authority.callIdentity.signature}`,
              },
            },
          },
        }),
      )

    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
      }),
      mcpTransportRuntime(fetch, credential),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'mcp_output_invalid',
    })
    expect(JSON.stringify(observed)).not.toContain(credential)
    expect(JSON.stringify(observed)).not.toContain(
      authority.callIdentity.signature,
    )
  })

  it('follows a second MCP tools/list page before tools/call', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body ?? '{}') as {
          id?: string
          method?: string
          params?: Record<string, unknown>
        }
        if (body.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: MCP_INITIALIZE_RESULT_BODY,
          })
        }
        if (body.method === 'notifications/initialized')
          return new Response(null, { status: 200 })
        if (body.method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result:
              body.params?.cursor === 'page-2'
                ? MCP_TOOLS_LIST_RESOLVE_SERVICE
                : {
                    tools: [{ name: 'other', inputSchema: { type: 'object' } }],
                    nextCursor: 'page-2',
                  },
          })
        }
        return Response.json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            structuredContent: { serviceReference: 'service:mcp-page-2' },
          },
        })
      })
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
        authority: MCP_MINIMUM_SPEND_AUTHORITY,
      }),
      mcpTransportRuntime(fetch),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      outputJson: JSON.stringify({ serviceReference: 'service:mcp-page-2' }),
    })
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(JSON.parse(fetch.mock.calls[2]?.[1]?.body ?? '{}').params).toEqual(
      {},
    )
    expect(JSON.parse(fetch.mock.calls[3]?.[1]?.body ?? '{}').params).toEqual({
      cursor: 'page-2',
    })
  })

  it('refuses a repeated MCP tools/list cursor before release', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(init?.body ?? '{}') as {
          id?: string
          method?: string
        }
        if (body.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: MCP_INITIALIZE_RESULT_BODY,
          })
        }
        if (body.method === 'notifications/initialized')
          return new Response(null, { status: 200 })
        if (body.method === 'tools/list') {
          return Response.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [{ name: 'other', inputSchema: { type: 'object' } }],
              nextCursor: 'loop',
            },
          })
        }
        throw new Error('tools_call_must_not_run')
      })
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
      }),
      mcpTransportRuntime(fetch),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_tools_list_cursor_cycle',
    })
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('uses the first matching MCP JSON-RPC SSE error and never scans to a later result', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: MCP_INITIALIZE_RESULT_BODY,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          [
            'event: message',
            'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"invalid request"}}',
            '',
            'event: message',
            'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"resolve_service","inputSchema":{"type":"object"}}]}}',
            '',
          ].join('\n'),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
      }),
      mcpTransportRuntime(fetch),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_tools_list_invalid',
    })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('refuses an MCP server that does not advertise tool capability before release', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding(MCP_BEARER_BINDING_CONFIG),
      }),
      mcpTransportRuntime(fetch),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'mcp_initialize_invalid',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('places a configured MCP API key without leaking it into bearer authorization', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 0,
          result: MCP_INITIALIZE_RESULT_BODY,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: MCP_TOOLS_LIST_RESOLVE_SERVICE,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 2,
          result: {
            structuredContent: { serviceReference: 'service:mcp-api-key' },
          },
        }),
      )
    const observed = await invokeRouteTransport(
      invocation({
        binding: mcpRegisteredBinding({
          ...MCP_BEARER_BINDING_CONFIG,
          credential: {
            kind: 'api_key',
            location: 'header',
            name: 'X-MCP-Key',
          },
        }),
        authority: MCP_MINIMUM_SPEND_AUTHORITY,
      }),
      mcpTransportRuntime(fetch, 'mcp-api-secret'),
    )

    expect(observed).toMatchObject({
      transport: 'mcp',
      disposition: 'succeeded',
      outputJson: JSON.stringify({ serviceReference: 'service:mcp-api-key' }),
    })
    for (const call of fetch.mock.calls) {
      expect(call[1]?.headers).toMatchObject({ 'x-mcp-key': 'mcp-api-secret' })
      expect(call[1]?.headers).not.toHaveProperty('authorization')
    }
  })
})
