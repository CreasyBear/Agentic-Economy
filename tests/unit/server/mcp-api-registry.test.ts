import { postMcp, readMcpBody } from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

import {
  registryOperationsDescribeAction,
  registryOperationsSearchAction,
} from '@/modules/registry/operations.actions'

describe('MCP host adapter registry', () => {
  it('calls the registered registry search action with MCP attribution', async () => {
    const run = vi.spyOn(registryOperationsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates',
      schemaVersion: 'registry-operations:v3',
      query: 'plumbing',
      count: 0,
      items: [],
      note: 'No operational Operations matched this search.',
      pagination: { limit: 10, hasMore: false },
    })

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_operations_search',
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
  })

  it('returns an input validation error without invoking the describe action', async () => {
    const run = vi.spyOn(registryOperationsDescribeAction, 'run')
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'ae_registry_operations_describe',
        arguments: {},
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ isError: true })
    expect(run).not.toHaveBeenCalled()
  })
})
