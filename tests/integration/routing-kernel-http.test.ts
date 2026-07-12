import { describe, expect, it } from 'vitest'

import { handleRoutingKernelHttpRequest } from '@/modules/routing-kernel/http'
import {
  createNeutralRoutingKernel,
  type KernelIdFactory,
} from '@/modules/routing-kernel/application'
import { createInMemoryKernelStore } from '@/modules/routing-kernel/runtime'
import { createReferenceCapabilityBindings } from '@/modules/routing-tracer/public'

describe('routing-kernel HTTP/JSON projection', () => {
  it('authenticates the caller and projects route without exposing a provider tool menu', async () => {
    const kernel = createKernel()
    const request = new Request('https://ae.example/v1/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer caller-token' },
      body: JSON.stringify({
        protocolVersion: 'ae-routing:v1',
        networkId: 'network:au-first',
        query: 'Prepare one reference option.',
        constraints: { currency: 'AUD', maximumSpendMinor: 1_500, optimizeFor: 'latency' },
      }),
    })

    const response = await handleRoutingKernelHttpRequest(request, {
      operations: kernel.operations,
      authenticate: async (candidate) => candidate.headers.get('Authorization') === 'Bearer caller-token'
        ? { kind: 'authenticated', caller: { agentId: 'agent:http-1', principalId: 'principal:merchant-1' } }
        : { kind: 'unauthenticated' },
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      protocolVersion: 'ae-routing:v1',
      operation: 'route',
      result: {
        kind: 'quoted',
        quote: {
          executionMode: 'simulation',
          routingSnapshot: { compilerVersion: 'routing-compiler:v2', constraints: { optimizeFor: 'latency' } },
          organicDecision: { optimizerVersion: 'organic-cost-latency-evidence:v2', optimizeFor: 'latency' },
          selectedGraph: { bindingId: 'binding:reference-priority:v1' },
        },
      },
    })
    expect(JSON.stringify(body)).not.toMatch(/list_tools|providerTools|toolMenu/)
  })

  it('rejects an unauthenticated request before invoking an operation', async () => {
    let invoked = false
    const kernel = createKernel()
    const response = await handleRoutingKernelHttpRequest(new Request('https://ae.example/v1/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 'ae-routing:v1', rootRunId: 'root-run:missing' }),
    }), {
      operations: {
        ...kernel.operations,
        inspect: async (input) => {
          invoked = true
          return await kernel.operations.inspect(input)
        },
      },
      authenticate: async () => ({ kind: 'unauthenticated' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      protocolVersion: 'ae-routing:v1',
      operation: 'inspect',
      error: { code: 'authentication_required', retryable: false },
    })
    expect(invoked).toBe(false)
  })

  it('projects transactional admission refusal before invoking the kernel', async () => {
    let invoked = false
    const kernel = createKernel()
    const request = jsonRequest('/v1/inspect', { protocolVersion: 'ae-routing:v1', rootRunId: 'root-run:busy' }, {
      'X-AE-Edge-Request-Id': 'edge-request-busy',
    })
    const response = await handleRoutingKernelHttpRequest(request, {
      operations: { ...kernel.operations, inspect: async (input) => { invoked = true; return await kernel.operations.inspect(input) } },
      authenticate: async () => ({ kind: 'authenticated', caller: { agentId: 'agent:busy', principalId: 'principal:busy' } }),
      admission: {
        admit: async (input) => {
          expect(input).toMatchObject({ requestId: 'edge-request-busy', agentId: 'agent:busy', operation: 'inspect' })
          return { kind: 'refused', reason: 'kernel_saturated', retryAfterMs: 2_100 }
        },
        release: async () => { throw new Error('refused admission must not release') },
      },
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('3')
    expect(await response.json()).toMatchObject({ error: { code: 'kernel_saturated' } })
    expect(invoked).toBe(false)
  })

  it('preserves one semantic root across HTTP route, trusted authorization, execute, and inspect', async () => {
    const kernel = createKernel()
    const authenticate = async () => ({
      kind: 'authenticated' as const,
      caller: { agentId: 'agent:http-1', principalId: 'principal:merchant-1' },
    })
    const dependencies = { operations: kernel.operations, authenticate }
    const routeResponse = await handleRoutingKernelHttpRequest(jsonRequest('/v1/route', {
      protocolVersion: 'ae-routing:v1',
      networkId: 'network:au-first',
      query: 'Prepare one reference option.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    }), dependencies)
    const routed = await routeResponse.json() as {
      result: { kind: string; quote: { quoteId: string; quoteDigest: string } }
    }
    expect(routed.result.kind).toBe('quoted')

    const authorization = await kernel.authority.authorize({
      quoteId: routed.result.quote.quoteId,
      quoteDigest: routed.result.quote.quoteDigest,
      principalId: 'principal:merchant-1',
      agentId: 'agent:http-1',
      maximumSpendMinor: 1_295,
      currency: 'AUD',
      expiresAt: 1_750_000_030_000,
    })
    const executeResponse = await handleRoutingKernelHttpRequest(jsonRequest('/v1/execute', {
      protocolVersion: 'ae-routing:v1',
      quoteId: routed.result.quote.quoteId,
      quoteDigest: routed.result.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef,
      idempotencyKey: 'http:parcel-label:1',
    }), dependencies)
    const executed = await executeResponse.json() as {
      result: { kind: string; run: { rootRunId: string; state: string; executionMode: string } }
    }
    expect(executed.result).toMatchObject({
      kind: 'run_admitted',
      run: { state: 'completed', executionMode: 'simulation' },
    })

    const inspectResponse = await handleRoutingKernelHttpRequest(jsonRequest('/v1/inspect', {
      protocolVersion: 'ae-routing:v1',
      rootRunId: executed.result.run.rootRunId,
    }), dependencies)
    const inspected = await inspectResponse.json() as { result: unknown }

    expect(inspected.result).toEqual({ kind: 'run_found', run: executed.result.run })
  })

  it('binds inline execute approval through the trusted authorization dependency', async () => {
    const kernel = createKernel()
    const caller = { agentId: 'agent:http-approval', principalId: 'principal:merchant-1' }
    const routed = await kernel.operations.route({ caller, networkId: 'network:au-first', query: 'Prepare one reference option.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    expect(routed.kind).toBe('quoted')
    if (routed.kind !== 'quoted') return
    const response = await handleRoutingKernelHttpRequest(jsonRequest('/v1/execute', {
      protocolVersion: 'ae-routing:v1', quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      approval: { maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000, allowedDataFields: [] },
      idempotencyKey: 'http:inline-approval:1',
    }), {
      operations: kernel.operations,
      authenticate: async () => ({ kind: 'authenticated', caller, grant: { grantId: 'grant:http-test', networkIds: ['network:au-first'], maximumSpendMinor: 1_500, currency: 'AUD', allowedDataFields: [], protectedFieldSetId: 'field-set:test:v1', maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0, allowedRecipientBindingIds: ['binding:easypost:v1'], allowedDisclosurePurposes: ['capability:parcel-label-purchase:v1'], expiresAt: Number.MAX_SAFE_INTEGER } }),
      authorize: async (input) => {
        const authorization = await kernel.authority.authorize({ ...input, principalId: input.caller.principalId, agentId: input.caller.agentId })
        return { kind: 'authorized', authorizationRef: authorization.authorizationRef }
      },
    })
    expect(await response.json()).toMatchObject({ result: { kind: 'run_admitted', run: { state: 'completed' } } })
  })

  it('returns quote-bound authorization before execution for composable agent workflows', async () => {
    const kernel = createKernel()
    const caller = { agentId: 'agent:http-authorize', principalId: 'principal:merchant-1' }
    const routed = await kernel.operations.route({
      caller, networkId: 'network:au-first', query: 'Prepare one reference option.',
      constraints: { currency: 'AUD', maximumSpendMinor: 1_500 },
    })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const response = await handleRoutingKernelHttpRequest(jsonRequest('/v1/authorize', {
      protocolVersion: 'ae-routing:v1', quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000,
      allowedDataFields: [], idempotencyKey: 'http:authorize:1',
    }), {
      operations: kernel.operations,
      authenticate: async () => ({
        kind: 'authenticated', caller, grant: {
          grantId: 'grant:http-authorize', networkIds: ['network:au-first'], maximumSpendMinor: 1_500,
          currency: 'AUD', allowedDataFields: [], protectedFieldSetId: 'field-set:test:v1',
          maximumDisclosureAttempts: 0, maximumDisclosureExposures: 0,
          allowedRecipientBindingIds: ['binding:easypost:v1'],
          allowedDisclosurePurposes: ['capability:parcel-label-purchase:v1'], expiresAt: Number.MAX_SAFE_INTEGER,
        },
      }),
      authorize: async (input) => {
        const authorization = await kernel.authority.authorize({
          ...input, principalId: input.caller.principalId, agentId: input.caller.agentId,
        })
        return { kind: 'authorized', authorizationRef: authorization.authorizationRef }
      },
    })
    expect(await response.json()).toMatchObject({
      protocolVersion: 'ae-routing:v1', operation: 'authorize',
      result: { kind: 'authorized', authorizationRef: expect.any(String) },
    })
  })

  it('projects quote-undeclared data refusal through HTTP without dispatching', async () => {
    const kernel = createKernel()
    const caller = { agentId: 'agent:http-disclosure', principalId: 'principal:merchant-1' }
    const routed = await kernel.operations.route({ caller, networkId: 'network:au-first', query: 'Prepare one reference option.', constraints: { currency: 'AUD', maximumSpendMinor: 1_500 } })
    if (routed.kind !== 'quoted') throw new Error(routed.kind)
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest, principalId: caller.principalId, agentId: caller.agentId,
      maximumSpendMinor: 1_295, currency: 'AUD', expiresAt: 1_750_000_030_000, allowedDataFields: ['private_note'],
    })

    const response = await handleRoutingKernelHttpRequest(jsonRequest('/v1/execute', {
      protocolVersion: 'ae-routing:v1', quoteId: routed.quote.quoteId, quoteDigest: routed.quote.quoteDigest,
      authorizationRef: authorization.authorizationRef, idempotencyKey: 'http:undeclared-data', data: { private_note: 'not quoted' },
    }), {
      operations: kernel.operations,
      authenticate: async () => ({ kind: 'authenticated', caller }),
    })

    expect(await response.json()).toMatchObject({
      protocolVersion: 'ae-routing:v1', operation: 'execute',
      result: { kind: 'execution_refused', reason: 'data_not_declared_by_quote' },
    })
  })

  it('forwards paired canary purpose and recovery authority without treating either as ambient execution state', async () => {
    const kernel = createKernel()
    let received: Parameters<typeof kernel.operations.execute>[0] | undefined
    const response = await handleRoutingKernelHttpRequest(jsonRequest('/v1/execute', {
      protocolVersion: 'ae-routing:v1', quoteId: 'quote:canary', quoteDigest: 'sha256:canary',
      authorizationRef: 'authorization:canary', idempotencyKey: 'http:canary:1',
      executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:canary:1',
    }), {
      operations: { ...kernel.operations, execute: async (input) => {
        received = input
        return { kind: 'execution_refused', reason: 'test_boundary' }
      } },
      authenticate: async () => ({
        kind: 'authenticated', caller: { agentId: 'agent:http-canary', principalId: 'principal:incident-responder' },
      }),
    })
    expect(response.status).toBe(200)
    expect(received).toMatchObject({
      executionPurpose: 'incident_canary', canaryRecoveryGrantId: 'recovery:canary:1',
    })
  })

  it('projects provider reconciliation without accepting caller-supplied provider evidence', async () => {
    const kernel = createKernel()
    let received: Parameters<typeof kernel.operations.reconcileProviderOutcome>[0] | undefined
    const caller = { agentId: 'agent:http-reconcile', principalId: 'principal:http-reconcile' }
    const response = await handleRoutingKernelHttpRequest(jsonRequest('/v1/reconcile', {
      protocolVersion: 'ae-routing:v1', rootRunId: 'root-run:unknown-1', recoveryGrantId: 'recovery:1',
    }), {
      operations: { ...kernel.operations, reconcileProviderOutcome: async (input) => {
        received = input
        return { kind: 'provider_reconciliation_pending', rootRunId: input.rootRunId }
      } },
      authenticate: async () => ({ kind: 'authenticated', caller }),
    })
    expect(received).toEqual({ caller, rootRunId: 'root-run:unknown-1', recoveryGrantId: 'recovery:1' })
    expect(await response.json()).toEqual({
      protocolVersion: 'ae-routing:v1', operation: 'reconcile',
      result: { kind: 'provider_reconciliation_pending', rootRunId: 'root-run:unknown-1' },
    })

    const rejected = await handleRoutingKernelHttpRequest(jsonRequest('/v1/reconcile', {
      protocolVersion: 'ae-routing:v1', rootRunId: 'root-run:unknown-1',
      evidence: { source: 'caller', outcome: { kind: 'effect_committed' } },
    }), {
      operations: kernel.operations,
      authenticate: async () => ({ kind: 'authenticated', caller }),
    })
    expect(rejected.status).toBe(400)
  })
})

function jsonRequest(pathname: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://ae.example${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function createKernel() {
  let value = 0
  const ids: KernelIdFactory = {
    next: (prefix) => {
      value += 1
      return `${prefix}:${value}`
    },
  }
  return createNeutralRoutingKernel({
    now: () => 1_750_000_000_000,
    executionMode: 'simulation',
    ids,
    quoteTtlMs: 60_000,
    bindings: createReferenceCapabilityBindings(),
    store: createInMemoryKernelStore(),
  })
}
