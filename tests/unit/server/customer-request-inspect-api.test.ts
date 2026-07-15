import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'

describe('customer Request inspect HTTP API', () => {
  it('resumes from one opaque Request reference', async () => {
    const inspect = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 2, state: 'preparing_options',
      summary: 'Checking businesses', nextAction: 'wait', missingFields: [], options: [],
    })
    const response = await handleCustomerRequestGet('request:1', { inspect })
    expect(response.status).toBe(202)
    expect(inspect).toHaveBeenCalledWith({ requestRef: 'request:1' })
    await expect(response.json()).resolves.toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
  })

  it('does not distinguish a foreign Request from a missing Request', async () => {
    const response = await handleCustomerRequestGet('request:unknown', {
      inspect: async () => ({ kind: 'refused', reason: 'request_not_found' }),
    })
    expect(response.status).toBe(404)
  })

  it('preserves the shared exact-generation decision on the human and agent HTTP contract', async () => {
    const projection = routeDecisionProjection()
    const response = await handleCustomerRequestGet(projection.requestRef, {
      inspect: async () => projection,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(projection)
  })
})

function routeDecisionProjection() {
  return {
    kind: 'request' as const, requestRef: 'request:route', revision: 2,
    routeGenerationRef: 'generation:two', state: 'routes_ready' as const,
    summary: 'One way forward is available.', nextAction: 'inspect_routes' as const,
    missingFields: [], criteria: [], options: [],
    decision: {
      generationRef: 'generation:two', requestRevision: 2,
      outcome: { kind: 'routes_available' as const, routeCount: 1, summary: 'One way forward is available.' },
      routes: [{
        routeRef: 'route:opaque',
        quoteDigest: 'quote:opaque',
        result: {
          resultRef: 'route:opaque', summary: 'Prepare a governed result.', deliverables: ['Result reference'],
        },
        availability: 'current' as const, stepCount: 1,
        businesses: [{ businessRef: 'business:opaque', name: 'North Star Services' }],
        maximumTotalCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_200 },
        dataUse: {
          recipientCount: 1,
          recipients: [{
            recipientRef: 'recipient:opaque', name: 'North Star Services', purposes: ['Prepare result'],
            fields: [{ fieldRef: 'field:request', label: 'Request', classification: 'public' as const }],
          }],
          purposes: ['Prepare result'],
        },
        effects: [{ kind: 'information_shared' as const, reversibility: 'irreversible' as const }],
        evidence: [{ label: 'Result reference', purpose: 'completion' as const }],
        recovery: [{ step: 1, businessName: 'North Star Services', posture: 'retry_safe' as const }],
        cancellation: { kind: 'unavailable' as const, summary: 'No cancellation path is published.' },
        validUntil: 50_000, fallback: { available: false, alternatives: [] }, uncertainty: [],
        comparison: {
          outcomeRef: 'outcome:opaque', outcomeFit: 'same_promised_result' as const,
          completeness: 'complete' as const, hardConstraints: 'satisfied' as const,
          maximumCost: { kind: 'known' as const, currency: 'AUD', amountMinor: 1_200 },
          dataExposureCount: 1, irreversibleEffectCount: 1, uncertaintyCount: 0,
          duration: 'not_declared' as const, recovery: 'retry_safe' as const,
          trust: 'registered_live_supply' as const, evidenceCount: 1,
          freshness: { state: 'current' as const, validUntil: 50_000 },
          commercialInfluence: { status: 'none' as const, evidenceRefs: ['commercial:none'] },
        },
        steps: [{
          step: 1, business: { businessRef: 'business:opaque', name: 'North Star Services' }, after: [],
        }],
      }],
      comparison: {
        kind: 'single' as const,
        summary: 'One current way forward is available. This is not a comparison or recommendation.',
      },
      actions: {
        review: { kind: 'inspect_current_option' as const, createsAuthority: false as const, startsWork: false as const, summary: 'Reviewing shows every important limit. It does not confirm or start anything.' },
        confirm: { kind: 'confirm_current_option' as const, createsAuthority: true as const, startsWork: false as const, summary: 'Confirming creates permission for this exact choice. It does not contact a business or start work.' },
        start: { kind: 'start_confirmed_option' as const, availableAfter: 'confirmation' as const, startsWork: true as const, summary: 'Starting uses that confirmation to contact the listed businesses and begin the work.' },
        change: { kind: 'revise_request' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Changing preserves the Request and returns to its details. The current choice remains unconfirmed.' },
        decline: { kind: 'leave_unconfirmed' as const, createsAuthority: false as const, startsWork: false as const, preservesRequest: true as const, summary: 'Declining leaves this choice unconfirmed and starts nothing.' },
      },
      changes: { kind: 'initial' as const },
      nextBoundary: { kind: 'confirmation' as const, authorityCreated: false as const },
    },
  }
}
