import { authenticateWithScopes, handleMcpRequest, postMcp, readMcpBody } from './mcp-api-harness'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  registryToolsDescribeAction,
  registryToolsSearchAction,
} from '@/modules/registry/tools.actions'
import { toolChoiceSearchOutputSchema, type RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import { marketRequestCreateAction } from '@/modules/market-demand/market-demand.actions'
import { recordRefusal, recordSearchOutcome } from '@/lib/observability/refusal-event'
import { PublicToolRegistrySchemaVersion } from '@/modules/capability-supply/tool-schemas'

vi.mock('@/lib/observability/refusal-event', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/observability/refusal-event')>(),
  recordRefusal: vi.fn(),
  recordSearchOutcome: vi.fn(),
}))

function noMatch(
  next: readonly RegistryNextAction[],
  pagination: { limit: number; hasMore: boolean; nextCursor?: string } = { limit: 8, hasMore: false },
) {
  return {
    kind: pagination.hasMore ? 'scoped' as const : 'noMatch' as const,
    reason: pagination.hasMore ? 'More supply remains to assess.' : 'No suitable Tools found in the assessed sources.',
    schemaVersion: 'registry-tools:v3' as const,
    query: 'plumbing',
    assessed: { source: 'all' as const, scope: pagination.hasMore ? 'page' as const : 'complete' as const, examined: 2, coverage: pagination.hasMore ? 'partial' as const : 'complete' as const },
    results: [] as [],
    partialResults: pagination.hasMore,
    pagination,
    next: [...next],
  }
}

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))

