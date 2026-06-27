import type { AuditEventId, BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import {
  markOperationSucceeded as markOperationSucceededImpl,
  reserveOperationKey as reserveOperationKeyImpl,
} from './internal/operation-keys'
import { validateAuditEvent as validateAuditEventImpl } from './internal/audit'
import type {
  AuditEventInput,
  AuditValidationResult,
} from './internal/audit'
import type {
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
} from './internal/operation-keys'

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
] as const
export type AuditEventType = (typeof AuditEventTypeValues)[number]

export const OperatorControlKeyValues = [
  'claims_enabled',
  'publish_enabled',
  'registry_enabled',
  'discovery_enabled',
  'public_copy_safe_mode',
] as const
export type OperatorControlKey = (typeof OperatorControlKeyValues)[number]

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
  lastEventAt: number
}

export type {
  AuditEventInput,
  AuditValidationResult,
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
}

export const markOperationSucceeded = markOperationSucceededImpl

export const reserveOperationKey = reserveOperationKeyImpl

export const validateAuditEvent = validateAuditEventImpl
