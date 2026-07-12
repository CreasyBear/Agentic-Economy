import { describe, expect, it } from 'vitest'

import { handleRoutingKernelMcpRequest } from '@/modules/routing-kernel/mcp'
import { createNeutralRoutingKernel, type KernelIdFactory } from '@/modules/routing-kernel/application'
import { createInMemoryKernelStore } from '@/modules/routing-kernel/runtime'
import { createParcelLabelSimulationBindings } from '@/modules/routing-tracer/public'

describe('routing-kernel MCP projection', () => {
  it('initializes and exposes the neutral kernel tools', async () => {
    const dependencies = authenticatedDependencies()
    const initialized = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' },
      },
    }), dependencies)
    expect(await initialized.json()).toMatchObject({
      jsonrpc: '2.0', id: 1,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } } },
    })

    const listed = await handleRoutingKernelMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), dependencies)
    const body = await listed.json() as { result: { tools: Array<{ name: string }> } }
    expect(body.result.tools.map((tool) => tool.name)).toEqual(['ae.route', 'ae.authorize', 'ae.execute', 'ae.reconcile', 'ae.inspect', 'ae.cancel'])
  })

  it('projects ae.route to the same kernel result and rejects caller identity in arguments', async () => {
    const dependencies = authenticatedDependencies()
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 'route-1', method: 'tools/call', params: {
        _meta: { progressToken: 'claude-host-route-1' },
        name: 'ae.route', arguments: {
          protocolVersion: 'ae-routing:v1', networkId: 'network:au-first',
          query: 'Purchase one tracked domestic parcel label.',
          constraints: { currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'latency' },
        },
      },
    }), dependencies)
    const body = await response.json()
    expect(body).toMatchObject({
      jsonrpc: '2.0', id: 'route-1',
      result: { structuredContent: { kind: 'quoted', quote: {
        routingSnapshot: { compilerVersion: 'routing-compiler:v2', constraints: { optimizeFor: 'latency' } },
        organicDecision: { optimizerVersion: 'organic-cost-latency-evidence:v2', optimizeFor: 'latency' },
        selectedGraph: { bindingId: 'binding:parcel-sim-express:v1' },
      } } },
    })

    const rejected = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
        name: 'ae.route', arguments: {
          protocolVersion: 'ae-routing:v1', networkId: 'network:au-first', query: 'parcel label',
          constraints: { currency: 'AUD', maximumSpendMinor: 1_500 }, caller: { agentId: 'forged' },
        },
      },
    }), dependencies)
    expect(await rejected.json()).toMatchObject({ result: { isError: true } })
  })

  it('authenticates before invoking a tool', async () => {
    let invoked = false
    const kernel = createKernel()
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ae.inspect', arguments: { protocolVersion: 'ae-routing:v1', rootRunId: 'missing' } },
    }), {
      operations: { ...kernel.operations, inspect: async (input) => { invoked = true; return await kernel.operations.inspect(input) } },
      authenticate: async () => ({ kind: 'unauthenticated' }),
    })
    expect(response.status).toBe(401)
    expect(invoked).toBe(false)
  })

  it('uses the same transactional admission contract for MCP tools', async () => {
    let invoked = false
    const kernel = createKernel()
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 'busy-mcp', method: 'tools/call',
      params: { name: 'ae.execute', arguments: {} },
    }, { 'X-AE-Edge-Request-Id': 'edge-mcp-busy' }), {
      operations: { ...kernel.operations, execute: async (input) => { invoked = true; return await kernel.operations.execute(input) } },
      authenticate: async () => ({ kind: 'authenticated', caller: { agentId: 'agent:mcp-busy', principalId: 'principal:mcp-busy' } }),
      admission: {
        admit: async (input) => {
          expect(input).toMatchObject({ requestId: 'edge-mcp-busy', agentId: 'agent:mcp-busy', operation: 'execute' })
          return { kind: 'refused', reason: 'agent_quota_exceeded', retryAfterMs: 1_100 }
        },
        release: async () => { throw new Error('refused admission must not release') },
      },
    })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('2')
    expect(await response.json()).toMatchObject({ error: { code: -32002, message: 'agent_quota_exceeded' } })
    expect(invoked).toBe(false)
  })

  it('runs one route through trusted authorization, MCP execute, and MCP inspect', async () => {
    const kernel = createKernel()
    const dependencies = { operations: kernel.operations, authenticate: async () => ({ kind: 'authenticated' as const, caller: { agentId: 'agent:mcp-1', principalId: 'principal:merchant-1' } }) }
    const routedResponse = await handleRoutingKernelMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'ae.route', arguments: { protocolVersion: 'ae-routing:v1', networkId: 'network:au-first', query: 'Purchase one tracked domestic parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } } } }), dependencies)
    const routed = await routedResponse.json() as { result: { structuredContent: { quote: { quoteId: string; quoteDigest: string } } } }
    const quote = routed.result.structuredContent.quote
    const authorization = await kernel.authority.authorize({ quoteId: quote.quoteId, quoteDigest: quote.quoteDigest, principalId: 'principal:merchant-1', agentId: 'agent:mcp-1', maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000 })
    const executedResponse = await handleRoutingKernelMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'ae.execute', arguments: { protocolVersion: 'ae-routing:v1', quoteId: quote.quoteId, quoteDigest: quote.quoteDigest, authorizationRef: authorization.authorizationRef, idempotencyKey: 'mcp:parcel:1' } } }), dependencies)
    const executed = await executedResponse.json() as { result: { structuredContent: { run: { rootRunId: string; state: string } } } }
    expect(executed.result.structuredContent.run.state).toBe('completed')
    const inspectedResponse = await handleRoutingKernelMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'ae.inspect', arguments: { protocolVersion: 'ae-routing:v1', rootRunId: executed.result.structuredContent.run.rootRunId } } }), dependencies)
    expect((await inspectedResponse.json() as { result: { structuredContent: unknown } }).result.structuredContent).toMatchObject({ kind: 'run_found', run: { state: 'completed' } })
  })

  it('accepts quote-bound inline approval through execute', async () => {
    const kernel = createKernel()
    const caller = { agentId: 'agent:mcp-approval', principalId: 'principal:merchant-1' }
    const routed = await kernel.operations.route({ caller, networkId: 'network:au-first', query: 'Purchase one tracked domestic parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    expect(routed.kind).toBe('quoted')
    if (routed.kind !== 'quoted') return
    const response = await handleRoutingKernelMcpRequest(mcpRequest({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'ae.execute', arguments: {
      protocolVersion: 'ae-routing:v1', quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      approval: { maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000, allowedDataFields: [] },
      idempotencyKey: 'mcp:inline-approval:1',
    } } }), {
      operations: kernel.operations,
      authenticate: async () => ({ kind: 'authenticated', caller, grant: { grantId: 'grant:mcp-test', networkIds: ['network:au-first'], maximumSpendMinor: 1_500, currency: 'AUD', allowedDataFields: [], protectedFieldSetId: 'field-set:test:v1', maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0, allowedRecipientBindingIds: ['binding:easypost:v1'], allowedDisclosurePurposes: ['capability:parcel-label-purchase:v1'], expiresAt: Number.MAX_SAFE_INTEGER } }),
      authorize: async (input) => {
        const authorization = await kernel.authority.authorize({ ...input, principalId: input.caller.principalId, agentId: input.caller.agentId })
        return { kind: 'authorized', authorizationRef: authorization.authorizationRef }
      },
    })
    expect(await response.json()).toMatchObject({ result: { structuredContent: { kind: 'run_admitted', run: { state: 'completed' } } } })
  })

  it('returns an authorization reference through ae.authorize before execution', async () => {
    const kernel = createKernel()
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'ae.authorize', arguments: {
        protocolVersion: 'ae-routing:v1', quoteId: 'quote:mcp-authorize', quoteDigest: 'sha256:mcp-authorize',
        maximumSpendMinor: 100, currency: 'AUD', expiresAt: 2_000,
        allowedDataFields: [], idempotencyKey: 'mcp:authorize:1',
      } },
    }), {
      operations: kernel.operations,
      authenticate: async () => ({
        kind: 'authenticated', caller: { agentId: 'agent:mcp-authorize', principalId: 'principal:mcp-authorize' },
        grant: { grantId: 'grant:mcp-authorize', networkIds: ['network:au-first'], maximumSpendMinor: 100,
          currency: 'AUD', allowedDataFields: [], protectedFieldSetId: 'field-set:test:v1',
          maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0, allowedRecipientBindingIds: [],
          allowedDisclosurePurposes: [], expiresAt: 3_000 },
      }),
      authorize: async () => ({ kind: 'authorized', authorizationRef: 'authorization:mcp-authorize' }),
    })
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { kind: 'authorized', authorizationRef: 'authorization:mcp-authorize' }, isError: false },
    })
  })

  it('projects the same quote-undeclared data refusal through MCP', async () => {
    const kernel = createKernel()
    const caller = { agentId: 'agent:mcp-disclosure', principalId: 'principal:merchant-1' }
    const routed = await kernel.operations.route({ caller, networkId: 'network:au-first', query: 'Purchase one tracked domestic parcel label.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId,
      maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000, allowedDataFields: ['private_note'],
    })

    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'ae.execute', arguments: {
        protocolVersion: 'ae-routing:v1', quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
        authorizationRef: authorization.authorizationRef, idempotencyKey: 'mcp:undeclared-data', data: { private_note: 'not quoted' },
      } },
    }), {
      operations: kernel.operations,
      authenticate: async () => ({ kind: 'authenticated', caller }),
    })

    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0', id: 30,
      result: { structuredContent: { kind: 'execution_refused', reason: 'data_not_declared_by_quote' }, isError: false },
    })
  })

  it('forwards paired canary purpose and recovery authority through ae.execute', async () => {
    const kernel = createKernel()
    let received: Parameters<typeof kernel.operations.execute>[0] | undefined
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 40, method: 'tools/call', params: { name: 'ae.execute', arguments: {
        protocolVersion: 'ae-routing:v1', quoteId: 'quote:canary', quoteDigest: 'sha256:canary',
        authorizationRef: 'authorization:canary', idempotencyKey: 'mcp:canary:1',
        executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:canary:1',
      } },
    }), {
      operations: { ...kernel.operations, execute: async (input) => {
        received = input
        return { kind: 'execution_refused', reason: 'test_boundary' }
      } },
      authenticate: async () => ({
        kind: 'authenticated', caller: { agentId: 'agent:mcp-canary', principalId: 'principal:incident-responder' },
      }),
    })
    expect((await response.json() as { result: { isError: boolean } }).result.isError).toBe(false)
    expect(received).toMatchObject({
      executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:canary:1',
    })
  })

  it('projects provider reconciliation with transport-owned caller identity and no caller-supplied evidence', async () => {
    const kernel = createKernel()
    let received: Parameters<typeof kernel.operations.reconcileProviderOutcome>[0] | undefined
    const caller = { agentId: 'agent:mcp-reconcile', principalId: 'principal:mcp-reconcile' }
    const response = await handleRoutingKernelMcpRequest(mcpRequest({
      jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'ae.reconcile', arguments: {
        protocolVersion: 'ae-routing:v1', rootRunId: 'root-run:unknown-1', recoveryGrantId: 'recovery:1',
      } },
    }), {
      operations: { ...kernel.operations, reconcileProviderOutcome: async (input) => {
        received = input
        return { kind: 'provider_reconciliation_pending', rootRunId: input.rootRunId }
      } },
      authenticate: async () => ({ kind: 'authenticated', caller }),
    })
    expect(received).toEqual({ caller, rootRunId: 'root-run:unknown-1', recoveryGrantId: 'recovery:1' })
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { kind: 'provider_reconciliation_pending', rootRunId: 'root-run:unknown-1' }, isError: false },
    })
  })
})

function mcpRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const method = typeof body === 'object' && body !== null && 'method' in body ? (body as { method?: unknown }).method : undefined
  return new Request('https://ae.example/mcp', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      ...(method === 'initialize' ? {} : { 'MCP-Protocol-Version': '2025-06-18' }),
      ...headers,
    }, body: JSON.stringify(body),
  })
}

function authenticatedDependencies() {
  const kernel = createKernel()
  return {
    operations: kernel.operations,
    authenticate: async () => ({ kind: 'authenticated' as const, caller: { agentId: 'agent:mcp-1', principalId: 'principal:merchant-1' } }),
  }
}

function createKernel() {
  let value = 0
  const ids: KernelIdFactory = { next: (prefix) => `${prefix}:${++value}` }
  return createNeutralRoutingKernel({ now: () => 1_750_000_000_000, executionMode: 'simulation', ids, quoteTtlMs: 60_000, bindings: createParcelLabelSimulationBindings(), store: createInMemoryKernelStore() })
}
