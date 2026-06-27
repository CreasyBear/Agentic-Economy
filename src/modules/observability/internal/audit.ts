import type { AuditEventId, BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import type { ActorKind, AuditEventContract, AuditEventType, AuditTargetType, RedactedPayload } from '@/modules/observability/public'

export type AuditEventInput = {
  eventId: AuditEventId
  eventType: AuditEventType
  actorKind: ActorKind
  actorRef: string
  targetType: AuditTargetType
  targetRef: string
  businessId?: BusinessId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  beforeState?: string
  afterState?: string
  reasonCode?: string
  evidenceRefs?: readonly string[]
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  failureCode?: string
  createdAt: number
}

export type AuditValidationResult =
  | { valid: true; event: AuditEventContract }
  | { valid: false; reason: 'missing_identity' | 'missing_payload_hash' | 'missing_state_transition' }

const stateChangingEvents = new Set<AuditEventType>([
  'claim.published',
  'business.suppressed',
  'business.unsuppressed',
  'dispute.updated',
  'dispute.closed',
  'admin.membership_bootstrapped',
  'admin.membership_granted',
  'admin.membership_revoked',
  'operator_control.changed',
])

export function validateAuditEvent(input: AuditEventInput): AuditValidationResult {
  if (
    input.eventId.length === 0 ||
    input.actorRef.length === 0 ||
    input.targetRef.length === 0 ||
    input.idempotencyKey.length === 0 ||
    input.correlationId.length === 0
  ) {
    return { valid: false, reason: 'missing_identity' }
  }

  if (input.payloadHash.length === 0) {
    return { valid: false, reason: 'missing_payload_hash' }
  }

  if (stateChangingEvents.has(input.eventType) && (input.beforeState === undefined || input.afterState === undefined)) {
    return { valid: false, reason: 'missing_state_transition' }
  }

  return {
    valid: true,
    event: {
      ...input,
      evidenceRefs: input.evidenceRefs ?? [],
    },
  }
}
