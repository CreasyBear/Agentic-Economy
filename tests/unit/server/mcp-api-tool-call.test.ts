import {
  currentToolRef,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { executeDecisionGateway } from '@/modules/decision-engine/public'

vi.mock('@/modules/decision-engine/public', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  executeDecisionGateway: vi.fn(),
}))

const quoteRef = `operation-commitment:v1:${'b'.repeat(64)}`

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))

describe('MCP host adapter tool.call', () => {
  it('authenticates tool.call and delegates the same registered action', async () => {
    const record=vi.fn()
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
        claims: { aeEnvironment: 'sandbox' },
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
      callService: executor, timing:{record},
    })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toMatchObject({ kind: 'completed', toolRef: currentToolRef })
    expect(resolvedScopes).toEqual([['market_tools:call']])
    expect(resolvedResources).toEqual(['surface:mcp:tool.call'])
    expect(record).toHaveBeenCalledWith('gateway.operation',expect.any(Number),expect.objectContaining({transport:'mcp',operation:'call',stage:'execution',credentialId:'key:test',outcome:'completed',invocationRef:'invocation:test',operationRef:currentToolRef}))
    expect(executor.callTool).toHaveBeenCalledOnce()
    expect(executor.callTool).toHaveBeenCalledWith(expect.objectContaining({
      input: { quoteRef, idempotencyKey: 'mcp-key-1' },
      principal: expect.objectContaining({
        principalId: 'prn_00000000000040008000000000000044',
        ownerId: 'acc_00000000000040008000000000000044',
      }),
    }))
  })

  it('shows the selected Tool input schema and typed next in MCP text and structured output without buying', async () => {
    vi.mocked(executeDecisionGateway).mockResolvedValueOnce({
      tier: 'jev_system_one', model: 'test-selector',
      answers: { selectedTool: { type: 'choice', choice: currentToolRef, confidence: 1, probabilities: { [currentToolRef]: 1 } } },
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostAud: null },
      durationMs: 0, attemptedTiers: ['jev_system_one'],
    })
    const record = vi.fn()
    const inputJsonSchema = { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
    const callTool = vi.fn()
    const quoteTool = vi.fn()
    const response = await postMcp({
      jsonrpc: '2.0', id: 'need', method: 'tools/call',
      params: { name: 'ae_tool_procure', arguments: { kind: 'need', need: 'Find this dataset' } },
    }, {
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'key:test', subject: 'user_test', scopes: ['market_tools:call'],
        claims: { aeEnvironment: 'sandbox' },
      }),
      timing: { record },
      catalogSearcher: async () => [{
        toolRef: currentToolRef, name: 'Dataset search', description: 'Searches datasets',
        endpoint: 'https://provider.example/search', priceAud: '0.25', inputSchema: inputJsonSchema,
      }],
      callService: { callTool, quoteTool, readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
    }, { authorization: 'Bearer buyer' })
    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result?.structuredContent).toMatchObject({
      result: { status: 'needs_input', toolRef: currentToolRef, inputJsonSchema, requiredFields: ['query'], next: { action: 'tool.procure', args: { kind: 'exact', toolRef:currentToolRef }, requiredInput: ['input', 'maxSpendAud', 'idempotencyKey'], authority: 'agent_key' } },
      next: [{ action: 'tool.procure', args: { kind: 'exact', toolRef: currentToolRef }, requiredInput: ['input', 'maxSpendAud', 'idempotencyKey'], authority: 'agent_key' }],
    })
    expect(JSON.stringify(body.result?.content)).toContain('query')
    expect(JSON.stringify(body.result?.content)).toContain(currentToolRef)
    expect(quoteTool).not.toHaveBeenCalled()
    expect(callTool).not.toHaveBeenCalled()
    expect(record.mock.calls.filter(([metric]) => metric === 'gateway.operation')).toEqual([])
  })

  it('preserves a refused Call reference and status continuation without prose leakage', async () => {
    const record = vi.fn()
    const callRef = `operation-invocation:v1:${'d'.repeat(64)}`
    const callTool = vi.fn().mockResolvedValue({
      kind: 'needs_authority', callRef, toolRef: currentToolRef, authorityRequest: { kind: 'approval_required', toolRef: currentToolRef, consequence: 'external_effect', retryClass: 'reconcile_before_retry', dataFields: [] },
    })
    const response = await postMcp({
      jsonrpc: '2.0', id: 'refused-call', method: 'tools/call',
      params: { name: 'ae_tool_call', arguments: { quoteRef, idempotencyKey: 'refused-call-key' } },
    }, {
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'key:test', subject: 'user_test', scopes: ['market_tools:call'],
        claims: { aeEnvironment: 'sandbox' },
      }),
      timing: { record },
      callService: { callTool, readCallStatus: vi.fn(), cancelCall: vi.fn(), reconcileCall: vi.fn() },
    }, { authorization: 'Bearer buyer' })
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      isError: true,
      structuredContent: {
        result: { kind: 'refused', code: 'authority_required', callRef, ownerHandoff: { actor: 'account_owner', reason: 'authority_required' } },
        next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
      },
    })
    expect(JSON.stringify(body.result?.content)).not.toContain(callRef)
    expect(callTool).toHaveBeenCalledOnce()
    expect(record).toHaveBeenCalledWith('gateway.operation', expect.any(Number), expect.objectContaining({ operation: 'call', outcome: 'needs_authority', approval: 'required', invocationRef: callRef }))
  })
})
