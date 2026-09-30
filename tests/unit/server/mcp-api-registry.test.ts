import { authenticateWithScopes, handleMcpRequest, postMcp, readMcpBody } from './mcp-api-harness'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  registryToolsDescribeAction,
  registryToolsSearchAction,
} from '@/modules/registry/tools.actions'
import { toolChoiceSearchOutputSchema, type RegistryNextAction } from '@/modules/registry/tool-choice-contracts'
import { marketRequestCreateAction } from '@/modules/market-demand/market-demand.actions'

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


  it('carries a broaden nextAction when a filtered search is exhausted', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([
      { action: 'broaden', args: { query: 'plumbing' }, authority: 'public' },
    ]))

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
    expect((result.structuredContent as { result?: { next: unknown } } | undefined)?.result?.next).toEqual([
      { action: 'broaden', args: { query: 'plumbing' }, authority: 'public' },
    ])
    expect(JSON.stringify(result.content)).toContain('ae_registry_tools_search({\\"query\\":\\"plumbing\\"})')
    expect(JSON.stringify(result.content)).toContain('scope: all/complete')
    run.mockRestore()
  })

  it('carries a next_page nextAction ahead of a request or broaden decision', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([
      { action: 'next-page', args: { query: 'plumbing', cursor: 'cursor-1' }, authority: 'public' },
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
      { action: 'next-page', args: { query: 'plumbing', cursor: 'cursor-1' }, authority: 'public' },
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
          next: [{ action: 'describe', authority: 'public', args: { toolRef } }],
        },
        {
          id: 'opaque-1', source: 'coinbase', access: 'external_listing', title: 'External Tool',
          summary: 'Retrieve data', provider: 'Outside', actionClass: 'retrieve', objectClass: 'data',
          readiness: 'unverified', price: { kind: 'unavailable' },
          detailRef: '/api/v1/registry/detail?id=opaque-1',
          next: [{ action: 'describe-external', authority: 'public', args: { id: 'opaque-1' } }],
        },
      ],
    }))
    run.mockResolvedValueOnce(toolChoiceSearchOutputSchema.parse({
      ...noMatch([{ action: 'retry', authority: 'public', args: { query: 'plumbing' } }]),
      kind: 'unavailable',
      reason: 'source_unavailable',
      assessed: { source: 'all', scope: 'page', examined: 0, coverage: 'partial' },
    }))

    for (const [id, expected] of [
      [31, ['ae_registry_tools_describe(', 'curl --fail', '/api/v1/registry/detail?id=opaque-1']],
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
    expect((await readMcpBody(response)).result?.structuredContent).toMatchObject({
      status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true,
    })
  })
})
