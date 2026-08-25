import { describe, expect, it, vi } from 'vitest'

import type { RouteTransportFetch } from '@/modules/capability-supply/route-transport-runtime'

import {
  authority,
  invocation,
  invokeRouteTransport,
  providerAuthority,
  registeredBinding,
  resolveProviderCredential,
} from './route-transport-test-harness'

describe('registered route transport runtime', () => {
  it('initializes a Streamable HTTP MCP session and normalizes a tool result', async () => {
    const fetch = vi
      .fn<RouteTransportFetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            jsonrpc: '2.0',
            id: 0,
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
          },
          { headers: { 'Mcp-Session-Id': 'session:123' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
      'mcp-protocol-version': '2025-11-25',
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-06-18',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential(credential),
      },
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
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
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
                ? {
                    tools: [
                      {
                        name: 'resolve_service',
                        inputSchema: { type: 'object' },
                      },
                    ],
                  }
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
            result: {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'provider', version: '1' },
            },
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
            protocolVersion: '2025-11-25',
            capabilities: {},
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const observed = await invokeRouteTransport(
      invocation({
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: { kind: 'bearer' },
          },
        ),
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-secret'),
      },
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
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'provider', version: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          jsonrpc: '2.0',
          id: 1,
          result: {
            tools: [
              { name: 'resolve_service', inputSchema: { type: 'object' } },
            ],
          },
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
        binding: registeredBinding(
          'mcp-jsonrpc:v1',
          'https://provider.example/mcp',
          providerAuthority,
          {
            protocolVersion: '2025-11-25',
            toolName: 'resolve_service',
            requestTimeoutMs: 5_000,
            credential: {
              kind: 'api_key',
              location: 'header',
              name: 'X-MCP-Key',
            },
          },
        ),
        authority: {
          ...authority,
          maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
      {
        send: fetch,
        resolveCredential: resolveProviderCredential('mcp-api-secret'),
      },
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
