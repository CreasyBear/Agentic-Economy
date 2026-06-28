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
