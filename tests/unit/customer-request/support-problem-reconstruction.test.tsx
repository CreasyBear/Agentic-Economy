import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SupportProblemReconstruction } from '../../../src/routes/_operator/admin.request-problems'

describe('support Request reconstruction', () => {
  it('renders one customer-semantic record without exposing transport machinery', () => {
    const html = renderToStaticMarkup(<SupportProblemReconstruction reconstruction={{
      request: {
        revision: 1,
        ordinaryRequest: 'Resolve a service reference and prepare its quote',
      },
      choice: {
        businesses: ['Route admission-resolver', 'Route admission-quoter'],
        selectedBecause: [
          'All 2 registered steps can provide the requested result.',
          'The confirmed option stays within AUD 10.00.',
        ],
        confirmedAt: 5_000,
        validUntil: 305_000,
      },
      authority: {
        state: 'current',
        source: 'customer_confirmation',
        spend: {
          limit: { currency: 'AUD', units: '1000', exponent: 2 },
          admitted: { currency: 'AUD', units: '300', exponent: 2 },
        },
        dataSharing: [{
          classification: 'public',
          recipient: 'Route admission-resolver',
          purposes: ['resolve_service_reference'],
          releaseState: 'authorized',
        }],
        effects: [{
          class: 'data_release', reversibility: 'irreversible', releaseState: 'authorized',
        }],
      },
      execution: {
        state: 'queued',
        completedSteps: 0,
        totalSteps: 2,
        duplicateRisk: 'protected_by_required_idempotency',
        steps: [
          { step: 1, business: 'Route admission-resolver', state: 'queued', evidence: [] },
          { step: 2, business: 'Route admission-quoter', state: 'blocked', evidence: [] },
        ],
      },
      recovery: {
        nextActor: 'ae',
        nextAction: 'await_status_update',
        retry: 'not_needed',
      },
    }} />)

    expect(html).toContain('Resolve a service reference and prepare its quote')
    expect(html).toContain('Route admission-resolver')
    expect(html).toContain('AUD 10.00 maximum')
    expect(html).toContain('AUD 3.00 admitted so far')
    expect(html).toContain('AE support')
    expect(html).toContain('Wait for the next status update')
    expect(html).not.toMatch(/mandate|binding|transport|credential|operation key/i)
  })
})
