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
    expect(progress('queued').activity).toMatchObject({
      cancellation: {
        state: 'available', until: 'before_next_step_release', releaseMayStartAt: 10,
      },
    })
    expect(progress('contacting').activity).toMatchObject({ actor: 'ae' })
    expect(progress('awaiting_result').activity).toMatchObject({ actor: 'business' })
    expect(progress('validating_result').activity).toMatchObject({ actor: 'ae' })
    expect(progress('needs_attention').activity).toMatchObject({ actor: 'customer' })
    expect(projectRouteCancelled({
      requestRef: 'request:one', revision: 1, updatedAt: 11,
      businesses: [
        { businessRef: 'business:one', name: 'First Business' },
        { businessRef: 'business:two', name: 'Second Business' },
      ],
      routeProgress: { completed: 1, total: 2, currentStep: 2 },
    })).toMatchObject({
      summary: 'Stopped after 1 of 2 business steps completed. No later step began.',
      progress: {
        completed: 1, total: 2, current: { step: 2, state: 'cancelled' },
        dependencies: { completed: [{ step: 1, business: 'First Business' }] },
      },
      activity: {
        actor: 'none',
        cancellation: { state: 'stopped', stoppedAt: 11 },
      },
    })
  })

  it('records the exact non-cancellable boundary and a too-late stop request', () => {
    expect(projectRouteProgress({
      requestRef: 'request:released', revision: 1, generationRef: 'generation:one',
      completed: 0, total: 2, current: { step: 1, state: 'contacting' },
      updatedAt: 20, cancellationAvailable: false, cancellationRequestedAt: 25,
    }).activity).toMatchObject({
      cancellation: {
        state: 'not_available',
        reason: 'business_step_released',
        changedAt: 20,
        requestedAt: 25,
      },
    })
  })

  it('shows completed and blocked business dependencies only for multi-step work', () => {
    const businesses = [
      { businessRef: 'business:resolver', name: 'Route Resolver' },
      { businessRef: 'business:quoter', name: 'Route Quoter' },
      { businessRef: 'business:notifier', name: 'Result Notifier' },
    ]
    expect(projectRouteProgress({
      requestRef: 'request:multi', revision: 1, generationRef: 'generation:one',
      completed: 1, total: 3, current: { step: 2, state: 'awaiting_result' },
      businesses, updatedAt: 10, cancellationAvailable: false,
    }).progress).toMatchObject({
      dependencies: {
        completed: [{ step: 1, business: 'Route Resolver' }],
        blocked: [{ step: 3, business: 'Result Notifier', waitingForStep: 2, waitingForBusiness: 'Route Quoter' }],
      },
    })
    expect(projectRouteProgress({
      requestRef: 'request:single', revision: 1, generationRef: 'generation:one',
      completed: 0, total: 1, current: { step: 1, state: 'awaiting_result' },
      businesses: [businesses[0]!], updatedAt: 10, cancellationAvailable: false,
    }).progress).not.toHaveProperty('dependencies')
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
