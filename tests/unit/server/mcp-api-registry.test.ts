import { postMcp, readMcpBody } from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

import { registryDetailAction, registrySearchAction } from '@/modules/registry/registry.actions'

describe('MCP host adapter registry', () => {
  it('calls the registered registry search action with MCP attribution', async () => {
    const run = vi.spyOn(registrySearchAction, 'run').mockResolvedValue({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      query: 'plumbing',
      items: [],
      pagination: { limit: 10, total: 0, hasMore: false },
    } as never)

    const response = await postMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ae_registry_search',
        arguments: { query: 'plumbing' },
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    const result = body.result as Record<string, unknown>
    expect(run).toHaveBeenCalledWith({
      data: { query: 'plumbing' },
      context: expect.objectContaining({ caller: 'mcp' }),
    })
    expect((result.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
      kind: 'ok',
    })
  })

  it('returns an input validation error without invoking the detail action', async () => {
    const run = vi.spyOn(registryDetailAction, 'run')
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'ae_registry_detail',
        arguments: {},
      },
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ isError: true })
    expect(run).not.toHaveBeenCalled()
  })
})
