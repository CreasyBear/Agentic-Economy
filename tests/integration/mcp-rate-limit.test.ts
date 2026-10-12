import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FunctionReference } from 'convex/server'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { handleMcpRouteRequest } from '@/lib/server/mcp-api'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'

const authenticate = vi.fn(async () => ({
  isAuthenticated: true, tokenType: 'api_key' as const, id: 'key:mcp-rate-test',
  subject: 'user_mcp_rate_test', scopes: ['market_tools:call'], claims: { aeEnvironment: 'sandbox' },
}))

function request(authorization?: string, method = 'ping'): Request {
  return new Request('https://ae.example/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'cf-connecting-ip': '203.0.113.20', ...(authorization === undefined ? {} : { authorization }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
  })
}

beforeEach(() => {
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
  vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'mcp-rate-limit-fixture-signing-key-at-least-32-characters')
  vi.stubEnv('VERCEL', '')
  vi.spyOn(Date, 'now').mockReturnValue(1_791_820_000_000)
  setHttpRateLimitAdmissionForTests(undefined)
  // Exercise the signed public admission function, its validator and the real
  // rate-limiter component with production policy; only transport is substituted.
  const backend = convexTestWithMarketComponents()
  const transport = {
    query: (ref: FunctionReference<'query'>, args: Record<string, unknown>) => backend.query(ref, args),
    mutation: (ref: FunctionReference<'mutation'>, args: Record<string, unknown>) => backend.mutation(ref, args),
    action: (ref: FunctionReference<'action'>, args: Record<string, unknown>) => backend.action(ref, args),
  }
  setPublicSourceTransportForTests(transport as never)
})

afterEach(() => {
  setHttpRateLimitAdmissionForTests(undefined)
  setPublicSourceTransportForTests(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  authenticate.mockClear()
})

describe('MCP native discovery with real admission', () => {
  it('isolates concurrent authenticated initialization and all metadata pages from an exhausted anonymous bucket', async () => {
    for (let i = 0; i < 30; i++) expect((await handleMcpRouteRequest(request())).status).toBe(200)
    expect((await handleMcpRouteRequest(request())).status).toBe(429)
    const clients = [0, 1].map(index => new Client({ name: `mcp-reconnect-${index}`, version: '1.0.0' }))
    try {
      await Promise.all(clients.map(async client => {
        const transport = new StreamableHTTPClientTransport(new URL('https://ae.example/mcp'), {
          requestInit: { headers: { authorization: 'Bearer valid', 'cf-connecting-ip': '203.0.113.20' } },
          fetch: async (input, init) => await handleMcpRouteRequest(new Request(input, init), {
            authenticate,
            resolvePrincipal: async projection => ({
              ...projection, principalId: 'prn_00000000000040008000000000000044',
              ownerId: 'acc_00000000000040008000000000000044',
            }),
          }),
        })
        await client.connect(transport as unknown as Parameters<Client['connect']>[0])
        const names: string[] = []
        let page = await client.listTools()
        names.push(...page.tools.map(tool => tool.name))
        while (page.nextCursor !== undefined) {
          page = await client.listTools({ cursor: page.nextCursor })
          names.push(...page.tools.map(tool => tool.name))
        }
        expect(names).toContain('ae_call_status')
        expect(names).toContain('ae_tool_call')
        expect(names).toHaveLength(29)
      }))
      // A successful authenticated startup must not replenish anonymous capacity.
      expect((await handleMcpRouteRequest(request())).status).toBe(429)
    } finally {
      await Promise.all(clients.map(client => client.close()))
    }
  })

  it('bounds junk verification across rotating credentials, then admits a later retry after refill', async () => {
    const invalid = vi.fn(async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }))
    for (let i = 0; i < 120; i++) {
      await handleMcpRouteRequest(request(`Bearer junk-${i}`), { authenticate: invalid })
    }
    const response = await handleMcpRouteRequest(request('Bearer another-junk'), { authenticate: invalid })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('1')
    expect(invalid).toHaveBeenCalledTimes(120)
    // Recovery refills the existing per-IP quota; changing credentials cannot do it.
    vi.mocked(Date.now).mockReturnValue(1_791_820_060_000)
    const recovered = await handleMcpRouteRequest(request('Bearer still-invalid', 'tools/list'), { authenticate: invalid })
    expect(recovered.status).toBe(401)
    expect(invalid).toHaveBeenCalledTimes(121)
  })
})
