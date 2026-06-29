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
  'inquiry.submitted',
  'inquiry.rejected',
  'inquiry.read_marked',
  'inquiry.replied',
  'inquiry.closed',
  'inquiry.private_content_deleted',
  'notification.queued',
  'notification.triggered',
  'notification.sent',
  'notification.delivered',
  'notification.bounced',
  'notification.complained',
  'notification.delivery_delayed',
  'notification.failed',
  'notification.suppressed',
  'notification.retry_scheduled',
  'notification.retry_attempted',
  'notification.retry_exhausted',
  'notification.no_repair_marked',
  'notification.webhook_received',
  'notification.webhook_rejected',
  'notification.webhook_held',
  'developer_discovery.generated',
  'developer_discovery.withheld',
  'developer_discovery.degraded',
  'developer_discovery.parity_failed',
  'developer_discovery.cache_invalidated',
  'api_key.created',
  'api_key.revealed',
  'api_key.denied',
  'api_key.rotated',
  'api_key.revoked',
  'protected_action.proposed',
  'protected_action.proposal_rejected',
  'protected_action.policy_evaluated',
  'protected_action.approved',
  'protected_action.rejected',
  'protected_action.expired',
  'protected_action.gateway_admitted',
  'protected_action.gateway_consumed',
  'protected_action.gateway_replay_rejected',
  'protected_action.attempted',
  'protected_action.attempt_succeeded',
  'protected_action.attempt_failed',
  'protected_action.retry_attempted',
  'protected_action.retry_exhausted',
  'protected_action.receipt_recorded',
  'protected_action.proof_gap_recorded',
  'protected_action.no_repair_marked',
  'protected_action.callback_received',
  'protected_action.callback_rejected',
  'billing.checkout_started',
  'billing.portal_started',
  'billing.return_recorded',
  'billing.cancel_returned',
  'billing.provider_event_ingested',
  'billing.provider_event_rejected',
  'billing.provider_event_held',
  'billing.receipt_recorded',
  'billing.paid_state_changed',
  'billing.refund_recorded',
  'billing.dispute_recorded',
  'billing.chargeback_recorded',
  'billing.cancelled',
  'billing.past_due_recorded',
  'billing.reconciliation_started',
  'billing.reconciliation_mismatch',
  'billing.reconciliation_failed',
  'billing.reconciliation_repaired',
  'billing.no_repair_marked',
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
