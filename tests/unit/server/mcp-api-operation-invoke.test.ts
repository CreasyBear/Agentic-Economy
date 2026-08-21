import {
  currentOperationRef,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

describe('MCP host adapter operation.invoke', () => {
  it('authenticates operation.invoke and delegates the same registered action', async () => {
    const executor = {
      invokeOperation: vi.fn().mockResolvedValue({
        kind: 'completed',
        invocationRef: 'invocation:test',
        operationRef: currentOperationRef,
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
      readInvocationStatus: vi.fn(),
      cancelInvocation: vi.fn(),
      reconcileInvocation: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'ae_operation_invoke',
        arguments: {
          operationRef: currentOperationRef,
          input: {},
          idempotencyKey: 'mcp-key-1',
        },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: true,
        tokenType: 'api_key',
        id: 'key:test',
        subject: 'user_test',
        scopes: ['market_operations:invoke'],
      }),
      operationInvokeService: executor,
    })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({ kind: 'completed', operationRef: currentOperationRef })
    expect(executor.invokeOperation).toHaveBeenCalledOnce()
  })
})
