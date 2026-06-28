import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  applyFunnelEvent,
  buildOwnerActivationReadback,
  initialOwnerActivationState,
} from '@/modules/observability/internal/funnel'

describe('owner activation contract', () => {
  it('requires publish, status readback, capability health, share or interest, and attribution', () => {
    const businessId = brandNonEmpty('business:1', 'BusinessId')
    const state = initialOwnerActivationState(businessId, 1)
    const events = [
      'visitor_attributed',
      'publish_succeeded',
      'owner_status_viewed',
      'capability_status_viewed',
      'share_url_copied',
    ] as const

    const activated = events.reduce(
      (current, eventType, index) =>
        applyFunnelEvent(current, {
          eventType,
          source: 'founder',
          stage: current.stage,
          pseudonymousSessionId: 'session:1',
          businessId,
          redactedPayload: '{}',
          consentFlag: false,
          correlationId: `corr:${index}`,
          createdAt: index + 2,
        }),
      state
    )

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
    const state = initialOwnerActivationState(businessId, 1)
    const events = ['slug_conflict', 'publish_failed'] as const

    const blocked = events.reduce(
      (current, eventType, index) =>
        applyFunnelEvent(current, {
          eventType,
          source: 'founder',
          stage: current.stage,
          pseudonymousSessionId: 'session:2',
          businessId,
          redactedPayload: '{}',
          consentFlag: false,
          correlationId: `corr:block:${index}`,
          createdAt: index + 2,
        }),
      state
    )

    expect(buildOwnerActivationReadback(blocked)).toMatchObject({
      stage: 'blocked',
      frictionCode: 'slug_conflict',
      failureCode: 'publish_failed',
      activated: false,
      blocked: true,
      frictionOrFailureSeen: true,
    })
  })
})
