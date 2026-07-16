import { describe, expect, it, vi } from 'vitest'

import {
  runHostedCustomerRequestJourney,
  verifyHostedCustomerRequestFrontDoor,
} from '@/modules/customer-request/hosted-agent-journey'
import { projectCustomerRequestAgentNavigation } from '@/modules/customer-request/agent-navigation'
import type { CustomerRequestView } from '@/modules/customer-request/agent-contract'

describe('hosted Customer Request journey', () => {
  it('runs the exact cold-agent contract against an explicit loopback development surface', async () => {
    const responses = completeJourneyResponses()
    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'development-v1' },
      scenario: {
        request: 'Complete sandbox request', facts: {}, messages: [], finish: 'complete',
      },
      sandbox: true,
      fetch: vi.fn(async () => {
        const next = responses.shift()
        return next === undefined ? Response.json({ error: 'unexpected' }, { status: 500 }) : Response.json(next)
      }),
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.release).toEqual({
      revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      environment: 'development', baseUrl: 'http://127.0.0.1:4319',
      verification: 'local_checkout_and_named_dev_deployment',
    })
  })

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

  it('does not demand a redundant fact when the initial Request is already sufficient', async () => {
    const responses = [
      routesReadyView(),
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
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_000 },
          safeNextAction: 'revise_request',
        },
      }),
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_000 },
          safeNextAction: 'revise_request',
        },
      }),
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'cancelled', generatedAt: 9_002,
        steps: [{ step: 1, state: 'cancelled', observedAt: 9_002, evidence: [] }],
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:one', state: 'received', reportedAt: 9_003 },
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_000 },
          safeNextAction: 'revise_request',
        },
      }),
    ]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })

    const proof = await runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: { request: 'Complete sandbox request', facts: {}, messages: [] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })
    expect(proof.input).toMatchObject({ request: 'Complete sandbox request', facts: [], messages: [] })
    expect(proof.final.evidenceState).toBe('cancelled')
  })

  it('requires the declared composite route and resumes it to completed evidence', async () => {
    const responses = [
      compositeRoutesReadyView(),
      compositeRoutesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 1, total: 2, current: { step: 2, state: 'queued' } },
      }),
      requestView('completed', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'none',
        businesses: compositeBusinesses(),
        action: {
          state: 'completed', resolution: 'provider_result', automaticRetry: false,
          result: { quoteReference: 'sandbox-quote:complete' }, observedAt: 9_100,
        },
      }),
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'completed', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'completed', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:two', label: 'Quote reference' }] },
        ],
        result: { quoteReference: 'sandbox-quote:complete' },
      },
    ]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })
    const proof = await runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '2.0.0' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote', facts: {}, messages: [],
        finish: 'complete',
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
          recipients: [
            { name: 'Sandbox Route Resolver', purposes: ['resolve_sandbox_service_reference'] },
            { name: 'Sandbox Route Quoter', purposes: ['prepare_sandbox_service_quote'] },
          ],
        },
      },
      sandbox: true, fetch, now: () => 10_000,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })
    expect(proof.final).toMatchObject({
      state: 'completed', selectedBusinesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
      stepCount: 2, runState: 'completed', evidenceState: 'completed',
      problemState: 'not_reported', resumedState: 'completed', resultDigest: expect.stringMatching(/^sha256:/),
    })
    expect(proof.measurements).toEqual({
      integrationBurden: { requestCalls: 7, clarifications: 0 },
      turns: { total: 7 }, elapsedMs: 0,
      hardConstraintAccuracy: { state: 'satisfied' },
      totalCostAccuracy: { state: 'exact', total: { currency: 'AUD', amountMinor: 900 } },
      recovery: { state: 'durable', resumed: true, postures: ['retry_safe'] },
      interruptionRecovery: {
        state: 'verified',
        requestRef: 'request:cold',
        revision: 2,
        completedSteps: 2,
      },
      resultUsability: { state: 'usable' },
      replaySafety: { executionStart: 'same_request_monotonic_progress' },
      disclosureIntegrity: {
        state: 'verified',
        recipients: ['Sandbox Route Quoter', 'Sandbox Route Resolver'],
        purposes: ['prepare_sandbox_service_quote', 'resolve_sandbox_service_reference'],
      },
      resultIntegrity: { state: 'verified', digest: expect.stringMatching(/^sha256:/) },
      controlIntegrity: {
        state: 'verified',
        operatorInterventions: 0,
        mutations: [
          { path: '/api/v1/requests', source: 'declared_request' },
          { path: '/api/v1/requests', source: 'automatic_replay' },
          { path: '/api/v1/requests/request%3Acold/confirmation', source: 'observed_navigation' },
          { path: '/api/v1/requests/request%3Acold/run', source: 'observed_navigation' },
          { path: '/api/v1/requests/request%3Acold/run', source: 'automatic_replay' },
        ],
      },
    })
  })

  it('keeps an unsupported operation unconfirmed and recovers the same Request through ordinary language', async () => {
    const unsupported = requestView('unsupported', 1, {
      summary: 'AE cannot perform the requested operation.',
      nextAction: 'revise_request',
      dataHandling: {
        requestStorage: 'saved_for_revision',
        businessSharing: 'not_shared',
        explanation: 'AE saved this Request so you can revise it. No information was sent to a business.',
      },
    })
    const responses = [
      unsupported,
      unsupported,
      requestView('needs_attention', 1, {
        summary: 'The request changed before it could be recorded. Try again.',
        nextAction: 'retry',
      }),
      ...completeJourneyResponses().slice(1),
    ]
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      calls.push({
        url: String(url),
        ...(init?.body === undefined
          ? {}
          : { body: JSON.parse(String(init.body)) as Record<string, unknown> }),
      })
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })

    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'unsupported-recovery-v1' },
      scenario: {
        request: 'Book and pay for a labelled sandbox service.',
        facts: {}, messages: [], finish: 'complete',
        unsupportedRecovery: {
          message: 'Instead, resolve a labelled sandbox service and prepare its quote.',
        },
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        },
      },
      sandbox: true, fetch,
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    const messageCalls = calls.filter(({ url }) => url.endsWith('/messages'))
    expect(messageCalls).toHaveLength(2)
    expect(messageCalls[1]?.body).toEqual(messageCalls[0]?.body)
    expect(calls.filter(({ url }) => url.endsWith('/confirmation'))).toHaveLength(1)
    expect(calls.filter(({ url }) => url.endsWith('/run'))).toHaveLength(2)
    expect(proof.measurements.unsupportedRecovery).toEqual({
      state: 'verified',
      unsupportedRevision: 1,
      recoveredRevision: 2,
      authorityCreatedBeforeRecovery: false,
      executionStartedBeforeRecovery: false,
    })
  })

  it('rejects an expired choice, discovers recovery, and starts only the refreshed generation', async () => {
    const first = compositeRoutesReadyView()
    const expired = requestView('needs_attention', 2, {
      routeGenerationRef: 'generation:one',
      nextAction: 'retry',
      decision: {
        ...first.decision,
        outcome: { kind: 'routes_expired', routeCount: 1, summary: 'These options have expired.' },
        routes: [{ ...first.decision.routes[0], availability: 'expired' }],
      },
    })
    const refreshed = compositeRoutesReadyView('generation:two', 'route:two')
    const refreshedConfirmation = {
      ...confirmation(),
      confirmationRef: 'confirmation:two',
      generationRef: 'generation:two',
      route: refreshed.decision.routes[0],
    }
    const responses = [
      first,
      first,
      expired,
      {
        ...expired,
        recovery: {
          state: 'restored',
          reason: 'choice_expired',
          restoredAt: 4_000,
          workRestarted: false,
        },
      },
      requestView('needs_attention', 2, {
        routeGenerationRef: 'generation:one',
        nextAction: 'retry',
      }),
      refreshed,
      requestView('route_confirmed', 2, {
        routeGenerationRef: 'generation:two',
        confirmation: refreshedConfirmation,
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:two', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:two', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('completed', 2, {
        routeGenerationRef: 'generation:two', nextAction: 'none',
        businesses: compositeBusinesses(),
        action: {
          state: 'completed', resolution: 'provider_result', automaticRetry: false,
          result: { quoteReference: 'sandbox-quote:complete' }, observedAt: 9_100,
        },
      }),
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'completed', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'completed', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:two', label: 'Quote reference' }] },
        ],
        result: { quoteReference: 'sandbox-quote:complete' },
      },
    ]
    const calls: Array<{ url: string; body?: Record<string, unknown> }> = []
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      calls.push({
        url: String(url),
        ...(init?.body === undefined
          ? {}
          : { body: JSON.parse(String(init.body)) as Record<string, unknown> }),
      })
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })
    const sleep = vi.fn(async () => undefined)

    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'expiry-recovery-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote',
        facts: {}, messages: [], finish: 'complete',
        expiryRecovery: { waitMs: 310_000 },
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        },
      },
      sandbox: true, fetch, sleep,
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })

    expect(sleep.mock.calls).toEqual([[310_000], [1_000]])
    expect(calls.filter(({ url }) => url.endsWith('/confirmation'))).toHaveLength(2)
    expect(calls.filter(({ url }) => url.endsWith('/run'))).toHaveLength(2)
    expect(calls.find(({ url }) => url.endsWith('/options'))).toBeDefined()
    expect(proof.measurements.staleOptionRecovery).toEqual({
      state: 'verified',
      expiredGenerationRef: 'generation:one',
      expiredRouteRef: 'route:one',
      refreshedGenerationRef: 'generation:two',
      refreshedRouteRef: 'route:two',
      staleConfirmationCreated: false,
      staleExecutionStarted: false,
      restoredReason: 'choice_expired',
      workRestarted: false,
    })
  })

  it('refuses completed proof when the action and evidence results diverge', async () => {
    const responses = completeJourneyResponses()
    const evidence = responses.at(-1)
    if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) {
      throw new Error('evidence fixture missing')
    }
    responses[responses.length - 1] = {
      ...evidence,
      result: { quoteReference: 'sandbox-quote:fabricated-different-result' },
    }
    await expect(runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'result-integrity-v1' },
      scenario: {
        request: 'Resolve and quote', facts: {}, messages: [], finish: 'complete',
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
          recipients: [
            { name: 'Sandbox Route Resolver', purposes: ['resolve_sandbox_service_reference'] },
            { name: 'Sandbox Route Quoter', purposes: ['prepare_sandbox_service_quote'] },
          ],
        },
      },
      sandbox: true,
      fetch: vi.fn(async () => Response.json(responses.shift() ?? { error: 'unexpected' })),
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })).rejects.toThrow('hosted_journey_result_mismatch')
  })

  it('refuses confirmation when the recipient count does not match the disclosed ledger', async () => {
    const invalid = compositeRoutesReadyView()
    const route = invalid.decision.routes[0]
    if (route === undefined) throw new Error('route fixture missing')
    const invalidDisclosure = {
      ...invalid,
      decision: {
        ...invalid.decision,
        routes: [{ ...route, dataUse: { ...route.dataUse, recipientCount: 3 } }],
      },
    }
    const responses = [invalidDisclosure, invalidDisclosure]
    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: 'disclosure-v1' },
      scenario: {
        request: 'Resolve and quote', facts: {}, messages: [], finish: 'complete',
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
          recipients: [
            { name: 'Sandbox Route Resolver', purposes: ['resolve_sandbox_service_reference'] },
            { name: 'Sandbox Route Quoter', purposes: ['prepare_sandbox_service_quote'] },
          ],
        },
      },
      sandbox: true,
      fetch: vi.fn(async () => Response.json(responses.shift() ?? { error: 'unexpected' })),
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_disclosure_recipient_count')
  })

  it('preserves partial progress and refuses replay when the final provider outcome is unknown', async () => {
    const unknown = requestView('outcome_unknown', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'needs_attention' },
        dependencies: {
          completed: [{ step: 1, business: 'Sandbox Route Resolver' }],
          blocked: [],
        },
      },
      action: { state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false, observedAt: 9_100 },
    })
    const responses = [
      compositeRoutesReadyView(), compositeRoutesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      unknown,
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'outcome_unknown', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'outcome_unknown', observedAt: 9_100, evidence: [] },
        ],
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:unknown', state: 'received', reportedAt: 9_101 },
      unknown,
    ]
    const proof = await runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: {
        request: 'Resolve a labelled sandbox service and leave the quote outcome unknown',
        facts: {}, messages: [], finish: 'outcome_unknown',
        expectedRoute: { stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'] },
      },
      sandbox: true,
      fetch: vi.fn(async () => Response.json(responses.shift() ?? { error: 'unexpected' })),
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.final).toMatchObject({
      state: 'outcome_unknown', runState: 'outcome_unknown', evidenceState: 'outcome_unknown',
      problemState: 'received', resumedState: 'outcome_unknown', completedSteps: 1,
      automaticRetry: false,
      dependencies: {
        completedBusinesses: ['Sandbox Route Resolver'],
        blockedBusinesses: [],
      },
    })
  })

  it('fails closed on schema-invalid provider output and reports an incorrect result', async () => {
    const invalid = requestView('outcome_unknown', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: { state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false, observedAt: 9_100 },
    })
    const responses = [
      compositeRoutesReadyView(), compositeRoutesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      invalid,
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'outcome_unknown', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'outcome_unknown', observedAt: 9_100, evidence: [] },
        ],
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:invalid', state: 'received', reportedAt: 9_101 },
      invalid,
    ]
    let problemBody: unknown
    const fetch = vi.fn<typeof globalThis.fetch>(async (request, init) => {
      if (String(request).endsWith('/problems')) {
        problemBody = JSON.parse(String(init?.body))
      }
      return Response.json(responses.shift() ?? { error: 'unexpected' })
    })
    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'invalid-output-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service, then prepare its quote, but leave the quote evidence malformed.',
        facts: {}, messages: [], finish: 'invalid_output',
        expectedRoute: { stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'] },
      },
      sandbox: true,
      fetch,
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.final).toMatchObject({
      state: 'outcome_unknown',
      runState: 'outcome_unknown',
      evidenceState: 'outcome_unknown',
      problemState: 'received',
      resumedState: 'outcome_unknown',
      completedSteps: 1,
      automaticRetry: false,
      failureClass: 'invalid_output',
    })
    expect(proof.final).not.toHaveProperty('resultDigest')
    expect(problemBody).toMatchObject({
      category: 'incorrect_result',
      affectedStep: 2,
    })
  })

  it('preserves a provider-declared partial result as matching evidence without exposing continuation authority', async () => {
    const partialResult = {
      kind: 'partial_result',
      output: { quoteReference: 'sandbox-partial-quote:one' },
    }
    const partial = requestView('outcome_unknown', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: {
        state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false,
        result: partialResult, observedAt: 9_100,
      },
    })
    const responses = [
      compositeRoutesReadyView(), compositeRoutesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      partial,
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'outcome_unknown', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'outcome_unknown', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:partial', label: 'Partial quote' }] },
        ],
        result: partialResult,
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:partial', state: 'received', reportedAt: 9_101 },
      partial,
    ]
    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'partial-result-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote, even if only a partial result is available.',
        facts: {}, messages: [], finish: 'partial_result',
        expectedRoute: { stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'] },
      },
      sandbox: true,
      fetch: vi.fn(async () => Response.json(responses.shift() ?? { error: 'unexpected' })),
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.final).toMatchObject({
      state: 'outcome_unknown', runState: 'outcome_unknown', evidenceState: 'outcome_unknown',
      resumedState: 'outcome_unknown', completedSteps: 1, automaticRetry: false,
      resultDigest: expect.stringMatching(/^sha256:/),
    })
    expect(proof.measurements).toMatchObject({
      resultUsability: { state: 'unusable' },
      resultIntegrity: { state: 'verified', digest: proof.final.resultDigest },
    })
  })

  it('keeps a definite provider denial failed, evidenced, resumable, and non-retryable', async () => {
    const failed = requestView('failed', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'revise_request',
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: {
        state: 'failed', resolution: 'reconciled', automaticRetry: false,
        result: { reason: 'business_reported_failure' }, observedAt: 9_100,
      },
    })
    const responses = [
      compositeRoutesReadyView(), compositeRoutesReadyView(),
      requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      }),
      failed,
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'failed', generatedAt: 9_100,
        steps: [
          { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
          { step: 2, state: 'failed', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:denial', label: 'Provider refusal' }] },
        ],
        result: { reason: 'business_reported_failure' },
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:denial', state: 'received', reportedAt: 9_101 },
      failed,
    ]
    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'provider-denial-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote. Use the provider denial scenario.',
        facts: {}, messages: [], finish: 'provider_denied',
        expectedRoute: { stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'] },
      },
      sandbox: true,
      fetch: vi.fn(async () => Response.json(responses.shift() ?? { error: 'unexpected' })),
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.final).toMatchObject({
      state: 'failed', runState: 'failed', evidenceState: 'failed',
      problemState: 'received', resumedState: 'failed', completedSteps: 1,
      automaticRetry: false,
    })
    expect(proof.measurements).toMatchObject({
      resultUsability: { state: 'unusable' },
      resultIntegrity: { state: 'verified' },
    })
  })

  it('lets an external agent revise the same Request after a definite provider denial', () => {
    const navigation = projectCustomerRequestAgentNavigation(requestView('failed', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'revise_request',
      action: {
        state: 'failed', resolution: 'reconciled', automaticRetry: false,
        result: { reason: 'business_reported_failure' }, observedAt: 9_100,
      },
    }) as unknown as CustomerRequestView)

    expect(navigation.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation: 'change_request', method: 'POST',
        input: expect.objectContaining({ expectedRevision: 2, message: '<natural-language change>' }),
      }),
      expect.objectContaining({ relation: 'inspect_evidence', method: 'GET' }),
      expect.objectContaining({ relation: 'report_problem', method: 'POST' }),
    ]))
    expect(navigation.actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: 'start_confirmed_option' }),
    ]))
  })

  it('publishes the cancel command for the structured pre-release posture', () => {
    const navigation = projectCustomerRequestAgentNavigation(requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 0, total: 1, current: { step: 1, state: 'queued' } },
      activity: {
        actor: 'ae', certainty: 'pending', updatedAt: 9_000, nextCheckAt: 10_000,
        retry: 'not_needed',
        cancellation: {
          state: 'available', until: 'before_next_step_release', releaseMayStartAt: 10_000,
        },
        safeNextAction: 'check_progress',
      },
    }) as unknown as CustomerRequestView)

    expect(navigation.actions).toContainEqual(expect.objectContaining({
      relation: 'cancel',
      method: 'POST',
      href: '/api/v1/requests/request%3Acold/cancellation',
    }))
  })

  it('records a released stop request and proves that no downstream step begins', async () => {
    const queued = requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      businesses: compositeBusinesses(),
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
      activity: {
        actor: 'ae', certainty: 'pending', updatedAt: 9_000, nextCheckAt: 10_000,
        retry: 'not_needed',
        cancellation: {
          state: 'available', until: 'before_next_step_release', releaseMayStartAt: 9_500,
        },
        safeNextAction: 'check_progress',
      },
    })
    const released = requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      businesses: compositeBusinesses(),
      progress: { completed: 0, total: 2, current: { step: 1, state: 'awaiting_result' } },
      activity: {
        actor: 'business', certainty: 'pending', updatedAt: 9_500, nextCheckAt: 10_500,
        retry: 'not_needed',
        cancellation: { state: 'not_available', reason: 'business_step_released', changedAt: 9_500 },
        safeNextAction: 'check_progress',
      },
    })
    const stopRequested = requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      businesses: compositeBusinesses(),
      progress: { completed: 0, total: 2, current: { step: 1, state: 'awaiting_result' } },
      activity: {
        actor: 'business', certainty: 'pending', updatedAt: 9_600, nextCheckAt: 10_600,
        retry: 'not_needed',
        cancellation: {
          state: 'not_available', reason: 'business_step_released',
          changedAt: 9_500, requestedAt: 9_600,
        },
        safeNextAction: 'check_progress',
      },
    })
    const cancelled = requestView('cancelled', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'revise_request',
      businesses: compositeBusinesses(),
      summary: 'Stopped after 1 of 2 business steps completed. No later step began.',
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'cancelled' },
        dependencies: {
          completed: [{ step: 1, business: 'Sandbox Route Resolver' }],
          blocked: [],
        },
      },
      activity: {
        actor: 'none', certainty: 'cancelled', updatedAt: 10_000,
        retry: 'not_needed', cancellation: { state: 'stopped', stoppedAt: 10_000 },
        safeNextAction: 'revise_request',
      },
    })
    const responses = [
      compositeRoutesReadyView(),
      compositeRoutesReadyView(),
      requestView('route_confirmed', 2, {
        routeGenerationRef: 'generation:one', confirmation: confirmation(),
      }),
      queued,
      released,
      stopRequested,
      cancelled,
      cancelled,
      cancelled,
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'cancelled', generatedAt: 10_000,
        steps: [{
          step: 1, state: 'completed', observedAt: 9_900,
          evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }],
        }],
      },
    ]
    const calls: Array<{ url: string; body?: string }> = []
    const proof = await runHostedCustomerRequestJourney({
      environment: 'development',
      baseUrl: 'http://127.0.0.1:4319', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'convex:loyal-peacock-107',
      agent: { name: 'cold-external-agent', version: 'cancel-after-current-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service, pause the first step for cancellation, then prepare its quote.',
        facts: {}, messages: [], finish: 'cancel_after_current',
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        },
      },
      sandbox: true,
      fetch: vi.fn(async (url, init) => {
        calls.push({ url: String(url), ...(init?.body === undefined ? {} : { body: String(init.body) }) })
        const next = responses.shift()
        if (next === undefined) throw new Error('unexpected request')
        return Response.json(next)
      }),
      verifyRelease: async () => ({
        kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'convex:loyal-peacock-107',
      }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
      sleep: async () => undefined,
    })

    expect(proof.final).toMatchObject({
      state: 'cancelled', completedSteps: 1,
      dependencies: {
        completedBusinesses: ['Sandbox Route Resolver'],
        blockedBusinesses: [],
      },
    })
    expect(proof.measurements.downstreamCancellation).toEqual({
      state: 'verified', releasedStep: 1, completedSteps: 1, unreleasedStep: 2,
      downstreamStarted: false, cancellationReplaySafe: true,
    })
    expect(calls.filter(({ url }) => url.endsWith('/cancellation'))).toHaveLength(2)
  })

  it('discovers every post-submit transition from the observed agent navigation', async () => {
    const routes = withNavigation(compositeRoutesReadyView(), [
      navigationAction('confirm_option', 'POST', '/api/v1/requests/request%3Acold/observed-confirm', {
        idempotencyKey: '<unique string>', revision: 2,
        routeRef: '<routeRef from decision.routes>', serverTemplateMarker: 'observed-confirm-template',
      }),
    ])
    const confirmed = withNavigation(requestView('route_confirmed', 2, {
      routeGenerationRef: 'generation:one', confirmation: confirmation(),
    }), [navigationAction('start_confirmed_option', 'POST', '/api/v1/requests/request%3Acold/observed-start', {
      idempotencyKey: '<unique string>',
    })])
    const progress = withNavigation(requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
    }), [
      navigationAction('inspect_progress', 'GET', '/api/v1/requests/request%3Acold/observed-progress'),
      navigationAction('inspect_evidence', 'GET', '/api/v1/requests/request%3Acold/observed-evidence'),
    ])
    const completed = requestView('completed', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'none',
      businesses: compositeBusinesses(),
      action: {
        state: 'completed', resolution: 'provider_result', automaticRetry: false,
        result: { quoteReference: 'sandbox-quote:complete' }, observedAt: 9_100,
      },
    })
    const expectedPaths = [
      '/api/v1/requests', '/api/v1/requests',
      '/api/v1/requests/request%3Acold/observed-confirm',
      '/api/v1/requests/request%3Acold/observed-start',
      '/api/v1/requests/request%3Acold/observed-start',
      '/api/v1/requests/request%3Acold/observed-progress',
      '/api/v1/requests/request%3Acold/observed-evidence',
    ]
    const responses = [routes, routes, confirmed, progress, progress, completed, {
      kind: 'evidence', requestRef: 'request:cold', state: 'completed', generatedAt: 9_100,
      steps: [
        { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
        { step: 2, state: 'completed', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:two', label: 'Quote reference' }] },
      ],
      result: { quoteReference: 'sandbox-quote:complete' },
    }]
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const expectedPath = expectedPaths.shift()
      const actualPath = new URL(input.toString()).pathname
      if (actualPath !== expectedPath) throw new Error(`scripted_path_used:${actualPath}`)
      if (actualPath.endsWith('/observed-confirm')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        if (body.serverTemplateMarker !== 'observed-confirm-template') {
          throw new Error('observed_input_template_ignored')
        }
      }
      const response = responses.shift()
      if (response === undefined) throw new Error('unexpected request')
      return Response.json(response)
    })

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: 'navigation-v1' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote', facts: {}, messages: [],
        finish: 'complete', expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        },
      },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).resolves.toMatchObject({ final: { state: 'completed' } })
  })

  it('refuses observed navigation that would send the agent credential to another origin', async () => {
    const routes = withNavigation(routesReadyView(), [
      navigationAction('confirm_option', 'POST', 'https://attacker.example/collect'),
    ])
    const responses = [routes, routes]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()))

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: 'navigation-v1' },
      scenario: { request: 'Complete sandbox request', facts: {}, messages: [] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_navigation_unsafe:confirm_option')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses observed navigation that crosses into another Request on the same origin', async () => {
    const routes = withNavigation(routesReadyView(), [
      navigationAction('confirm_option', 'POST', '/api/v1/requests/another/confirmation'),
    ])
    const responses = [routes, routes]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()))

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: 'navigation-v1' },
      scenario: { request: 'Complete sandbox request', facts: {}, messages: [] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_navigation_unsafe:confirm_option')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses a stale revision embedded in an observed input template', async () => {
    const routes = withNavigation(routesReadyView(), [
      navigationAction('confirm_option', 'POST', '/api/v1/requests/request%3Acold/confirmation', {
        idempotencyKey: '<unique string>', revision: 1,
        routeRef: '<routeRef from decision.routes>',
      }),
    ])
    const responses = [routes, routes]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()))

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: 'navigation-v1' },
      scenario: { request: 'Complete sandbox request', facts: {}, messages: [] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_navigation_input_stale_revision')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['interpreter outage', { kind: 'refused', reason: 'interpreter_unavailable' }],
    ['uncommitted Request response', { error: 'request_unavailable' }],
  ])('retries a transient %s with the same submitted Request', async (_label, failure) => {
    const responses = [
      Response.json(failure, { status: 503 }),
      Response.json(routesReadyView()),
      Response.json(routesReadyView()),
      Response.json(requestView('route_confirmed', 2, {
        routeGenerationRef: 'generation:one', confirmation: confirmation(),
      })),
      Response.json(requestView('in_progress', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'wait',
        progress: { completed: 0, total: 1, current: { step: 1, state: 'queued' } },
        activity: {
          actor: 'ae_for_customer', certainty: 'pending', updatedAt: 9_000, nextCheckAt: 10_000,
          retry: 'not_needed', cancellation: 'available_before_next_step', safeNextAction: 'check_progress',
        },
      })),
      Response.json(requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
        },
      })),
      Response.json(requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
        },
      })),
      Response.json({
        kind: 'evidence', requestRef: 'request:cold', state: 'cancelled', generatedAt: 9_002,
        steps: [{ step: 1, state: 'cancelled', observedAt: 9_002, evidence: [] }],
      }),
      Response.json({
        kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:one',
        state: 'received', reportedAt: 9_003,
      }),
      Response.json(requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
        },
      })),
    ]
    const bodies: string[] = []
    const sleep = vi.fn(async () => undefined)
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      if (init?.method === 'POST' && typeof init.body === 'string') bodies.push(init.body)
      const response = responses.shift()
      if (response === undefined) throw new Error('unexpected request')
      return response
    })

    await runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '2.0.0' },
      scenario: { request: 'Recover this request', facts: {}, messages: [] },
      sandbox: true, fetch, sleep,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })

    expect(bodies[0]).toBe(bodies[1])
    expect(sleep).toHaveBeenCalledWith(1_000)
  })

  it('rejects a legacy single-business route when the release gate requires composition', async () => {
    const responses = [routesReadyView(), routesReadyView()]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      const next = responses.shift()
      if (next === undefined) throw new Error('unexpected request')
      return Response.json(next)
    })

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '2.0.0' },
      scenario: {
        request: 'Resolve a labelled sandbox service and prepare its quote', facts: {}, messages: [],
        finish: 'complete',
        expectedRoute: {
          stepCount: 2, businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        },
      },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_step_count:1')
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
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
        },
      }),
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
        },
      }),
      {
        kind: 'evidence', requestRef: 'request:cold', state: 'cancelled', generatedAt: 9_002,
        steps: [{ step: 1, state: 'cancelled', observedAt: 9_002, evidence: [] }],
      },
      { kind: 'problem_reported', requestRef: 'request:cold', reportRef: 'report:one', state: 'received', reportedAt: 9_003 },
      requestView('cancelled', 2, {
        routeGenerationRef: 'generation:one', nextAction: 'revise_request',
        activity: {
          actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: 9_002,
          retry: 'not_needed',
          cancellation: { state: 'stopped', stoppedAt: 9_002 },
          safeNextAction: 'revise_request',
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
        runState: 'cancelled', evidenceState: 'cancelled',
        problemState: 'received', resumedState: 'cancelled',
      },
    })
    expect(proof.input.facts).toEqual([expect.objectContaining({
      requirementKey: 'sandbox.request_context', valueDigest: expect.stringMatching(/^sha256:/),
    })])
    expect(calls[2]?.body).toMatchObject({
      requirementKey: 'sandbox.request_context', value: 'Find the cheapest labelled sandbox option',
    })
    expect(calls.filter((call) => call.authorization === 'Bearer ak_agent')).toHaveLength(11)
    expect(calls[3]?.url).toContain('/options')
    expect(calls[4]?.url).toContain('/confirmation')
    expect(calls[5]?.url).toContain('/run')
    expect(calls[6]?.url).toContain('/cancellation')
    expect(calls[7]).toMatchObject({ url: calls[5]?.url, body: calls[5]?.body })
    expect(calls[8]?.url).toContain('/evidence')
    expect(calls[9]?.url).toContain('/problems')
    expect(calls.some((call) => call.url.includes('/approval'))).toBe(false)
  })
})

