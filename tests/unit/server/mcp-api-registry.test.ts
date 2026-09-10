import { postMcp, readMcpBody } from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

import {
  registryToolsDescribeAction,
  registryToolsSearchAction,
} from '@/modules/registry/tools.actions'

describe('MCP host adapter registry', () => {
  it('calls the registered registry search action with MCP attribution', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: 'plumbing',
      count: 0,
      items: [],
      note: 'No operational Tools matched this search.',
      pagination: { limit: 10, hasMore: false },
    })

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
      kind: 'no_candidates',
    })
    expect((result.structuredContent as { nextAction?: unknown } | undefined)?.nextAction).toEqual({
      kind: 'request',
      query: 'plumbing',
    })
    run.mockRestore()
  })

  it('carries a broaden nextAction when a filtered search is exhausted', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: 'plumbing',
      count: 0,
      items: [],
      note: 'No Tools match this search.',
      pagination: { limit: 10, hasMore: false },
    })

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
    expect((result.structuredContent as { nextAction?: unknown } | undefined)?.nextAction).toEqual({
      kind: 'broaden',
    })
    run.mockRestore()
  })

  it('carries a next_page nextAction ahead of a request or broaden decision', async () => {
    const run = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: 'plumbing',
      count: 0,
      items: [],
      note: 'No Tools match this search on this page.',
      pagination: { limit: 10, hasMore: true, nextCursor: 'cursor-1' },
    })

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
    expect((result.structuredContent as { nextAction?: unknown } | undefined)?.nextAction).toEqual({
      kind: 'next_page',
      cursor: 'cursor-1',
    })
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
