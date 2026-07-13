import { describe, expect, it } from 'vitest'

import { projectCustomerActionStatus } from '@/modules/customer-request/customer-projection'

describe('customer action status projection', () => {
  it('makes unknown, reconciled completion, and provider-confirmed failure legible without retry choreography', () => {
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
      state: 'failed', nextAction: 'none',
      action: { state: 'failed', resolution: 'reconciled', result: { recoveryCode: 'not_available' } },
    })
    expect(JSON.stringify(failed)).not.toMatch(/observationRef|envelopeRef|lineageDigest|protocol/)
  })
})