describe('MCP host adapter registry', () => {
  it.each([
    { requestOrigin: 'http://app.aecon.ai', canonical: 'https://app.aecon.ai' },
    { requestOrigin: 'http://localhost:3000', canonical: undefined },
  ])('points a listing row at Quote without echoing an untrusted host for $requestOrigin', async ({ requestOrigin, canonical }) => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', canonical)
    vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', undefined)
    vi.stubEnv('VERCEL_URL', undefined)
    vi.stubEnv('VERCEL_BRANCH_URL', undefined)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(toolChoiceSearchOutputSchema.parse({
      schemaVersion: 'registry-tools:v3', query: 'plumbing',
      kind: 'match',
      assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
      pagination: { limit: 8, hasMore: false }, partialResults: false, next: [],
      results: [{
        id: 'registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', source: 'coinbase', access: 'ae_callable', toolRef: 'registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', title: 'External Tool',
        summary: 'Retrieve data', provider: 'Outside', actionClass: 'retrieve', objectClass: 'data',
        readiness: 'unverified', price: { kind: 'unavailable' },
        detailRef: '/api/v1/registry/detail?id=registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        next: [], signals: { calls: 0, payers30d: 12 },
      }],
    }))
    const response = await handleMcpRequest(new Request(`${requestOrigin}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'x-forwarded-proto': 'http', 'x-forwarded-host': 'untrusted.example',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 40, method: 'tools/call',
        params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } },
      }),
    }))
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.content as { text: string }[])[0]?.text).toContain('Quote External Tool: ae_tool_quote({"toolRef":"registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}) with caller-owned input.')
    expect((body.result?.content as { text: string }[])[0]?.text).toContain('  External Tool: No AE calls yet · 12 payers')
    expect(JSON.stringify(body.result)).not.toContain('untrusted.example')
    if (canonical !== undefined) expect(JSON.stringify(body.result)).not.toContain('http://app.aecon.ai')
    expect(body.result?.structuredContent).toMatchObject({ result: { results: [{ id: 'registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] } })
  })

  it('calls the registered registry search action with MCP attribution', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([]))

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_tools_search',
        arguments: { query: 'plumbing' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(run).toHaveBeenCalledWith({
      data: { query: 'plumbing', limit: 8 },
      context: expect.objectContaining({ caller: 'mcp' }),
    })
    expect(result.structuredContent).toMatchObject({
      result: { kind: 'noMatch', assessed: { scope: 'complete' }, next: [] },
    })
    expect(JSON.stringify(result.content)).not.toContain('"results"')
    run.mockRestore()
  })
  it('projects Save this need only for an exhaustive no-match with a current call-scoped Agent', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([]))
    const argumentsData = { query: 'plumbing', source: 'current', filters: { provider: 'local' } }
    const request = { jsonrpc: '2.0', id: 41, method: 'tools/call', params: { name: 'ae_registry_tools_search', arguments: argumentsData } }
    const anonymous = await readMcpBody(await postMcp(request))
    expect(anonymous.result?.structuredContent).not.toHaveProperty('result.saveNeed')

    const authenticated = await readMcpBody(await postMcp(request, {
      authenticate: authenticateWithScopes(['market_tools:call']),
    }, { authorization: 'Bearer valid-test-agent' }))
    expect(authenticated.result?.structuredContent).toMatchObject({
      result: {
        saveNeed: {
          action: 'marketDemand.record',
          authority: 'owner_or_connected_agent',
          args: { query: 'plumbing', source: 'current', filters: { provider: 'local' } },
        },
        next: [],
      },
    })
    expect(JSON.stringify(authenticated.result?.content)).toContain('ae_marketDemand_record')
    expect(JSON.stringify(authenticated.result?.content)).toContain('idempotencyKey')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('never offers Save for scoped results or credentials lacking call scope; invalid supplied credentials refuse the read', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([], { limit: 8, hasMore: true, nextCursor: 'next' }))
    const request = { jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } } }
    const scoped = await readMcpBody(await postMcp(request, {
      authenticate: authenticateWithScopes(['market_tools:call']),
    }, { authorization: 'Bearer valid-test-agent' }))
    expect(scoped.result?.structuredContent).not.toHaveProperty('result.saveNeed')

    run.mockResolvedValue(noMatch([]))
    const wrongScope = await readMcpBody(await postMcp(request, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
    }, { authorization: 'Bearer valid-test-agent' }))
    expect(wrongScope.result?.structuredContent).not.toHaveProperty('result.saveNeed')

    const invalid = await postMcp(request, {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
    }, { authorization: 'Bearer invalid-test-agent' })
    expect(invalid.status).toBe(401)
    const malformed = await postMcp(request, {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
    }, { authorization: 'not-a-bearer' })
    expect(malformed.status).toBe(401)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('keeps readonly MCP search available but never offers a demand write', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([]))
    const response = await handleMcpRequest(new Request('https://ae.example/mcp?readonly=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer valid-test-agent' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 43,
        method: 'tools/call',
        params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } },
      }),
    }), { authenticate: authenticateWithScopes(['market_tools:call']), resolvePrincipal: async (projection) => ({
      ...projection, principalId: 'prn_00000000000040008000000000000044', ownerId: 'acc_00000000000040008000000000000044',
    }) })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result?.structuredContent).not.toHaveProperty('result.saveNeed')
    expect(run).toHaveBeenCalledTimes(1)
  })


  it('preserves the exhausted search scope without advertising a broaden operation', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([]))

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_tools_search',
        arguments: { query: 'plumbing', filters: { healthStatus: ['operational'] } },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect((result.structuredContent as { result?: { next: unknown } } | undefined)?.result?.next).toEqual([])
    expect(JSON.stringify(result.content)).not.toContain('ae_registry_tools_search(')
    expect(JSON.stringify(result.content)).toContain('scope: all/complete')
    run.mockRestore()
  })

  it('carries a next_page nextAction ahead of a request or broaden decision', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([
      { action: 'registry.tools.search', args: { query: 'plumbing', cursor: 'cursor-1' }, authority: 'public' },
    ], { limit: 8, hasMore: true, nextCursor: 'cursor-1' }))

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_tools_search',
        arguments: { query: 'plumbing' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect((result.structuredContent as { result?: { next: unknown } } | undefined)?.result?.next).toEqual([
      { action: 'registry.tools.search', args: { query: 'plumbing', cursor: 'cursor-1' }, authority: 'public' },
    ])
    expect(JSON.stringify(result.content)).toContain('ae_registry_tools_search({\\"query\\":\\"plumbing\\",\\"cursor\\":\\"cursor-1\\"})')
    expect(JSON.stringify(result.content)).toContain('scope: all/page')
    run.mockRestore()
  })

  it('exposes mixed inspection actions and unavailable retry in text and structured content', async () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    run.mockResolvedValueOnce(toolChoiceSearchOutputSchema.parse({
      schemaVersion: 'registry-tools:v3',
      kind: 'match',
      query: 'plumbing',
      assessed: { source: 'all', scope: 'complete', examined: 2, coverage: 'complete' },
      pagination: { limit: 8, hasMore: false },
      partialResults: false,
      next: [],
      results: [
        {
          id: toolRef, source: 'current', access: 'ae_callable', toolRef, title: 'AE Tool',
          summary: 'Retrieve data', provider: 'AE', actionClass: 'retrieve', objectClass: 'data',
          readiness: 'ready', price: { kind: 'indicative', label: 'A$0.02' }, detailRef: toolRef,
          next: [{ action: 'registry.tools.describe', authority: 'public', args: { toolRef } }],
        },
        {
          id: 'registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', source: 'coinbase', access: 'ae_callable', toolRef: 'registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', title: 'External Tool',
          summary: 'Retrieve data', provider: 'Outside', actionClass: 'retrieve', objectClass: 'data',
          readiness: 'unverified', price: { kind: 'unavailable' },
          detailRef: '/api/v1/registry/detail?id=registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          next: [],
        },
      ],
    }))
    run.mockResolvedValueOnce(toolChoiceSearchOutputSchema.parse({
      ...noMatch([{ action: 'registry.tools.search', authority: 'public', args: { query: 'plumbing' } }]),
      kind: 'unavailable',
      reason: 'source_unavailable',
      assessed: { source: 'all', scope: 'page', examined: 0, coverage: 'partial' },
    }))

    for (const [id, expected] of [
      [31, ['ae_registry_tools_describe(', 'ae_tool_quote({\\"toolRef\\":\\"registry:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\"})']],
      [32, ['Search unavailable', 'ae_registry_tools_search(']],
    ] as const) {
      const response = await postMcp({
        jsonrpc: '2.0', id, method: 'tools/call',
        params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } },
      })
      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      const result = body.result as Record<string, unknown>
      expect(result.isError).not.toBe(true)
      for (const value of expected) expect(JSON.stringify(result.content)).toContain(value)
      expect(result.structuredContent).toMatchObject({ result: { next: expect.any(Array) } })
    }
    run.mockRestore()
  })

  it('emits ae_search_outcome for zero-result and unavailable searches', async () => {
    vi.mocked(recordSearchOutcome).mockClear()
    const run = vi.spyOn(registryToolsSearchAction, 'run')
    run.mockResolvedValueOnce(noMatch([]))
    run.mockResolvedValueOnce(toolChoiceSearchOutputSchema.parse({ ...noMatch([]), kind: 'unavailable', reason: 'source_unavailable', assessed: { source: 'all', scope: 'page', examined: 0, coverage: 'partial' } }))
    for (const id of [51, 52]) {
      await readMcpBody(await postMcp({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'ae_registry_tools_search', arguments: { query: 'plumbing' } } }))
    }
    expect(recordSearchOutcome).toHaveBeenCalledTimes(2)
    expect(recordSearchOutcome).toHaveBeenNthCalledWith(1, { surface: 'mcp', resultKind: 'noMatch', resultCount: 0, callableCount: 0, externalListingCount: 0 })
    expect(recordSearchOutcome).toHaveBeenNthCalledWith(2, { surface: 'mcp', resultKind: 'unavailable', resultCount: 0, callableCount: 0, externalListingCount: 0 })
    run.mockRestore()
  })

  it('never uses the per-request correlation id as the refusal actor', async () => {
    vi.mocked(recordRefusal).mockClear()
    const toolRef = `operation:v1:${'b'.repeat(64)}`
    const run = vi.spyOn(registryToolsDescribeAction, 'run')
    run.mockResolvedValueOnce({ kind: 'not_found', schemaVersion: PublicToolRegistrySchemaVersion, toolRef })
    await readMcpBody(await postMcp({ jsonrpc: '2.0', id: 53, method: 'tools/call', params: { name: 'ae_registry_tools_describe', arguments: { toolRef } } }))
    expect(recordRefusal).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordRefusal).mock.calls[0]?.[0].actor).toBeUndefined()
    run.mockRestore()
  })

  it('returns an input validation error without invoking the describe action', async () => {
    const run = vi.spyOn(registryToolsDescribeAction, 'run')
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'ae_registry_tools_describe',
        arguments: {},
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ isError: true })
    expect(run).not.toHaveBeenCalled()
  })
  it('classifies a failed demand source as a retryable service outage rather than invalid input', async () => {
    vi.spyOn(marketRequestCreateAction, 'run').mockResolvedValue({ kind: 'refused', code: 'source_unavailable' })
    const response = await postMcp({
      jsonrpc: '2.0', id: 99, method: 'tools/call',
      params: { name: 'ae_marketDemand_record', arguments: { query: 'rare service', idempotencyKey: 'demand-fault-1' } },
    }, { authenticate: authenticateWithScopes(['market_tools:call']) }, { authorization: 'Bearer buyer' })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result?.isError).toBe(true)
    expect(body.result?.structuredContent).toMatchObject({
      result: { kind: 'refused', code: 'source_unavailable' }, next: [],
    })
  })
})
