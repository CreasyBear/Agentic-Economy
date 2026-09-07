import {
  currentToolRef,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`

describe('MCP host adapter tool.call', () => {
  it('authenticates tool.call and delegates the same registered action', async () => {
    const resolvedScopes: Array<readonly string[]> = []
    const resolvedResources: string[] = []
    const executor = {
      callTool: vi.fn().mockResolvedValue({
        kind: 'completed',
        callRef: 'invocation:test',
        toolRef: currentToolRef,
        output: { value: 42 },
        evidenceHash: 'evidence:test',
        usage: {
          usageRef: 'usage:test',
          observedAt: 1_700_000_000_000,
          chargeState: 'free_tier',
          amount: { currency: 'USD', units: '0', exponent: 2 },
          priceDigest: 'price:test',
        },
      }),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'ae_tool_call',
        arguments: {
          quoteRef,
          idempotencyKey: 'mcp-key-1',
        },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'key:test',
        subject: 'user_test',
        scopes: ['market_tools:call'],
      }),
      resolvePrincipal: async (projection, requiredScopes, consequenceResource) => {
        resolvedScopes.push(requiredScopes)
        resolvedResources.push(consequenceResource)
        return {
          ...projection,
          principalId: 'prn_00000000000040008000000000000044',
          ownerId: 'acc_00000000000040008000000000000044',
        }
      },
      callService: executor,
    })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({ kind: 'completed', toolRef: currentToolRef })
    expect(resolvedScopes).toEqual([['market_tools:call']])
    expect(resolvedResources).toEqual(['surface:mcp:tool.call'])
    expect(executor.callTool).toHaveBeenCalledOnce()
    expect(executor.callTool).toHaveBeenCalledWith(expect.objectContaining({
      input: { quoteRef, idempotencyKey: 'mcp-key-1' },
      principal: expect.objectContaining({
        principalId: 'prn_00000000000040008000000000000044',
        ownerId: 'acc_00000000000040008000000000000044',
      }),
    }))
  })
})
