import { describe, expect, it, vi } from 'vitest'

import {
  runHostedCustomerRequestJourney,
  verifyHostedCustomerRequestFrontDoor,
} from '@/modules/customer-request/hosted-agent-journey'

describe('hosted Customer Request journey', () => {
  it('refuses any non-production origin before credentials can leave the process', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://attacker.example', agentApiKey: 'ak_agent', customerSessionToken: 'sess_customer',
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
      requestView('options_ready', 1, { preparedAction: preparedAction('required') }),
      requestView('options_ready', 1, { preparedAction: preparedAction('required') }),
    ]
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(responses.shift()))

    await expect(runHostedCustomerRequestJourney({
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent', customerSessionToken: 'sess_customer',
      expectedRevision: 'a'.repeat(40), expectedDeploymentId: 'dpl_exact',
      agent: { name: 'cold-external-agent', version: '1.0.0' },
      scenario: { request: 'Sandbox request', facts: { '*': 'Configured but unused' }, messages: ['Unused'] },
      sandbox: true, fetch,
      verifyRelease: async () => ({ kind: 'verified', revision: 'a'.repeat(40), deploymentId: 'dpl_exact' }),
      verifyDiscovery: async () => undefined,
      verifyAnonymousRefusal: async () => undefined,
    })).rejects.toThrow('hosted_journey_typed_fact_not_submitted')
  })

  it('stops the agent at both authority boundaries and resumes only after independent customer decisions', async () => {
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
      requestView('needs_authorization', 2, {
        disclosureReview: {
          purpose: 'Return sandbox result', maximumRecipients: 2,
          categories: [{ label: 'Request details', classification: 'public' }],
        },
      }),
      requestView('needs_authorization', 2, {
        preparationRef: 'action-preparation:opaque',
        disclosureReview: {
          purpose: 'Return sandbox result', maximumRecipients: 2,
          categories: [{ label: 'Request details', classification: 'public' }],
        },
      }),
      preparedView('required'),
      preparedView('required'),
      { kind: 'approved', requestRef: 'request:cold', revision: 2,
        approvalRef: 'approval-grant:v2:opaque', preparedActionRef: 'prepared-action:v2:opaque',
        spend: { currency: 'AUD', maximumAmountMinor: 900 }, expiresAt: 20_000,
        recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false } },
      preparedView('recorded'),
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
      baseUrl: 'https://agentic-economy-phi.vercel.app', agentApiKey: 'ak_agent', customerSessionToken: 'sess_customer',
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
      authorityStops: ['preparation_disclosure', 'prepared_action_approval'],
      final: {
        state: 'options_ready', businessName: 'Sandbox Option Two',
        approval: { state: 'recorded', maximumSpendMinor: 900 },
      },
    })
    expect(proof.input.facts).toEqual([expect.objectContaining({
      requirementKey: 'sandbox.request_context', valueDigest: expect.stringMatching(/^sha256:/),
    })])
    expect(calls[2]?.body).toMatchObject({
      requirementKey: 'sandbox.request_context', value: 'Find the cheapest labelled sandbox option',
    })
    expect(calls.filter((call) => call.authorization === 'Bearer sess_customer')).toHaveLength(2)
    expect(calls.filter((call) => call.authorization === 'Bearer ak_agent')).toHaveLength(6)
    expect(calls[3]?.url).toContain('/options')
    expect(calls[4]?.url).toContain('/authorization')
    expect(calls[6]?.url).toContain('/approval')
  })
})

function requestView(state: string, revision: number, extra: Record<string, unknown> = {}) {
  return {
    kind: 'request', requestRef: 'request:cold', revision, state,
    summary: 'Find the cheapest labelled sandbox option',
    nextAction: state === 'needs_information' ? 'provide_information'
      : state === 'needs_authorization' ? 'review_disclosure' : 'inspect_options',
    missingFields: state === 'needs_information'
      ? [{ field: 'sandbox.request_context', label: 'Request details', explanation: 'Required.' }] : [],
    criteria: [], options: [], ...extra,
  }
}

function preparedView(approval: 'required' | 'recorded') {
  return requestView('options_ready', 2, {
    preparedAction: preparedAction(approval),
  })
}

function preparedAction(approval: 'required' | 'recorded') {
  return {
    actionRef: 'prepared-action:v2:opaque', businessName: 'Sandbox Option Two',
    offeringLabel: 'Sandbox reference lookup', summary: 'Labelled sandbox supply.',
    price: { currency: 'AUD', minimumAmountMinor: 900, maximumAmountMinor: 900 },
    materialTerms: [{ label: 'Environment', value: 'Sandbox only; not real supply.' }],
    cancellation: { kind: 'unsupported' }, validUntil: 20_000,
    selection: { basis: 'lowest_maximum_price', alternativeCount: 1, unavailableCount: 0, commercialInfluence: 'none' },
    dataUse: { categories: [{ label: 'Request details', classification: 'public' }], purposes: ['return_sandbox_result'] },
    effects: [{ class: 'data_release', reversibility: 'irreversible' }],
    alternatives: [{
      businessName: 'Sandbox Option One',
      price: { currency: 'AUD', minimumAmountMinor: 1_200, maximumAmountMinor: 1_200 }, validUntil: 20_000,
    }],
    approval: approval === 'required'
      ? { state: 'required' }
      : { state: 'recorded', currency: 'AUD', maximumSpendMinor: 900, expiresAt: 20_000, recordedAt: 10_000 },
  }
}
