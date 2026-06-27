import type { BusinessId } from '@/modules/common/ids'
import type { FunnelEventType, OwnerActivationState } from '@/modules/observability/public'

export type FunnelEventContract = {
  eventType: FunnelEventType
  source: string
  stage: OwnerActivationState['stage']
  pseudonymousSessionId: string
  businessId?: BusinessId
  redactedPayload: string
  consentFlag: boolean
  correlationId: string
  createdAt: number
}

export function initialOwnerActivationState(businessId: BusinessId, now: number): OwnerActivationState {
  return {
    businessId,
    stage: 'visitor',
    publishSeen: false,
    statusSeen: false,
    capabilityHealthSeen: false,
    sharedOrInterestSubmitted: false,
    attributionRecorded: false,
    lastEventAt: now,
  }
}

export function applyFunnelEvent(state: OwnerActivationState, event: FunnelEventContract): OwnerActivationState {
  const next = {
    ...state,
    publishSeen: state.publishSeen || event.eventType === 'publish_succeeded',
    statusSeen: state.statusSeen || event.eventType === 'owner_status_viewed',
    capabilityHealthSeen: state.capabilityHealthSeen || event.eventType === 'capability_status_viewed',
    sharedOrInterestSubmitted:
      state.sharedOrInterestSubmitted ||
      event.eventType === 'share_url_copied' ||
      event.eventType === 'owner_interest_submitted',
    attributionRecorded: state.attributionRecorded || event.eventType === 'visitor_attributed',
    lastEventAt: event.createdAt,
  }

  if (
    next.publishSeen &&
    next.statusSeen &&
    next.capabilityHealthSeen &&
    next.sharedOrInterestSubmitted &&
    next.attributionRecorded
  ) {
    return { ...next, stage: 'activated' }
  }

  if (next.publishSeen) {
    return { ...next, stage: 'published' }
  }

  if (event.eventType === 'claim_started') {
    return { ...next, stage: 'claim_started' }
  }

  if (event.eventType === 'publish_failed' || event.eventType === 'duplicate_suspected') {
    return { ...next, stage: 'blocked' }
  }

  return next
}
