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

const statusReadbackEvents = new Set<FunnelEventType>([
  'owner_status_viewed',
  'owner_inbox_viewed',
  'owner_inquiry_read',
  'protected_action_receipt_viewed',
  'receipt_viewed',
])

const capabilityHealthEvents = new Set<FunnelEventType>([
  'capability_status_viewed',
  'inquiry_available_seen',
  'notification_delivered',
  'developer_docs_viewed',
  'schema_downloaded',
  'example_fixture_downloaded',
  'discovery_health_viewed',
  'protected_action_receipt_viewed',
  'billing_provider_event_ingested',
  'billing_reconciliation_repaired',
  'receipt_viewed',
])

const ownerIntentEvents = new Set<FunnelEventType>([
  'share_url_copied',
  'owner_interest_submitted',
  'inquiry_started',
  'inquiry_submitted',
  'owner_inquiry_replied',
  'protected_action_proposed',
  'protected_action_approved',
  'protected_action_attempted',
  'paid_activation_started',
  'checkout_returned',
])

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
    statusSeen: state.statusSeen || statusReadbackEvents.has(event.eventType),
    capabilityHealthSeen: state.capabilityHealthSeen || capabilityHealthEvents.has(event.eventType),
    sharedOrInterestSubmitted: state.sharedOrInterestSubmitted || ownerIntentEvents.has(event.eventType),
    attributionRecorded: state.attributionRecorded || event.eventType === 'visitor_attributed',
    ...(state.frictionCode !== undefined || frictionCode === undefined ? {} : { frictionCode }),
    ...(state.failureCode !== undefined || failureCode === undefined ? {} : { failureCode }),
    lastEventAt: event.createdAt,
  }

  if (failureCode !== undefined || frictionCode !== undefined) {
    return { ...next, stage: 'blocked' }
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
  if (
    eventType === 'slug_conflict' ||
    eventType === 'duplicate_suspected' ||
    eventType === 'inquiry_rejected' ||
    eventType === 'protected_action_policy_denied' ||
    eventType === 'protected_action_rejected' ||
    eventType === 'checkout_cancelled' ||
    eventType === 'refund_or_dispute_recorded'
  ) {
    return eventType
  }

  return undefined
}

function failureCodeForEvent(eventType: FunnelEventType): string | undefined {
  if (
    eventType === 'publish_failed' ||
    eventType === 'notification_failed' ||
    eventType === 'billing_reconciliation_failed'
  ) {
    return eventType
  }

  return undefined
}
