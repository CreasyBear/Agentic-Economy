import { postMcp, readMcpBody } from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

import {
  registryToolsDescribeAction,
  registryToolsSearchAction,
} from '@/modules/registry/tools.actions'
import type { RegistryNextAction } from '@/modules/registry/tool-choice-contracts'

function noMatch(
  next: readonly RegistryNextAction[],
  pagination: { limit: number; hasMore: boolean; nextCursor?: string } = { limit: 10, hasMore: false },
) {
  return {
    kind: 'noMatch' as const,
    schemaVersion: 'registry-tools:v3' as const,
    query: 'plumbing',
    scope: pagination.hasMore ? 'page' as const : 'exhausted' as const,
    reason: 'No suitable Tools found.',
    results: [] as const,
    nearMisses: [],
    suggestions: [],
    partialResults: false,
    pagination,
    next,
  }
}

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
      data: { query: 'plumbing', limit: 10 },
      context: expect.objectContaining({ caller: 'mcp' }),
    })
    expect((result.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
      kind: 'noMatch',
      scope: 'exhausted',
      next: [],
    })
    expect(JSON.stringify(result.content)).not.toContain('"results"')
    run.mockRestore()
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
    run.mockRestore()
  })

  it('carries a next_page nextAction ahead of a request or broaden decision', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(noMatch([
      { action: 'next-page', args: { query: 'plumbing', cursor: 'cursor-1' }, authority: 'public' },
    ], { limit: 10, hasMore: true, nextCursor: 'cursor-1' }))

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
})
