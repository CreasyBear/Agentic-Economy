import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  applyFunnelEvent,
  buildOwnerActivationReadback,
  initialOwnerActivationState,
  type FunnelEventContract,
} from '@/modules/observability/internal/funnel'
import type { FunnelEventType, OwnerActivationState } from '@/modules/observability/public'

describe('owner activation contract', () => {
  it('requires publish, status readback, capability health, share or interest, and attribution', () => {
    const businessId = brandNonEmpty('business:1', 'BusinessId')
    const activated = applyEvents(initialOwnerActivationState(businessId, 1), [
      'visitor_attributed',
      'publish_succeeded',
      'owner_status_viewed',
      'capability_status_viewed',
      'share_url_copied',
    ])

    const readback = buildOwnerActivationReadback(activated)

    expect(readback).toMatchObject({
      stage: 'activated',
      publishSeen: true,
      statusSeen: true,
      capabilityHealthSeen: true,
      sharedOrInterestSubmitted: true,
      attributionRecorded: true,
      activated: true,
      blocked: false,
      frictionOrFailureSeen: false,
    })
  })

  it('keeps friction and failure evidence queryable for blocked owner journeys', () => {
    const businessId = brandNonEmpty('business:2', 'BusinessId')
    const blocked = applyEvents(initialOwnerActivationState(businessId, 1), ['slug_conflict', 'publish_failed'])

    expect(buildOwnerActivationReadback(blocked)).toMatchObject({
      stage: 'blocked',
      frictionCode: 'slug_conflict',
      failureCode: 'publish_failed',
      activated: false,
      blocked: true,
      frictionOrFailureSeen: true,
    })
  })

  it('maps representative P2-P4 funnel events onto the existing readback fields', () => {
    const businessId = brandNonEmpty('business:3', 'BusinessId')
    const state = applyEvents(initialOwnerActivationState(businessId, 1), [
      'inquiry_started',
      'owner_inbox_viewed',
      'notification_delivered',
      'developer_docs_viewed',
      'protected_action_receipt_viewed',
    ])

    expect(buildOwnerActivationReadback(state)).toMatchObject({
      statusSeen: true,
      capabilityHealthSeen: true,
      sharedOrInterestSubmitted: true,
      activated: false,
      blocked: false,
    })
  })

  it('uses P5 paid activation signals without adding paid-only metrics', () => {
    const businessId = brandNonEmpty('business:4', 'BusinessId')
    const activated = applyEvents(initialOwnerActivationState(businessId, 1), [
      'visitor_attributed',
      'publish_succeeded',
      'paid_activation_started',
      'checkout_returned',
      'receipt_viewed',
    ])

    const readback = buildOwnerActivationReadback(activated)

    expect(readback).toMatchObject({
      stage: 'activated',
      statusSeen: true,
      capabilityHealthSeen: true,
      sharedOrInterestSubmitted: true,
      activated: true,
    })
    expect(readback).not.toHaveProperty('paidActivationStarted')
    expect(readback).not.toHaveProperty('checkoutReturned')
  })

  it('blocks on P2, P4, and P5 terminal or denied signals', () => {
    const businessId = brandNonEmpty('business:5', 'BusinessId')

    for (const eventType of [
      'inquiry_rejected',
      'protected_action_policy_denied',
      'billing_reconciliation_failed',
    ] as const) {
      const blocked = applyEvents(initialOwnerActivationState(businessId, 1), [eventType])

      expect(buildOwnerActivationReadback(blocked)).toMatchObject({
        stage: 'blocked',
        blocked: true,
        frictionOrFailureSeen: true,
      })
    }
  })
})

function applyEvents(state: OwnerActivationState, events: readonly FunnelEventType[]): OwnerActivationState {
  return events.reduce(
    (current, eventType, index) =>
      applyFunnelEvent(current, event(eventType, current, index)),
    state
  )
}

function event(eventType: FunnelEventType, state: OwnerActivationState, index: number): FunnelEventContract {
  return {
    eventType,
    source: 'founder',
    stage: state.stage,
    pseudonymousSessionId: `session:${state.businessId}`,
    businessId: state.businessId,
    redactedPayload: '{}',
    consentFlag: false,
    correlationId: `corr:${index}`,
    createdAt: index + 2,
  }
}
