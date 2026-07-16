import { describe, expect, it } from 'vitest'

import {
  projectCustomerActionStatus,
  projectRouteCancelled,
  projectRouteProgress,
} from '@/modules/customer-request/customer-projection'

describe('customer action status projection', () => {
  it('names who must act next without exposing execution machinery', () => {
    const progress = (state: 'queued' | 'contacting' | 'awaiting_result' | 'validating_result' | 'needs_attention') => (
      projectRouteProgress({
        requestRef: 'request:one', revision: 1, generationRef: 'generation:one',
        completed: 0, total: 2, current: { step: 1, state },
        updatedAt: 10, cancellationAvailable: true,
      })
    )

    expect(progress('queued').activity).toMatchObject({ actor: 'ae' })
    expect(progress('contacting').activity).toMatchObject({ actor: 'ae' })
    expect(progress('awaiting_result').activity).toMatchObject({ actor: 'business' })
    expect(progress('validating_result').activity).toMatchObject({ actor: 'ae' })
    expect(progress('needs_attention').activity).toMatchObject({ actor: 'customer' })
    expect(projectRouteCancelled({
      requestRef: 'request:one', revision: 1, updatedAt: 11,
    }).activity).toMatchObject({ actor: 'none' })
  })

  it('makes unknown, reconciled completion, provider failure, and a not-sent failure legible', () => {
    const common = {
      requestRef: 'request:one', revision: 1, criteria: [],
      businesses: [{ businessRef: 'business:one', name: 'Business One' }],
    }

    expect(projectCustomerActionStatus({
      ...common,
      routeProgress: { completed: 1, total: 2, currentStep: 2 },
      status: { kind: 'unknown', reason: 'provider_pending', observedAt: 10, automaticRetry: false },
    })).toMatchObject({
      state: 'outcome_unknown', nextAction: 'wait',
      businesses: [{ name: 'Business One' }],
      action: { state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false },
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      activity: { actor: 'ae' },
    })
    expect(projectCustomerActionStatus({
      ...common,
      businesses: [
        { businessRef: 'business:resolver', name: 'Sandbox Route Resolver' },
        { businessRef: 'business:quoter', name: 'Sandbox Route Quoter' },
      ],
      status: {
        kind: 'completed', resolution: 'reconciled', result: { confirmation: 'booked' },
        resolvedAt: 11, automaticRetry: false,
      },
    })).toMatchObject({
      state: 'completed', nextAction: 'none',
      summary: 'The businesses have now confirmed the result.',
      businesses: [
        { name: 'Sandbox Route Resolver' },
        { name: 'Sandbox Route Quoter' },
      ],
      action: { state: 'completed', resolution: 'reconciled', result: { confirmation: 'booked' } },
      activity: { actor: 'none' },
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
      businesses: [{ name: 'Business One' }],
      action: { state: 'failed', resolution: 'reconciled', result: { recoveryCode: 'not_available' } },
      activity: { actor: 'customer' },
    })
    expect(projectCustomerActionStatus({
      ...common,
      routeProgress: { completed: 1, total: 2, currentStep: 2 },
      status: {
        kind: 'failed', resolution: 'not_sent', result: { reason: 'business_contact_not_started' },
        resolvedAt: 13, automaticRetry: false,
      },
    })).toMatchObject({
      state: 'failed', nextAction: 'revise_request',
      summary: 'AE could not safely continue. The next business step was not sent.',
      progress: { completed: 1, total: 2, current: { step: 2, state: 'needs_attention' } },
      action: {
        state: 'failed', resolution: 'not_sent', result: { reason: 'business_contact_not_started' },
      },
    })
    expect(JSON.stringify(failed)).not.toMatch(/observationRef|envelopeRef|lineageDigest|protocol/)
  })
})
