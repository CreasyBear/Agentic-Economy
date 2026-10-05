import { Client, StreamableHTTPClientTransport, type VersionNegotiationMode } from '@modelcontextprotocol/client'
import { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'
import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { authenticateWithScopes, currentToolRef, handleMcpRequest, handleMcpRouteRequest, readMcpBody } from './mcp-api-harness'

const publicNames = ['ae_registry_tools_search', 'ae_registry_tools_describe', 'ae_registry_tools_compare']
const noMatch = {
  kind: 'noMatch' as const, schemaVersion: 'registry-tools:v3' as const,
  query: 'plumbing', reason: 'No suitable Tools found.',
  assessed: { source: 'all' as const, scope: 'complete' as const, examined: 0, coverage: 'complete' as const },
  results: [], partialResults: false, pagination: { limit: 8, hasMore: false }, next: [],
} satisfies Awaited<ReturnType<typeof registryToolsSearchAction.run>>

function currentBody(method: string, params: Record<string, unknown> = {}, version: string = MCP_LATEST_PROTOCOL_VERSION) {
  return {
    jsonrpc: '2.0', id: 'current', method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: version,
        [CLIENT_INFO_META_KEY]: { name: 'current-protocol-test', version: '1.0.0' },
        [CLIENT_CAPABILITIES_META_KEY]: {},
      },
    },
  }
}

