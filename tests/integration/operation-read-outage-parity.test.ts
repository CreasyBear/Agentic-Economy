import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleMcpRequest } from '@/lib/server/mcp-api'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { setPublicDiscoverySourcePortForTests } from '@/modules/discovery/discovery.functions'
import { registryOperationsSearchAction } from '@/modules/registry/operations.actions'
import { OPERATION_READ_UNAVAILABLE_PROBLEM } from '@/modules/registry/public'
import { handleMarketOperationSearchRequest } from '@/routes/api.v1.market-operations.search'
import { handleDurableLlmsTxtRequest } from '@/routes/llms[.]txt'
import { CliFailure, readHttpOutcome, requireOk } from '../../tools/ae/lib/output'

afterEach(() => {
  setHttpRateLimitAdmissionForTests(undefined)
  setPublicDiscoverySourcePortForTests(undefined)
  vi.restoreAllMocks()
})

describe('Operation read outage parity', () => {
  it('keeps HTTP, MCP, llms.txt, CLI, and the public skill on one failure contract', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    vi.spyOn(registryOperationsSearchAction, 'run').mockRejectedValue(new Error('private source failure'))

    const httpResponse = await handleMarketOperationSearchRequest(jsonRequest(
      'https://ae.example/api/v1/market-operations/search',
      { query: 'weather forecast' },
    ))
    const cliResponse = httpResponse.clone()
    expect(httpResponse.status).toBe(503)
    expect(httpResponse.headers.get('content-type')).toBe('application/problem+json')
    await expect(httpResponse.json()).resolves.toMatchObject(OPERATION_READ_UNAVAILABLE_PROBLEM)

    const mcpResponse = await handleMcpRequest(jsonRequest('https://ae.example/mcp', {
      jsonrpc: '2.0',
      id: 'outage-parity',
      method: 'tools/call',
      params: {
        name: 'ae_registry_operations_search',
        arguments: { query: 'weather forecast' },
      },
    }, { accept: 'application/json, text/event-stream' }))
    expect(mcpResponse.status).toBe(200)
    const mcpBody = await mcpResponse.json() as {
      result?: { isError?: boolean; structuredContent?: Record<string, unknown> }
    }
    expect(mcpBody.result?.isError).toBe(true)
    expect(mcpBody.result?.structuredContent).toMatchObject(OPERATION_READ_UNAVAILABLE_PROBLEM)

    const restoreDiscovery = setPublicDiscoverySourcePortForTests({
      llms: async () => { throw new Error('private discovery failure') },
      sitemap: async () => { throw new Error('not called') },
    })
    const llmsResponse = await handleDurableLlmsTxtRequest(new Request('https://ae.example/llms.txt'))
    restoreDiscovery()
    expect(llmsResponse.status).toBe(503)
    expect(llmsResponse.headers.get('content-type')).toBe('application/problem+json')
    await expect(llmsResponse.json()).resolves.toMatchObject(OPERATION_READ_UNAVAILABLE_PROBLEM)

    const cliOutcome = await readHttpOutcome(cliResponse, Date.now())
    expect(() => requireOk(cliOutcome, '/api/v1/market-operations/search')).toThrow(CliFailure)
    try {
      requireOk(cliOutcome, '/api/v1/market-operations/search')
    } catch (error) {
      expect(error).toMatchObject({
        kind: OPERATION_READ_UNAVAILABLE_PROBLEM.kind,
        code: OPERATION_READ_UNAVAILABLE_PROBLEM.code,
        retryable: true,
      })
    }

    const skill = buildPublicAgentSkillMarkdown({ canonicalBaseUrl: 'https://ae.example' })
    expect(skill).toContain('`operation_read_unavailable` means no catalogue read completed')
    expect(skill).toContain('It is retryable')
    expect(skill).toContain('never proof that an Operation is absent')
  })
})

function jsonRequest(url: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
