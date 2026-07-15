import { describe, expect, it, vi } from 'vitest'

import {
  runHostedCustomerRequestJourney,
  verifyHostedCustomerRequestFrontDoor,
} from '@/modules/customer-request/hosted-agent-journey'

describe('hosted Customer Request journey', () => {
  it('refuses any non-production origin before credentials can leave the process', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://attacker.example', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: { request: 'Sandbox request', facts: {}, messages: [] }, sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
    })).rejects.toThrow('hosted_journey_base_url_not_production')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a non-production front door before a deployment bypass can leave the process', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(verifyHostedCustomerRequestFrontDoor({
      baseUrl: 'https://attacker.example', deploymentProtectionBypass: 'secret', fetch,
    })).rejects.toThrow('hosted_journey_base_url_not_production')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cannot claim the hosted acceptance journey without submitting a requested typed fact', async () => {
    const responses = [
      routesReadyView(),
      routesReadyView(),
    ]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()))

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: { request: 'Sandbox request', facts: { '*': 'Configured but unused' }, messages: ['Unused'] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_typed_fact_not_submitted')
  })

  it('confirms, starts, inspects, reports, cancels, and resumes through one external-agent identity', async () => {
    const calls: Array<{ url: string; authorization: string | null; body: unknown }> = []
    const responses = [
      requestView('needs_information', 1, {
        clarification: {
          kind: 'contract_fact', requirementKey: 'sandbox.request_context',
          prompt: 'Request details', answerKind: 'typed_value',
        },
      }),
      requestView('needs_information', 1, {
        clarification: {
          kind: 'contract_fact', requirementKey: 'sandbox.request_context',
          prompt: 'Request details', answerKind: 'typed_value',
        },
      }),
      requestView('ready_to_compare', 2),
      routesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 1, current: { step: 1, state: 'queued' } },
        activity: {
          actor: 'ae_for_customer', certainty: 'pending', updatedAt: 9_000, nextCheckAt: 10_000,
          retry: 'not_needed', cancellation: 'available_before_next_step', safeNextAction: 'check_progress',
        },
      }),
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'queued', generatedAt: 9_000,
        steps: [{ step: 1, state: 'queued', observedAt: 9_000, evidence: [] }],
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:one', state: 'received', reportedAt: 9_001 },
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed', cancellation: 'complete', safeNextAction: 'revise_request',
        },
      }),
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed', cancellation: 'complete', safeNextAction: 'revise_request',
        },
      }),
    ]
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      calls.push({
        url: input.toString(), authorization: new Headers(init?.headers).get('authorization'),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })

    const proof = await runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: {
        request: 'Find the cheapest labelled sandbox option',
        facts: { 'sandbox.request_context': 'Find the cheapest labelled sandbox option' },
        messages: [],
      },
      sandbox: true, fetch, now: () => 10_000,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })

    expect(proof).toMatchObject({
      kind: 'cold_external_agent_journey', sandbox: true,
      authorityStops: ['route_confirmation'],
      final: {
        state: 'cancelled', selectedBusiness: 'Sandbox Option Two',
        runState: 'in_progress', evidenceState: 'queued',
        problemState: 'received', resumedState: 'cancelled',
      },
    })
    expect(proof.input.facts).toEqual([expect.objectContaining({
      requirementKey: 'sandbox.request_context', valueDigest: expect.stringMatching(/^sha256:/),
    })])
    expect(calls[2]?.body).toMatchObject({
      requirementKey: 'sandbox.request_context', value: 'Find the cheapest labelled sandbox option',
    })
    expect(calls.filter((call) => call.authorization === 'Bearer ak_agent')).toHaveLength(10)
    expect(calls[3]?.url).toContain('/options')
    expect(calls[4]?.url).toContain('/confirmation')
    expect(calls[5]?.url).toContain('/run')
    expect(calls[6]?.url).toContain('/evidence')
    expect(calls[7]?.url).toContain('/problems')
    expect(calls[8]?.url).toContain('/cancellation')
    expect(calls.some((call) => call.url.includes('/approval'))).toBe(false)
  })
})

function requestView(state: string, revision: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'request', requestRef: 'request:cold', revision, state,
    summary: 'Find the cheapest labelled sandbox option',
    nextAction: state === 'needs_information' ? 'provide_information'
      : state === 'ready_to_compare' ? 'prepare_options' : 'inspect_routes',
    missingFields: state === 'needs_information'
      ? [{ field: 'sandbox.request_context', label: 'Request details', explanation: 'Required.' }] : [],
    criteria: [], options: [], ...extra,
  }
}

function routesReadyView() {
  return requestView('routes_ready', 2, {
    routeGenerationRef: 'generation:one',
    decision: {
      generationRef: 'generation:one', requestRevision: 2,
      outcome: { kind: 'routes_available', routeCount: 1, summary: 'One option is ready.' },
      routes: [routePlan()],
      comparison: {
        kind: 'single',
        summary: 'One current way forward is available. This is not a comparison or recommendation.',
      },
      actions: {
        confirm: { kind: 'confirm_current_option', createsAuthority: true },
        change: { kind: 'revise_request', createsAuthority: false, preservesRequest: true },
        decline: { kind: 'leave_unconfirmed', createsAuthority: false, preservesRequest: true },
      },
      changes: { kind: 'initial' },
      nextBoundary: { kind: 'confirmation', authorityCreated: false },
    },
  })
}

function routePlan() {
  return {
    routeRef: 'route:one', quoteDigest: 'sha256:quote',
    result: { resultRef: 'result:one', summary: 'Return a sandbox reference.', deliverables: ['Sandbox reference'] },
    availability: 'current', stepCount: 1,
    businesses: [{ businessRef: 'business:two', name: 'Sandbox Option Two' }],
    maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 900 },
    dataUse: { recipientCount: 1, recipients: [], purposes: ['return_sandbox_result'] },
    effects: [{ kind: 'information_shared', reversibility: 'irreversible' }],
    evidence: [{ label: 'Option', purpose: 'completion' }],
    recovery: [{ step: 1, businessName: 'Sandbox Option Two', posture: 'retry_safe' }],
    cancellation: { kind: 'unavailable', summary: 'Cannot stop after release.' },
    validUntil: 20_000, fallback: { available: false, alternatives: [] }, uncertainty: [],
    comparison: {
      outcomeRef: 'outcome:sandbox', outcomeFit: 'same_promised_result',
      completeness: 'complete', hardConstraints: 'satisfied',
      maximumCost: { kind: 'known', currency: 'AUD', amountMinor: 900 },
      dataExposureCount: 1, irreversibleEffectCount: 1, uncertaintyCount: 0,
      duration: 'not_declared', recovery: 'retry_safe',
      trust: 'registered_live_supply', evidenceCount: 1,
      freshness: { state: 'current', validUntil: 20_000 },
      commercialInfluence: { status: 'none', evidenceRefs: ['commercial:none'] },
    },
  }
}

function confirmation() {
  return {
    confirmationRef: 'confirmation:one', generationRef: 'generation:one', requestRevision: 2,
    confirmedAt: 8_000, validUntil: 20_000, route: routePlan(),
  }
}
