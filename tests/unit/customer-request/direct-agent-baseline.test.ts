import { describe, expect, it, vi } from 'vitest'

import { runFrozenDirectAgentBaseline } from '@/modules/customer-request/direct-agent-baseline'

describe('frozen direct-agent baseline', () => {
  it('discovers and composes public provider origins without private AE route knowledge', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = input.toString()
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method, ...(body === undefined ? {} : { body }) })
      if (method === 'GET') {
        if (url.endsWith('/route-resolver')) return Response.json(discovery(
          url, 'Sandbox Route Resolver', 300, ['request'], ['serviceReference'],
        ))
        if (url.endsWith('/route-quoter')) return Response.json(discovery(
          url, 'Sandbox Route Quoter', 700, ['serviceReference'], ['quoteReference'],
        ))
      }
      if (url.endsWith('/route-resolver')) {
        return Response.json({ serviceReference: 'sandbox-service:one' }, {
          headers: { 'Provider-Receipt': 'sandbox-resolver:one' },
        })
      }
      if (url.endsWith('/route-quoter')) {
        expect(body).toEqual({ serviceReference: 'sandbox-service:one' })
        return Response.json({ quoteReference: 'sandbox-quote:one' }, {
          headers: { 'Provider-Receipt': 'sandbox-quoter:one' },
        })
      }
      return Response.json({ reason: 'not_found' }, { status: 404 })
    })

    const proof = await runFrozenDirectAgentBaseline({
      job: 'Resolve a labelled sandbox service and prepare its quote',
      providerOrigins: [
        'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-resolver',
        'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-quoter',
      ],
      credential: 'secret',
      agent: { name: 'frozen-direct-integrator', version: '1' },
      predeclaredGain: 'recoverable_progress',
      hardConstraints: { maximumTotalCost: { currency: 'AUD', amountMinor: 1_000 } },
      fetch,
      now: sequence(1_000, 1_125),
    })

    expect(proof).toMatchObject({
      kind: 'frozen_direct_agent_baseline',
      agent: { name: 'frozen-direct-integrator', version: '1' },
      predeclaredGain: 'recoverable_progress',
      completion: { state: 'completed', providerCount: 2 },
      integrationBurden: { originsProvided: 2, discoveryCalls: 2, invocationCalls: 2, schemaMappings: 1 },
      turns: { total: 4 },
      elapsedMs: 125,
      hardConstraintAccuracy: { state: 'satisfied' },
      totalCostAccuracy: { state: 'exact', total: { currency: 'AUD', amountMinor: 1_000 } },
      recovery: { state: 'unsupported', reason: 'direct_calls_have_no_durable_request_to_resume' },
      resultUsability: { state: 'usable', result: { quoteReference: 'sandbox-quote:one' } },
      claimBoundary: 'labelled_sandbox_direct_baseline_not_real_supply_or_customer_value',
    })
    expect(calls.map(({ method }) => method)).toEqual(['GET', 'GET', 'POST', 'POST'])
  })

  it('reports missing provider discovery as a baseline failure rather than an AE advantage', async () => {
    const proof = await runFrozenDirectAgentBaseline({
      job: 'Resolve a labelled sandbox service and prepare its quote',
      providerOrigins: ['https://agentic-economy-phi.vercel.app/api/sandbox/providers/missing'],
      credential: 'secret', agent: { name: 'frozen-direct-integrator', version: '1' },
      predeclaredGain: 'recoverable_progress', hardConstraints: {},
      fetch: async () => Response.json({ reason: 'not_found' }, { status: 404 }),
      now: sequence(1_000, 1_010),
    })

    expect(proof.completion).toEqual({
      state: 'blocked', reason: 'provider_discovery_unavailable', providerCount: 0,
    })
    expect(proof.comparisonEligibility).toEqual({
      state: 'ineligible', reason: 'provider_discovery_missing_cannot_count_as_ae_gain',
    })
  })

  it('allows HTTP only for loopback development provider origins', async () => {
    const seen: string[] = []
    const proof = await runFrozenDirectAgentBaseline({
      job: 'Resolve a labelled sandbox service and prepare its quote',
      providerOrigins: [
        'http://127.0.0.1:3000/api/sandbox/providers/route-resolver',
        'http://localhost:3000/api/sandbox/providers/route-quoter',
      ],
      credential: 'secret', agent: { name: 'frozen-direct-integrator', version: '1' },
      predeclaredGain: 'recoverable_progress', hardConstraints: {},
      fetch: async (input, init) => {
        const url = input.toString()
        seen.push(url)
        if ((init?.method ?? 'GET') === 'GET') return Response.json(url.includes('route-resolver')
          ? discovery(url, 'Sandbox Route Resolver', 300, ['request'], ['serviceReference'])
          : discovery(url, 'Sandbox Route Quoter', 700, ['serviceReference'], ['quoteReference']))
        return Response.json(url.includes('route-resolver')
          ? { serviceReference: 'sandbox-service:dev' }
          : { quoteReference: 'sandbox-quote:dev' })
      },
    })
    expect(proof.completion.state).toBe('completed')
    expect(seen).toHaveLength(4)

    const blocked = await runFrozenDirectAgentBaseline({
      job: 'Same job', providerOrigins: ['http://provider.example/api'], credential: 'secret',
      agent: { name: 'frozen-direct-integrator', version: '1' }, predeclaredGain: 'recoverable_progress',
      hardConstraints: {}, fetch: async () => { throw new Error('unsafe origin must not be fetched') },
    })
    expect(blocked.comparisonEligibility.state).toBe('ineligible')
  })

  it('preserves a usable partial result when a later direct provider call fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = input.toString()
      if ((init?.method ?? 'GET') === 'GET') {
        return Response.json(url.endsWith('/route-resolver')
          ? discovery(url, 'Sandbox Route Resolver', 300, ['request'], ['serviceReference'])
          : discovery(url, 'Sandbox Route Quoter', 700, ['serviceReference'], ['quoteReference']))
      }
      if (url.endsWith('/route-resolver')) {
        return Response.json({ serviceReference: 'sandbox-service:partial' }, {
          headers: { 'Provider-Receipt': 'sandbox-resolver:partial' },
        })
      }
      return Response.json({ kind: 'refused', reason: 'provider_unavailable' }, { status: 503 })
    })

    const proof = await runFrozenDirectAgentBaseline({
      job: 'Resolve a labelled sandbox service and prepare its quote',
      providerOrigins: [
        'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-resolver',
        'https://agentic-economy-phi.vercel.app/api/sandbox/providers/route-quoter',
      ],
      credential: 'secret', agent: { name: 'frozen-direct-integrator', version: '1' },
      predeclaredGain: 'recoverable_progress', hardConstraints: {}, fetch,
      now: sequence(1_000, 1_020),
    })

    expect(proof).toMatchObject({
      completion: { state: 'blocked', reason: 'provider_invocation_failed' },
      integrationBurden: { invocationCalls: 2 },
      recovery: { state: 'unsupported' },
      resultUsability: {
        state: 'partial', result: { serviceReference: 'sandbox-service:partial' },
      },
      invocations: [{
        business: 'Sandbox Route Resolver', receipt: 'sandbox-resolver:partial',
        output: { serviceReference: 'sandbox-service:partial' },
      }],
    })
  })
})

function discovery(
  endpoint: string,
  name: string,
  amountMinor: number,
  inputRequired: readonly string[],
  outputRequired: readonly string[],
) {
  return {
    format: 'ae.sandbox-capability-provider:v1', supplyClass: 'labelled_sandbox', sandbox: true,
    business: { slug: name.toLowerCase().replaceAll(' ', '-'), name },
    operation: {
      method: 'POST', endpoint, authentication: { scheme: 'bearer' },
      maximumCost: { currency: 'AUD', amountMinor },
      inputSchema: { type: 'object', required: inputRequired },
      outputSchema: { type: 'object', required: outputRequired },
    },
    boundaries: ['Deterministic sandbox evidence only.'],
  }
}

function sequence(...values: readonly number[]): () => number {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}
