import { describe, expect, it, vi } from 'vitest'
import { authenticateWithScopes, postMcp, readMcpBody } from './mcp-api-harness'

describe('MCP private request withdrawal', () => {
  it.each([true, false])('requires buyer access before withdrawal (authorized=%s)', async authorized => {
    const withdraw = vi.fn().mockResolvedValue({ kind: 'withdrawn', requestRef: 'market-request:one' })
    const response = await postMcp({
      jsonrpc: '2.0', id: 'withdraw', method: 'tools/call',
      params: { name: 'ae_marketDemand_withdraw', arguments: { requestRef: 'market-request:one' } },
    }, {
      authenticate: authenticateWithScopes(authorized ? ['market_tools:call'] : ['market_supply:manage']),
      marketDemandService: { create: vi.fn(), list: vi.fn(), status: vi.fn(), withdraw },
    }, { authorization: 'Bearer test-only' })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    if (!authorized) {
      expect(body.result).toMatchObject({
        isError: true,
        structuredContent: { kind: 'PERMISSION_DENIED', code: 'mcp_toolset_required', next: [] },
      })
      expect(withdraw).not.toHaveBeenCalled()
      return
    }
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result)
      .toEqual({ kind: 'withdrawn', requestRef: 'market-request:one' })
    expect(withdraw).toHaveBeenCalledWith(expect.objectContaining({
      input: { requestRef: 'market-request:one' },
      principal: expect.objectContaining({ scopes: ['market_tools:call'] }),
    }))
  })
})
