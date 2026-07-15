import { describe, expect, it } from 'vitest'

import { projectCustomerActionStatus } from '@/modules/customer-request/customer-projection'

describe('customer action status projection', () => {
  it('makes unknown, reconciled completion, provider failure, and a not-sent failure legible', () => {
    const common = { requestRef: 'request:one', revision: 1, criteria: [] }

    expect(projectCustomerActionStatus({
      ...common,
      status: { kind: 'unknown', reason: 'provider_pending', observedAt: 10, automaticRetry: false },
    })).toMatchObject({
      state: 'outcome_unknown', nextAction: 'wait',
      action: { state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false },
    })
    expect(projectCustomerActionStatus({
      ...common,
      status: {
        kind: 'completed', resolution: 'reconciled', result: { confirmation: 'booked' },
        resolvedAt: 11, automaticRetry: false,
      },
    })).toMatchObject({
      state: 'completed', nextAction: 'none',
      action: { state: 'completed', resolution: 'reconciled', result: { confirmation: 'booked' } },
    })
    const failed = projectCustomerActionStatus({
      ...common,
      status: {
        kind: 'failed', resolution: 'reconciled', result: { recoveryCode: 'not_available' },
        resolvedAt: 12, automaticRetry: false,
      },
    })
    expect(failed).toMatchObject({
      state: 'failed', nextAction: 'revise_request',
      action: { state: 'failed', resolution: 'reconciled', result: { recoveryCode: 'not_available' } },
    })
    expect(projectCustomerActionStatus({
      ...common,
      status: {
        kind: 'failed', resolution: 'not_sent', result: { reason: 'business_contact_not_started' },
        resolvedAt: 13, automaticRetry: false,
      },
    })).toMatchObject({
      state: 'failed', nextAction: 'revise_request',
      summary: 'AE could not safely contact the business. Nothing was sent.',
      action: {
        state: 'failed', resolution: 'not_sent', result: { reason: 'business_contact_not_started' },
      },
    })
    expect(JSON.stringify(failed)).not.toMatch(/observationRef|envelopeRef|lineageDigest|protocol/)
  })
})
