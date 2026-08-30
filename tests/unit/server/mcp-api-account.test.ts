import { describe, expect, it, vi } from 'vitest'

import { authenticateWithScopes, postMcp, readMcpBody } from './mcp-api-harness'

describe('MCP host adapter account money', () => {
  it('dispatches balance through the exact buyer credential', async () => {
    const balance = vi.fn().mockResolvedValue({
      kind: 'available', principalRef: 'principal:test', accountRef: 'owner:test',
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
      accountState: 'active', version: 1, updatedAt: 10,
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
    })
    const response = await postMcp({
      jsonrpc: '2.0', id: 'account-balance', method: 'tools/call',
      params: { name: 'ae_agentAccess_balance', arguments: { currency: 'USD' } },
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      accountManagementService: { balance, activity: vi.fn() },
    }, { authorization: 'Bearer buyer-only' })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
      kind: 'available', balance: { units: '2500' },
      funding: { kind: 'owner_browser_required' },
    })
    expect(balance).toHaveBeenCalledWith(expect.objectContaining({
      input: { currency: 'USD' },
      principal: expect.objectContaining({ scopes: ['market_operations:invoke'] }),
    }))
  })

  it('refuses supplier-only credentials before account money dispatch', async () => {
    const balance = vi.fn()
    const response = await postMcp({
      jsonrpc: '2.0', id: 'supplier-account-balance', method: 'tools/call',
      params: { name: 'ae_agentAccess_balance', arguments: { currency: 'USD' } },
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      accountManagementService: { balance, activity: vi.fn() },
    }, { authorization: 'Bearer supplier-only' })

    expect(response.status).toBe(403)
    expect(balance).not.toHaveBeenCalled()
  })
})
