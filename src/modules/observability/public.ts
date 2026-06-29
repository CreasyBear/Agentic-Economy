import type { AuditEventId, BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import type { VisibilityTargetType } from '@/modules/business/public'
import {
  markOperationSucceeded as markOperationSucceededImpl,
  reserveOperationKey as reserveOperationKeyImpl,
} from './internal/operation-keys'
import { recordInvalidationIntent as recordInvalidationIntentImpl } from './internal/outbox'
import { validateAuditEvent as validateAuditEventImpl } from './internal/audit'
import {
  readOperatorControls as readOperatorControlsImpl,
  setOperatorControl as setOperatorControlImpl,
} from './internal/operator-controls'
import {
  applyFunnelEvent as applyFunnelEventImpl,
  buildOwnerActivationReadback as buildOwnerActivationReadbackImpl,
  initialOwnerActivationState as initialOwnerActivationStateImpl,
} from './internal/funnel'
import type {
  AuditEventInput,
  AuditValidationResult,
} from './internal/audit'
import type { AdminMembership, CsrfCheckInput } from '@/modules/security/public'
import type {
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
} from './internal/operation-keys'
import type { FunnelEventContract, OwnerActivationReadbackInput } from './internal/funnel'

export const OperationKeyStatusValues = ['in_progress', 'succeeded', 'failed_retryable', 'failed_terminal'] as const
export type OperationKeyStatus = (typeof OperationKeyStatusValues)[number]

export const ActorKindValues = ['owner', 'admin', 'system', 'anonymous'] as const
export type ActorKind = (typeof ActorKindValues)[number]

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
export type AuditTargetType = (typeof AuditTargetTypeValues)[number]

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
export type AuditEventType = (typeof AuditEventTypeValues)[number]

export const OperatorControlKeyValues = [
  'claims_enabled',
  'publish_enabled',
  'registry_enabled',
  'discovery_enabled',
  'public_copy_safe_mode',
  'inquiries_enabled',
  'inquiry_owner_replies_enabled',
  'notification_dispatch_enabled',
  'notification_webhooks_enabled',
  'developer_discovery_publish_enabled',
  'discovery_api_keys_enabled',
  'protected_actions_enabled',
  'protected_action_attempts_enabled',
  'paid_activation_enabled',
  'billing_webhooks_enabled',
  'billing_reconciliation_enabled',
  'business_actions_enabled',
  'business_action_attempts_enabled',
] as const
export type OperatorControlKey = (typeof OperatorControlKeyValues)[number]

export const InvalidationSurfaceValues = ['public_catalog', 'registry_projection', 'discovery_manifest'] as const
export type InvalidationSurface = (typeof InvalidationSurfaceValues)[number]

export const InvalidationIntentStatusValues = ['queued', 'applied'] as const
export type InvalidationIntentStatus = (typeof InvalidationIntentStatusValues)[number]

export const FunnelEventTypeValues = [
  'visitor_attributed',
  'claim_cta_clicked',
  'claim_started',
  'auth_started',
  'auth_completed',
  'owner_interest_submitted',
  'claim_submitted',
  'slug_conflict',
  'duplicate_suspected',
  'publish_succeeded',
  'service_added',
  'capability_status_viewed',
  'publish_failed',
  'owner_status_viewed',
  'share_url_copied',
  'registry_search',
  'service_registry_result_clicked',
  'ucp_manifest_fetched',
  'dispute_opened',
  'suppression_applied',
  'inquiry_available_seen',
  'inquiry_started',
  'inquiry_submitted',
  'inquiry_rejected',
  'owner_inbox_viewed',
  'owner_inquiry_read',
  'owner_inquiry_replied',
  'inquiry_closed',
  'notification_queued',
  'notification_delivered',
  'notification_failed',
  'developer_docs_viewed',
  'schema_downloaded',
  'example_fixture_downloaded',
  'discovery_health_viewed',
  'protected_action_proposed',
  'protected_action_policy_denied',
  'protected_action_approved',
  'protected_action_rejected',
  'protected_action_attempted',
  'protected_action_receipt_viewed',
  'paid_activation_started',
  'checkout_returned',
  'checkout_cancelled',
  'billing_provider_event_ingested',
  'receipt_viewed',
  'refund_or_dispute_recorded',
  'billing_reconciliation_failed',
  'billing_reconciliation_repaired',
  'business_action_card_viewed',
  'business_action_request_started',
  'business_action_checkpoint_recorded',
  'business_action_guardrail_allowed',
  'business_action_guardrail_blocked',
  'business_action_evidence_ingested',
  'business_action_receipt_viewed',
  'business_action_proof_gap_recorded',
] as const
export type FunnelEventType = (typeof FunnelEventTypeValues)[number]

export const ActivationStageValues = ['visitor', 'claim_started', 'published', 'activated', 'blocked'] as const
export type ActivationStage = (typeof ActivationStageValues)[number]

export type OperationKeyRecord = {
  actorRef: string
  actorKind: ActorKind
  operationName: string
  key: OperationKey
  requestHash: SourceHash
  sourceHash?: SourceHash
  status: OperationKeyStatus
  resultHash?: SourceHash
  effectRefs: readonly string[]
  retryAfter?: number
  createdAt: number
  updatedAt: number
}

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

export type RedactedPayload =
  | null
  | string
  | number
  | boolean
  | readonly RedactedPayload[]
  | { readonly [key: string]: RedactedPayload }

export type OwnerActivationState = {
  businessId: BusinessId
  stage: ActivationStage
  publishSeen: boolean
  statusSeen: boolean
  capabilityHealthSeen: boolean
  sharedOrInterestSubmitted: boolean
  attributionRecorded: boolean
  frictionCode?: string
  failureCode?: string
  lastEventAt: number
}

export type OwnerActivationReadback = OwnerActivationState & {
  activated: boolean
  blocked: boolean
  frictionOrFailureSeen: boolean
}

export type InvalidationIntent = {
  intentId: string
  businessId: BusinessId
  targetType: VisibilityTargetType
  targetRef: string
  surfaces: readonly InvalidationSurface[]
  status: InvalidationIntentStatus
  reasonCode: string
  createdAt: number
}

export type OperatorControlRecord = {
  key: OperatorControlKey
  enabled: boolean
  changedByAdminRef: string
  reasonCode: string
  evidenceRefs: string[]
  correlationId: CorrelationId
  operationKey: OperationKey
  expiresAt?: number
  updatedAt: number
}

export type OperatorControlSourceState = {
  operatorControls: OperatorControlRecord[]
  auditEvents: AuditEventContract[]
}

export type SetOperatorControlCommand = {
  adminMembership: AdminMembership | undefined
  key: OperatorControlKey
  enabled: boolean
  reasonCode: string
  evidenceRefs: readonly string[]
  expiresAt?: number
  security: {
    csrf: CsrfCheckInput
  }
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type OperatorControlReadback = {
  key: OperatorControlKey
  configuredEnabled: boolean
  effectiveEnabled: boolean
  expired: boolean
  expiresAt?: number
  source: 'default' | 'source_owned'
  reasonCode?: string
  changedByAdminRef?: string
  correlationId?: CorrelationId
  updatedAt: number
}

export type SetOperatorControlResult =
  | {
      kind: 'ok'
      code: 'operator_control_changed' | 'operator_control_replayed'
      control: OperatorControlRecord
      readback: OperatorControlReadback
      auditEvent: AuditEventContract
    }
  | {
      kind: 'error'
      code:
        | 'operator_control_csrf_rejected'
        | 'operator_control_admin_denied'
        | 'operator_control_invalid_reason'
        | 'operator_control_missing_evidence'
        | 'operator_control_invalid_expiry'
      retryable: boolean
      reason: string
    }

export const BusinessActionSupportKillRuleValues = [
  'stale_card',
  'disabled_card',
  'revoked_mandate',
  'expired_mandate',
  'wrong_owner',
  'rejected_checkpoint',
  'guardrail_block',
  'guardrail_refusal',
  'unbound_evidence',
  'missing_artifact',
  'proof_gap',
  'no_repair',
  'support_capacity_breach',
] as const
export type BusinessActionSupportKillRule = (typeof BusinessActionSupportKillRuleValues)[number]

export type BusinessActionClaimSafetyInput = {
  cardStatus: 'active' | 'disabled' | 'stale'
  mandateStatus: 'active' | 'expired' | 'revoked'
  mandateExpiresAt: number
  ownerMatches: boolean
  checkpointDecision: 'accepted' | 'refused' | 'clarification_required' | 'proof_gap' | 'expired'
  guardrailDecisions: readonly ('allow' | 'block' | 'refusal')[]
  externalEvidenceBound: boolean
  resultArtifactStatus: 'complete' | 'proof_gap' | undefined
  noRepairMarked: boolean
  supportCapacity: {
    openIncidents: number
    capacityThreshold: number
  }
  now: number
}

export type BusinessActionClaimSafetyDecision = {
  publicDemoClaimsEnabled: boolean
  killRules: readonly BusinessActionSupportKillRule[]
  preserveHistoricalReadbacks: true
  claimDisablePath: 'business_actions_enabled'
  operatorNextAction: string
}

export function evaluateBusinessActionClaimSafety(
  input: BusinessActionClaimSafetyInput
): BusinessActionClaimSafetyDecision {
  const killRules: BusinessActionSupportKillRule[] = []

  if (input.cardStatus === 'stale') {
    killRules.push('stale_card')
  }
  if (input.cardStatus === 'disabled') {
    killRules.push('disabled_card')
  }
  if (input.mandateStatus === 'revoked') {
    killRules.push('revoked_mandate')
  }
  if (input.mandateStatus === 'expired' || input.mandateExpiresAt <= input.now) {
    killRules.push('expired_mandate')
  }
  if (!input.ownerMatches) {
    killRules.push('wrong_owner')
  }
  if (
    input.checkpointDecision === 'refused' ||
    input.checkpointDecision === 'clarification_required' ||
    input.checkpointDecision === 'expired'
  ) {
    killRules.push('rejected_checkpoint')
  }
  if (input.guardrailDecisions.includes('block')) {
    killRules.push('guardrail_block')
  }
  if (input.guardrailDecisions.includes('refusal')) {
    killRules.push('guardrail_refusal')
  }
  if (!input.externalEvidenceBound) {
    killRules.push('unbound_evidence')
  }
  if (input.resultArtifactStatus === undefined) {
    killRules.push('missing_artifact')
  }
  if (input.checkpointDecision === 'proof_gap' || input.resultArtifactStatus === 'proof_gap') {
    killRules.push('proof_gap')
  }
  if (input.noRepairMarked) {
    killRules.push('no_repair')
  }
  if (input.supportCapacity.openIncidents > input.supportCapacity.capacityThreshold) {
    killRules.push('support_capacity_breach')
  }

  return {
    publicDemoClaimsEnabled: killRules.length === 0,
    killRules,
    preserveHistoricalReadbacks: true,
    claimDisablePath: 'business_actions_enabled',
    operatorNextAction: killRules.length === 0 ? 'none' : `disable_public_demo_claims:${killRules.join(',')}`,
  }
}

export type BusinessActionNoRepairReconstructionInput = {
  noRepairMarked: boolean
  auditEventType: AuditEventType
  auditTargetType: AuditTargetType
  requestHash: string
  receiptReconstructionStatus: string
  noRepairHash: string
  evidenceRefs: readonly string[]
  providerEvidenceBefore: readonly string[]
  providerEvidenceAfter: readonly string[]
}

export type BusinessActionNoRepairReconstructionResult =
  | {
      valid: true
      terminal: true
      auditable: true
      reconstructable: true
      providerEvidenceRewritten: false
    }
  | {
      valid: false
      reason:
        | 'no_repair_not_marked'
        | 'missing_audit_event'
        | 'missing_reconstruction_refs'
        | 'provider_evidence_rewritten'
    }

export function validateBusinessActionNoRepairReconstruction(
  input: BusinessActionNoRepairReconstructionInput
): BusinessActionNoRepairReconstructionResult {
  if (!input.noRepairMarked) {
    return { valid: false, reason: 'no_repair_not_marked' }
  }

  if (
    input.auditEventType !== 'business_action.no_repair_marked' ||
    input.auditTargetType !== 'business_action_no_repair'
  ) {
    return { valid: false, reason: 'missing_audit_event' }
  }

  if (
    input.requestHash.trim().length === 0 ||
    input.receiptReconstructionStatus.trim().length === 0 ||
    input.noRepairHash.trim().length === 0 ||
    input.evidenceRefs.length === 0
  ) {
    return { valid: false, reason: 'missing_reconstruction_refs' }
  }

  if (!sameEvidenceSet(input.providerEvidenceBefore, input.providerEvidenceAfter)) {
    return { valid: false, reason: 'provider_evidence_rewritten' }
  }

  return {
    valid: true,
    terminal: true,
    auditable: true,
    reconstructable: true,
    providerEvidenceRewritten: false,
  }
}

function sameEvidenceSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const normalizedLeft = [...left].sort()
  const normalizedRight = [...right].sort()

  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

export type {
  AuditEventInput,
  AuditValidationResult,
  FunnelEventContract,
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
  OwnerActivationReadbackInput,
}

export const markOperationSucceeded = markOperationSucceededImpl

export const reserveOperationKey = reserveOperationKeyImpl

export const validateAuditEvent = validateAuditEventImpl

export const recordInvalidationIntent = recordInvalidationIntentImpl

export const setOperatorControl = setOperatorControlImpl

export const readOperatorControls = readOperatorControlsImpl

export const initialOwnerActivationState = initialOwnerActivationStateImpl

export const applyFunnelEvent = applyFunnelEventImpl

export const buildOwnerActivationReadback = buildOwnerActivationReadbackImpl
