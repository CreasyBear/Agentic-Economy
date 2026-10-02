import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authenticateWithScopes, postMcp, readMcpBody } from './mcp-api-harness'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))

describe('MCP host adapter account money', () => {
  it('dispatches balance through the exact buyer credential', async () => {
    const balance = vi.fn().mockResolvedValue({
      kind: 'available', principalRef: 'principal:test', accountRef: 'owner:test',
      balance: { currency: 'AUD', units: '25000000', exponent: 6 },
      accountState: 'active', version: 1, updatedAt: 10,
      funding: {
        kind: 'agent_funding_handoff', configAction: 'funding.handoff.config',
        createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status',
      },
    })
    const response = await postMcp({
      jsonrpc: '2.0', id: 'account-balance', method: 'tools/call',
      params: { name: 'ae_agentAccess_balance', arguments: { currency: 'AUD' } },
    }, {
      authenticate: authenticateWithScopes(['market_tools:call']),
      accountManagementService: { balance, activity: vi.fn() },
    }, { authorization: 'Bearer buyer-only' })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({
      kind: 'available', balance: { units: '25000000' },
      funding: { kind: 'agent_funding_handoff' },
    })
    expect(body.result?.structuredContent).toMatchObject({
      next: [{ action: 'fund', args: {}, authority: 'agent_key' }],
    })
    expect(balance).toHaveBeenCalledWith(expect.objectContaining({
      input: { currency: 'AUD' },
        principal: expect.objectContaining({ scopes: ['market_tools:call'] }),
    }))
  })

  it('refuses Provider-only credentials before account money dispatch', async () => {
    const balance = vi.fn()
    const response = await postMcp({
      jsonrpc: '2.0', id: 'provider-account-balance', method: 'tools/call',
      params: { name: 'ae_agentAccess_balance', arguments: { currency: 'AUD' } },
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      accountManagementService: { balance, activity: vi.fn() },
    }, { authorization: 'Bearer provider-only' })

    expect(response.status).toBe(200)
    expect((await readMcpBody(response)).result).toMatchObject({
      isError: true,
      structuredContent: { kind: 'PERMISSION_DENIED', code: 'mcp_toolset_required', next: [] },
    })
    expect(balance).not.toHaveBeenCalled()
  })
})
