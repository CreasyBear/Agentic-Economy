import type { BusinessId, OperationKey, SourceHash } from '@/modules/common/ids'
import type { VisibilityTargetType } from '@/modules/business/public'
import {
  markOperationSucceeded as markOperationSucceededImpl,
  reserveOperationKey as reserveOperationKeyImpl,
} from './internal/operation-keys'
import { recordInvalidationIntent as recordInvalidationIntentImpl } from './internal/outbox'
import { validateAuditEvent as validateStoredAuditEvent } from './internal/audit'
import type {
  ActorKind,
  AuditEventContract as StoredAuditEventContract,
  RedactedPayload,
} from './internal/audit'
import type {
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
} from './internal/operation-keys'
import {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  OperationKeyStatusValues,
} from './internal/literals'
import type {
  CurrentAuditEventType,
  CurrentAuditTargetType,
} from './internal/literals'

export {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  OperationKeyStatusValues,
}

export type OperationKeyStatus = (typeof OperationKeyStatusValues)[number]
export type InvalidationSurface = (typeof InvalidationSurfaceValues)[number]
export type InvalidationIntentStatus = (typeof InvalidationIntentStatusValues)[number]
export type FunnelEventType = (typeof FunnelEventTypeValues)[number]
export type ActivationStage = (typeof ActivationStageValues)[number]
export type AuditEventType = CurrentAuditEventType
export type AuditTargetType = CurrentAuditTargetType
export type AuditEventContract = Omit<StoredAuditEventContract, 'eventType' | 'targetType'> & {
  eventType: AuditEventType
  targetType: AuditTargetType
}
export type AuditEventInput = Omit<AuditEventContract, 'evidenceRefs'> & {
  evidenceRefs?: readonly string[]
}
export type AuditValidationResult =
  | { valid: true; event: AuditEventContract }
  | {
      valid: false
      reason:
        | 'retired_compatibility_event'
        | 'missing_identity'
        | 'missing_payload_hash'
        | 'missing_state_transition'
    }

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

export type {
  ActorKind,
  AuditEventContract,
  AuditEventInput,
  AuditEventType,
  AuditTargetType,
  AuditValidationResult,
  RedactedPayload,
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
}

export const markOperationSucceeded = markOperationSucceededImpl

export const reserveOperationKey = reserveOperationKeyImpl

export function validateAuditEvent(input: AuditEventInput): AuditValidationResult {
  if (
    !AuditEventTypeValues.includes(input.eventType) ||
    !AuditTargetTypeValues.includes(input.targetType)
  ) {
    return { valid: false, reason: 'retired_compatibility_event' }
  }
  return validateStoredAuditEvent(input) as AuditValidationResult
}

export const recordInvalidationIntent = recordInvalidationIntentImpl
