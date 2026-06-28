import type { BusinessId } from '@/modules/common/ids'
import type { FunnelEventType, OwnerActivationReadback, OwnerActivationState } from '@/modules/observability/public'

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

export type OwnerActivationReadbackInput = OwnerActivationState

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
  const frictionCode = frictionCodeForEvent(event.eventType)
  const failureCode = failureCodeForEvent(event.eventType)
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
    ...(state.frictionCode !== undefined || frictionCode === undefined ? {} : { frictionCode }),
    ...(state.failureCode !== undefined || failureCode === undefined ? {} : { failureCode }),
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

  if (failureCode !== undefined || frictionCode !== undefined) {
    return { ...next, stage: 'blocked' }
  }

  return next
}

export function buildOwnerActivationReadback(state: OwnerActivationReadbackInput): OwnerActivationReadback {
  return {
    ...state,
    activated: state.stage === 'activated',
    blocked: state.stage === 'blocked',
    frictionOrFailureSeen: state.frictionCode !== undefined || state.failureCode !== undefined,
  }
}

function frictionCodeForEvent(eventType: FunnelEventType): string | undefined {
  if (eventType === 'slug_conflict' || eventType === 'duplicate_suspected') {
    return eventType
  }

  return undefined
}

function failureCodeForEvent(eventType: FunnelEventType): string | undefined {
  if (eventType === 'publish_failed') {
    return eventType
  }

  return undefined
}