function currentRequest(method: string, params: Record<string, unknown> = {}, options: {
  headers?: HeadersInit; path?: string; body?: unknown; signal?: AbortSignal
} = {}) {
  return new Request(`https://ae.example${options.path ?? '/mcp'}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_LATEST_PROTOCOL_VERSION, 'mcp-method': method,
      ...(typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
      ...options.headers,
    },
    body: JSON.stringify(options.body ?? currentBody(method, params)),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
}

const principal: AgentAccessPrincipalResolver = async (projection) => ({
  ...projection,
  principalId: 'prn_00000000000040008000000000000044',
  ownerId: 'acc_00000000000040008000000000000044',
})

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

describe('MCP 2026-07-28 HTTP compatibility', () => {
  it.each<VersionNegotiationMode>(['auto', { pin: MCP_LATEST_PROTOCOL_VERSION }])('uses the official v2 client in mode %j without a legacy handshake', async (mode) => {
    const methods: string[] = []
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch)
    const client = new Client({ name: 'ae-current-client', version: '1.0.0' }, { versionNegotiation: { mode } })
    const transport = new StreamableHTTPClientTransport(new URL('https://ae.example/mcp'), {
      fetch: async (input, init) => {
        const request = new Request(input, init)
        if (request.method === 'POST') methods.push((await request.clone().json() as { method: string }).method)
        return await handleMcpRequest(request)
      },
    })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name)).toEqual(publicNames)
      const result = await client.callTool({ name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } })
      expect(result.structuredContent).toMatchObject({ result: { kind: 'noMatch', query: 'plumbing' } })
      expect(client.getServerVersion()).toMatchObject({ name: 'agentic-economy' })
      expect(methods).toEqual(['server/discover', 'tools/list', 'tools/call'])
      expect(run).toHaveBeenCalledOnce()
    } finally {
      await client.close()
    }
  })

  it('returns current wire metadata with private, non-cacheable discovery and paginated Tool lists', async () => {
    const discovery = await readMcpBody(await handleMcpRequest(currentRequest('server/discover')))
    expect(discovery.result).toMatchObject({ resultType: 'complete', supportedVersions: [MCP_LATEST_PROTOCOL_VERSION], ttlMs: 0, cacheScope: 'private' })
    const names: string[] = []
    let cursor: string | undefined
    do {
      const response = await handleMcpRequest(currentRequest('tools/list', cursor === undefined ? {} : { cursor }), { toolsListPageSize: 2 })
      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      expect(body.result).toMatchObject({ resultType: 'complete', ttlMs: 0, cacheScope: 'private' })
      const result = body.result as { tools: Array<{ name: string }>; nextCursor?: string }
      names.push(...result.tools.map((tool) => tool.name))
      cursor = result.nextCursor
    } while (cursor !== undefined)
    expect(names).toEqual(publicNames)
  })

  it('isolates concurrent public, buyer, Provider and read-only requests and refuses read-only purchases', async () => {
    const scopes = [null, ['market_tools:call'], ['market_supply:manage'], ['market_tools:call', 'market_supply:manage']] as const
    const responses = await Promise.all(scopes.map(async (scope, index) => {
      const response = await handleMcpRequest(currentRequest('tools/list', {}, {
        ...(scope === null ? {} : { headers: { authorization: `Bearer caller-${index}` } }),
        ...(index === 3 ? { path: '/mcp?readonly=1' } : {}),
      }), scope === null ? {} : { authenticate: authenticateWithScopes(scope), resolvePrincipal: principal })
      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      expect(body.result).toMatchObject({ ttlMs: 0, cacheScope: 'private' })
      return ((body.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name)
    }))
    expect(responses[0]).toEqual(publicNames)
    expect(responses[1]).toContain('ae_tool_call')
    expect(responses[1]).not.toContain('ae_supply_publish')
    expect(responses[2]).toContain('ae_supply_publish')
    expect(responses[2]).not.toContain('ae_tool_call')
    expect(responses[3]).toContain('ae_agentAccess_balance')
    expect(responses[3]).not.toContain('ae_tool_quote')
    expect(responses[3]).not.toContain('ae_supply_publish')
    const quoteTool = vi.fn()
    const response = await handleMcpRequest(currentRequest('tools/call', {
      name: 'ae_tool_quote', arguments: { toolRef: currentToolRef, input: {} },
    }, { headers: { authorization: 'Bearer readonly' }, path: '/mcp?readonly=1' }), {
      authenticate: authenticateWithScopes(['market_tools:call']), resolvePrincipal: principal,
      callService: { quoteTool, callTool: vi.fn(), readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
    })
    expect((await readMcpBody(response)).result).toMatchObject({ resultType: 'complete', isError: true, structuredContent: { code: 'mcp_toolset_required' } })
    expect(quoteTool).not.toHaveBeenCalled()
  })

  it('authenticates server/discover rather than accepting an invalid credential as public access', async () => {
    const authenticate = vi.fn(async () => ({ isAuthenticated: false as const, tokenType: null, id: null, subject: null, scopes: null }))
    const response = await handleMcpRequest(currentRequest('server/discover', {}, { headers: { authorization: 'Bearer invalid' } }), { authenticate })
    expect(response.status).toBe(401)
    expect(authenticate).toHaveBeenCalledOnce()
  })

  it.each([
    { label: 'missing envelope', body: { jsonrpc: '2.0', id: 'current', method: 'tools/call', params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } } }, status: 400, code: -32602 },
    { label: 'incomplete envelope', body: { jsonrpc: '2.0', id: 'current', method: 'tools/call', params: { name: 'ae_registry_tools_search', _meta: { [PROTOCOL_VERSION_META_KEY]: MCP_LATEST_PROTOCOL_VERSION } } }, status: 400, code: -32602 },
    { label: 'version mismatch', headers: { 'mcp-protocol-version': '2025-11-25' }, status: 400, code: -32020 },
    { label: 'method mismatch', headers: { 'mcp-method': 'tools/list' }, status: 400, code: -32020 },
    { label: 'name mismatch', headers: { 'mcp-name': 'ae_other_tool' }, status: 400, code: -32020 },
    { label: 'unsupported version', body: currentBody('tools/call', { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } }, '2027-01-01'), headers: { 'mcp-protocol-version': '2027-01-01' }, status: 400, code: -32022 },
    { label: 'incorrect MIME type', headers: { 'content-type': 'text/plain' }, status: 415 },
  ])('rejects $label before running an AE action', async ({ body, headers, status, code }) => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    const response = await handleMcpRequest(currentRequest('tools/call', { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } }, {
      ...(body === undefined ? {} : { body }), ...(headers === undefined ? {} : { headers }),
    }))
    expect(response.status).toBe(status)
    if (code !== undefined) expect((await readMcpBody(response)).error).toMatchObject({ code })
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['mcp-protocol-version', 'mcp-method', 'mcp-name'])('requires the current standard header %s before dispatch', async (header) => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    const request = currentRequest('tools/call', { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } })
    request.headers.delete(header)
    const response = await handleMcpRequest(request)
    expect(response.status).toBe(400)
    expect((await readMcpBody(response)).error).toMatchObject({ code: -32020 })
    expect(run).not.toHaveBeenCalled()
  })

  it('enforces the same 320 KiB body limit on current requests before dispatch', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    const response = await handleMcpRequest(currentRequest('tools/call', {
      name: 'ae_registry_tools_search', arguments: { query: 'x'.repeat(320 * 1024) },
    }))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'payload_too_large' })
    expect(run).not.toHaveBeenCalled()
  })

  it.each([429, 503])('preserves the correlated HTTP %s admission refusal on current requests', async (status) => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    setHttpRateLimitAdmissionForTests(async () => {
      if (status === 503) throw new Error('private admission detail')
      return { ok: false, retryAfter: 1_250 }
    })
    const response = await handleMcpRouteRequest(currentRequest('tools/call', {
      name: 'ae_registry_tools_search', arguments: { query: 'plumbing' },
    }, { headers: { 'x-ae-request-id': 'corr_current_admission_42' } }))
    expect(response.status).toBe(status)
    expect(response.headers.get('x-ae-request-id')).toBe('corr_current_admission_42')
    if (status === 429) expect(response.headers.get('retry-after')).toBe('2')
    const body = await response.json()
    expect(body).toMatchObject({ status, retryable: true })
    expect(JSON.stringify(body)).not.toContain('private admission detail')
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects malformed current protocol parameters before dispatch', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    const response = await handleMcpRequest(currentRequest('tools/call', { name: 123, arguments: {} }))
    expect((await readMcpBody(response)).error).toMatchObject({ code: -32602 })
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects malformed Tool arguments as a self-correctable Tool result without dispatch', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    const response = await handleMcpRequest(currentRequest('tools/call', { name: 'ae_registry_tools_search', arguments: { query: 123 } }))
    expect(response.status).toBe(200)
    expect((await readMcpBody(response)).result).toMatchObject({ resultType: 'complete', isError: true, structuredContent: { code: 'input_invalid', detail: expect.stringContaining('query:') } })
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['https://evil.example', 'null', 'https://ae.example.evil.example'])('rejects untrusted browser Origin %s before authentication or dispatch', async (origin) => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
    const authenticate = vi.fn()
    const response = await handleMcpRequest(currentRequest('server/discover', {}, { headers: { origin, authorization: 'Bearer test' } }), { authenticate })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'mcp_origin_not_allowed' })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('accepts the configured browser Origin behind HTTPS termination and ignores forwarded host claims', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
    const request = currentRequest('tools/list', {}, { headers: { origin: 'https://ae.example', 'x-forwarded-host': 'evil.example' } })
    const response = await handleMcpRequest(new Request('http://ae.example/mcp', request))
    expect(response.status).toBe(200)
  })

  it('preserves request cancellation through body reconstruction without re-dispatch', async () => {
    const controller = new AbortController()
    const started = Promise.withResolvers<AbortSignal>()
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockImplementation(async ({ context }) => {
      const signal = context?.request?.signal
      if (signal === undefined) throw new Error('MCP action did not receive its request signal')
      started.resolve(signal)
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      return noMatch
    })
    const pending = handleMcpRequest(currentRequest('tools/call', { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } }, { signal: controller.signal }))
    const actionSignal = await started.promise
    controller.abort()
    await Promise.allSettled([pending])
    expect(actionSignal.aborted).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })
})