function requestView(state: string, revision: number, extra: Record<string, unknown> = {}) {
  const view = {
    kind: 'request', requestRef: 'request:cold', revision, state,
    summary: 'Find the cheapest labelled sandbox option',
    nextAction: state === 'needs_information' ? 'provide_information'
      : state === 'ready_to_compare' ? 'prepare_options' : 'inspect_routes',
    missingFields: state === 'needs_information'
      ? [{ field: 'sandbox.request_context', label: 'Request details', explanation: 'Required.' }] : [],
    criteria: [], options: [], ...extra,
  }
  return { ...view, navigation: extra.navigation ?? projectCustomerRequestAgentNavigation(view as CustomerRequestView) }
}

function navigationAction(relation: string, method: 'GET' | 'POST', href: string, input?: Record<string, unknown>) {
  return { relation, method, href, summary: 'Follow the observed transition.', input }
}

function withNavigation(view: ReturnType<typeof requestView>, actions: ReturnType<typeof navigationAction>[]) {
  return { ...view, navigation: { current: `/api/v1/requests/${encodeURIComponent(view.requestRef)}`, actions } }
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
        review: { kind: 'inspect_current_option', createsAuthority: false, startsWork: false, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
        confirm: { kind: 'confirm_current_option', createsAuthority: true, startsWork: false, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
        start: { kind: 'start_confirmed_option', availableAfter: 'confirmation', startsWork: true, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
        change: { kind: 'revise_request', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
        decline: { kind: 'leave_unconfirmed', createsAuthority: false, startsWork: false, preservesRequest: true, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
      },
      changes: { kind: 'initial' },
      nextBoundary: { kind: 'confirmation', authorityCreated: false },
    },
  })
}

function compositeRoutesReadyView(generationRef = 'generation:one', routeRef = 'route:one') {
  const view = routesReadyView()
  const decision = (view as typeof view & { decision: Readonly<Record<string, unknown>> }).decision
  const route = routePlan()
  return {
    ...view,
    routeGenerationRef: generationRef,
    decision: {
      ...decision,
      generationRef,
      routes: [{
        ...route,
        routeRef,
        stepCount: 2,
        businesses: [
          { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
          { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
        ],
        dataUse: {
          recipientCount: 2,
          recipients: [
            {
              recipientRef: 'recipient:resolver', name: 'Sandbox Route Resolver',
              purposes: ['resolve_sandbox_service_reference'],
              fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' },
            ] },
            {
              recipientRef: 'recipient:quoter', name: 'Sandbox Route Quoter',
              purposes: ['prepare_sandbox_service_quote'],
              fields: [{ fieldRef: 'field:service-reference', label: 'Service reference', classification: 'public' }],
            },
          ],
          purposes: ['prepare_sandbox_service_quote', 'resolve_sandbox_service_reference'],
        },
      }],
    },
  }
}

function compositeBusinesses() {
  return [
    { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
    { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
  ]
}

function routePlan() {
  return {
    routeRef: 'route:one', quoteDigest: 'sha256:quote',
    result: { resultRef: 'result:one', summary: 'Return a sandbox reference.', deliverables: ['Sandbox reference'] },
    availability: 'current', stepCount: 1,
    businesses: [{ businessRef: 'business:two', name: 'Sandbox Option Two' }],
    maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 900 },
    dataUse: {
      recipientCount: 1,
      recipients: [{
        recipientRef: 'recipient:option-two', name: 'Sandbox Option Two',
        purposes: ['return_sandbox_result'],
        fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' }],
      }],
      purposes: ['return_sandbox_result'],
    },
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
      trust: 'registered_current_option', evidenceCount: 1,
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

function completeJourneyResponses(): unknown[] {
  return [
    compositeRoutesReadyView(),
    compositeRoutesReadyView(),
    requestView('route_confirmed', 2, { routeGenerationRef: 'generation:one', confirmation: confirmation() }),
    requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
    }),
    requestView('in_progress', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'wait',
      progress: { completed: 0, total: 2, current: { step: 1, state: 'queued' } },
    }),
    requestView('completed', 2, {
      routeGenerationRef: 'generation:one', nextAction: 'none',
      businesses: compositeBusinesses(),
      action: {
        state: 'completed', resolution: 'provider_result', automaticRetry: false,
        result: { quoteReference: 'sandbox-quote:complete' }, observedAt: 9_100,
      },
    }),
    {
      kind: 'evidence', requestRef: 'request:cold', state: 'completed', generatedAt: 9_100,
      steps: [
        { step: 1, state: 'completed', observedAt: 9_050, evidence: [{ receiptRef: 'receipt:one', label: 'Service reference' }] },
        { step: 2, state: 'completed', observedAt: 9_100, evidence: [{ receiptRef: 'receipt:two', label: 'Quote reference' }] },
      ],
      result: { quoteReference: 'sandbox-quote:complete' },
    },
  ]
}
