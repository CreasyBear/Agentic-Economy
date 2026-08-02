import type { BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { sameStringList } from '@/modules/common/same-string-list'
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
  ActorKind,
  AuditEventContract,
  AuditEventInput,
  AuditEventType,
  AuditTargetType,
  AuditValidationResult,
  RedactedPayload,
} from './internal/audit'
import type { AdminMembership, CsrfCheckInput } from '@/modules/security/public'
import type {
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
} from './internal/operation-keys'
import type { FunnelEventContract, OwnerActivationReadbackInput } from './internal/funnel'
import {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  JOURNEY_EVENT_NAMES,
  OperationKeyStatusValues,
  OperatorControlKeyValues,
  WAVE_1_JOURNEY_EVENT_NAMES,
  WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
} from './internal/literals'

export {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  JOURNEY_EVENT_NAMES,
  OperationKeyStatusValues,
  OperatorControlKeyValues,
  WAVE_1_JOURNEY_EVENT_NAMES,
  WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
}

export type OperationKeyStatus = (typeof OperationKeyStatusValues)[number]
export type OperatorControlKey = (typeof OperatorControlKeyValues)[number]
export type InvalidationSurface = (typeof InvalidationSurfaceValues)[number]
export type InvalidationIntentStatus = (typeof InvalidationIntentStatusValues)[number]
export type FunnelEventType = (typeof FunnelEventTypeValues)[number]
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

  return sameStringList(normalizedLeft, normalizedRight)
}

export const BusinessActionPrivateEvidenceRetentionClass = 'business_action_private_evidence' as const
export const BusinessActionPrivateEvidenceAccessPolicy = 'owner_admin_operator_only' as const

export const BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues = [
  'raw_prompt',
  'trace',
  'provider_payload',
  'stripe_payload',
  'customer_identifier',
  'private_endpoint_ref',
  'api_key',
  'webhook_secret',
] as const
export type BusinessActionPrivateEvidencePublicProjectionExcludedField =
  (typeof BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues)[number]

export type BusinessActionPrivateEvidencePolicyInput = {
  id: string
  requestRef: string
  retentionClass: string
  accessPolicy: string
  payloadHash: string
  privatePayloadRef: string | undefined
  ttlExpiresAt: number
  redactedAt?: number
  deletedAt?: number
  tombstoneHash?: string
  now: number
  unsafeRawFields: Partial<Record<BusinessActionPrivateEvidencePublicProjectionExcludedField, string>>
}

export type BusinessActionPrivateEvidencePolicyResult =
  | {
      valid: true
      retentionClass: typeof BusinessActionPrivateEvidenceRetentionClass
      accessPolicy: typeof BusinessActionPrivateEvidenceAccessPolicy
      exportBehavior: 'redacted_hash_only'
      deleteBehavior: 'raw_ref_retained_until_ttl' | 'raw_ref_tombstoned'
      publicProjectionAllowed: false
    }
  | {
      valid: false
      reason:
        | 'invalid_retention_class'
        | 'invalid_access_policy'
        | 'missing_payload_hash'
        | 'ttl_not_future'
        | 'invalid_tombstone'
    }

export type BusinessActionPrivateEvidencePublicProjection = {
  id: string
  requestRef: string
  retentionClass: typeof BusinessActionPrivateEvidenceRetentionClass
  accessPolicy: typeof BusinessActionPrivateEvidenceAccessPolicy
  payloadHash: string
  ttlExpiresAt: number
  redactedAt: number | undefined
  tombstoned: boolean
  excludedFields: typeof BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues
}

export function validateBusinessActionPrivateEvidencePolicy(
  input: BusinessActionPrivateEvidencePolicyInput
): BusinessActionPrivateEvidencePolicyResult {
  if (input.retentionClass !== BusinessActionPrivateEvidenceRetentionClass) {
    return { valid: false, reason: 'invalid_retention_class' }
  }

  if (input.accessPolicy !== BusinessActionPrivateEvidenceAccessPolicy) {
    return { valid: false, reason: 'invalid_access_policy' }
  }

  if (input.payloadHash.trim().length === 0) {
    return { valid: false, reason: 'missing_payload_hash' }
  }

  if (input.ttlExpiresAt <= input.now) {
    return { valid: false, reason: 'ttl_not_future' }
  }

  const tombstoned = input.privatePayloadRef === undefined
  if (tombstoned && (input.redactedAt === undefined || input.deletedAt === undefined || input.tombstoneHash === undefined)) {
    return { valid: false, reason: 'invalid_tombstone' }
  }

  return {
    valid: true,
    retentionClass: BusinessActionPrivateEvidenceRetentionClass,
    accessPolicy: BusinessActionPrivateEvidenceAccessPolicy,
    exportBehavior: 'redacted_hash_only',
    deleteBehavior: tombstoned ? 'raw_ref_tombstoned' : 'raw_ref_retained_until_ttl',
    publicProjectionAllowed: false,
  }
}

export function projectBusinessActionPrivateEvidenceForPublic(
  input: BusinessActionPrivateEvidencePolicyInput
): BusinessActionPrivateEvidencePublicProjection {
  return {
    id: input.id,
    requestRef: input.requestRef,
    retentionClass: BusinessActionPrivateEvidenceRetentionClass,
    accessPolicy: BusinessActionPrivateEvidenceAccessPolicy,
    payloadHash: input.payloadHash,
    ttlExpiresAt: input.ttlExpiresAt,
    redactedAt: input.redactedAt,
    tombstoned: input.privatePayloadRef === undefined,
    excludedFields: BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues,
  }
}

export type {
  ActorKind,
  AuditEventContract,
  AuditEventInput,
  AuditEventType,
  AuditTargetType,
  AuditValidationResult,
  RedactedPayload,
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

export {
  recordFunnelEvent,
  type FunnelEventPersistenceRow,
  type RecordFunnelEventInput,
  type RecordFunnelEventResult,
} from './internal/record-funnel-event'
export { parseOwnerActivationStateRow } from './internal/validators'
