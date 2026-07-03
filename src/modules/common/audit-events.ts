import type { AuditEventId, BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'

export const ActorKindValues = ['owner', 'admin', 'system', 'anonymous'] as const

export const AuditTargetTypeValues = [
  'claim',
  'business',
  'service',
  'capability',
  'registry_projection',
  'discovery_manifest',
  'admin_membership',
  'operator_control',
  'dispute',
  'inquiry',
  'notification',
  'notification_provider_event',
  'developer_discovery',
  'api_key',
  'protected_action',
  'protected_action_attempt',
  'billing',
  'billing_provider_event',
  'billing_reconciliation',
  'business_action_card',
  'business_action_mandate',
  'business_action_request',
  'business_action_checkpoint',
  'business_action_guardrail_evidence',
  'business_action_external_evidence',
  'business_action_result_artifact',
  'business_action_receipt',
  'business_action_support',
  'business_action_private_evidence',
  'business_action_no_repair',
] as const

export const AuditEventTypeValues = [
  'claim.created',
  'claim.rate_limited',
  'claim.duplicate_suspected',
  'claim.publish_rejected',
  'claim.published',
  'business.suppressed',
  'business.unsuppressed',
  'dispute.opened',
  'dispute.updated',
  'dispute.closed',
  'registry.sync_queued',
  'registry.sync_succeeded',
  'registry.sync_failed',
  'registry.sync_stale',
  'discovery.generated',
  'discovery.degraded',
  'discovery.unavailable',
  'admin.membership_bootstrapped',
  'admin.membership_granted',
  'admin.membership_revoked',
  'admin.break_glass_used',
  'admin.action_denied',
  'operator_control.changed',
  'inquiry.submitted',
  'inquiry.rejected',
  'inquiry.rate_limited',
  'inquiry.viewed',
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
  'notification.webhook_duplicate',
  'notification.webhook_rejected',
  'notification.webhook_held',
  'developer_discovery.generated',
  'developer_discovery.withheld',
  'developer_discovery.degraded',
  'developer_discovery.parity_failed',
  'developer_discovery.fetch_recorded',
  'developer_discovery.cache_invalidated',
  'api_key.created',
  'api_key.revealed',
  'api_key.used',
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
  'protected_action.disputed',
  'protected_action.reversed',
  'protected_action.callback_received',
  'protected_action.callback_rejected',
  'billing.checkout_started',
  'billing.portal_started',
  'billing.return_recorded',
  'billing.cancel_returned',
  'billing.provider_event_ingested',
  'billing.provider_event_duplicate',
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
  'business_action.card_versioned',
  'business_action.mandate_recorded',
  'business_action.request_proposed',
  'business_action.checkpoint_recorded',
  'business_action.guardrail_allowed',
  'business_action.guardrail_blocked',
  'business_action.evidence_ingested',
  'business_action.evidence_held',
  'business_action.result_artifact_recorded',
  'business_action.receipt_recorded',
  'business_action.proof_gap_recorded',
  'business_action.no_repair_marked',
] as const

export type ActorKind = (typeof ActorKindValues)[number]
export type AuditTargetType = (typeof AuditTargetTypeValues)[number]
export type AuditEventType = (typeof AuditEventTypeValues)[number]

export type RedactedPayload =
  | null
  | string
  | number
  | boolean
  | readonly RedactedPayload[]
  | { readonly [key: string]: RedactedPayload }

export type AuditEventContract = {
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
  evidenceRefs: readonly string[]
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  failureCode?: string
  createdAt: number
}

export type AuditEventInput = Omit<AuditEventContract, 'evidenceRefs'> & {
  evidenceRefs?: readonly string[]
}

export type AuditValidationResult =
  | { valid: true; event: AuditEventContract }
  | { valid: false; reason: 'missing_identity' | 'missing_payload_hash' | 'missing_state_transition' }

export type AuditEventSink = {
  auditEvents: AuditEventContract[]
}

const stateChangingEvents: Partial<Record<AuditEventType, true>> = {
  'claim.published': true,
  'business.suppressed': true,
  'business.unsuppressed': true,
  'dispute.updated': true,
  'dispute.closed': true,
  'admin.membership_bootstrapped': true,
  'admin.membership_granted': true,
  'admin.membership_revoked': true,
  'operator_control.changed': true,
  'inquiry.submitted': true,
  'inquiry.rejected': true,
  'inquiry.read_marked': true,
  'inquiry.replied': true,
  'inquiry.closed': true,
  'inquiry.private_content_deleted': true,
  'notification.queued': true,
  'notification.triggered': true,
  'notification.sent': true,
  'notification.delivered': true,
  'notification.bounced': true,
  'notification.complained': true,
  'notification.delivery_delayed': true,
  'notification.failed': true,
  'notification.suppressed': true,
  'notification.retry_scheduled': true,
  'notification.retry_attempted': true,
  'notification.retry_exhausted': true,
  'notification.no_repair_marked': true,
  'notification.webhook_received': true,
  'notification.webhook_rejected': true,
  'notification.webhook_held': true,
  'developer_discovery.generated': true,
  'developer_discovery.withheld': true,
  'developer_discovery.degraded': true,
  'developer_discovery.parity_failed': true,
  'developer_discovery.cache_invalidated': true,
  'api_key.created': true,
  'api_key.revealed': true,
  'api_key.denied': true,
  'api_key.rotated': true,
  'api_key.revoked': true,
  'protected_action.proposed': true,
  'protected_action.proposal_rejected': true,
  'protected_action.policy_evaluated': true,
  'protected_action.approved': true,
  'protected_action.rejected': true,
  'protected_action.expired': true,
  'protected_action.gateway_admitted': true,
  'protected_action.gateway_consumed': true,
  'protected_action.gateway_replay_rejected': true,
  'protected_action.attempted': true,
  'protected_action.attempt_succeeded': true,
  'protected_action.attempt_failed': true,
  'protected_action.retry_attempted': true,
  'protected_action.retry_exhausted': true,
  'protected_action.receipt_recorded': true,
  'protected_action.proof_gap_recorded': true,
  'protected_action.no_repair_marked': true,
  'protected_action.disputed': true,
  'protected_action.reversed': true,
  'protected_action.callback_received': true,
  'protected_action.callback_rejected': true,
  'billing.checkout_started': true,
  'billing.portal_started': true,
  'billing.return_recorded': true,
  'billing.cancel_returned': true,
  'billing.provider_event_ingested': true,
  'billing.provider_event_rejected': true,
  'billing.provider_event_held': true,
  'billing.receipt_recorded': true,
  'billing.paid_state_changed': true,
  'billing.refund_recorded': true,
  'billing.dispute_recorded': true,
  'billing.chargeback_recorded': true,
  'billing.cancelled': true,
  'billing.past_due_recorded': true,
  'billing.reconciliation_started': true,
  'billing.reconciliation_mismatch': true,
  'billing.reconciliation_failed': true,
  'billing.reconciliation_repaired': true,
  'billing.no_repair_marked': true,
}

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

  if (stateChangingEvents[input.eventType] === true && (input.beforeState === undefined || input.afterState === undefined)) {
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
