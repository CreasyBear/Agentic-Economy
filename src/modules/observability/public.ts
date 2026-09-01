import type { BusinessId, OperationKey, SourceHash } from '@/modules/common/ids'
import type { VisibilityTargetType } from '@/modules/business/public'
import {
  markOperationSucceeded as markOperationSucceededImpl,
  reserveOperationKey as reserveOperationKeyImpl,
} from './internal/operation-keys'
import { recordInvalidationIntent as recordInvalidationIntentImpl } from './internal/outbox'
import {
  createPackage3AuditEvent as createPackage3AuditEventImpl,
  validateAuditEvent as validateStoredAuditEvent,
} from './internal/audit'
import type {
  ActorKind,
  AuditSourceSystem,
  AuditEventContract,
  AuditEventInput,
  AuditEventType,
  AuditTargetType,
  AuditValidationResult,
  Package3AuditEventInput,
  Package3AuditEventType,
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
  AuditSourceSystemValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  OperationKeyStatusValues,
  Package3AuditEventTypeValues,
} from './internal/literals'

export {
  ActivationStageValues,
  ActorKindValues,
  AuditSourceSystemValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  InvalidationIntentStatusValues,
  InvalidationSurfaceValues,
  OperationKeyStatusValues,
  Package3AuditEventTypeValues,
}

export type OperationKeyStatus = (typeof OperationKeyStatusValues)[number]
export type InvalidationSurface = (typeof InvalidationSurfaceValues)[number]
export type InvalidationIntentStatus = (typeof InvalidationIntentStatusValues)[number]
export type FunnelEventType = (typeof FunnelEventTypeValues)[number]
export type ActivationStage = (typeof ActivationStageValues)[number]
export type CurrentAuditValidationResult = AuditValidationResult

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
  AuditSourceSystem,
  AuditEventContract,
  AuditEventInput,
  AuditEventType,
  AuditTargetType,
  AuditValidationResult,
  Package3AuditEventInput,
  Package3AuditEventType,
  RedactedPayload,
  OperationKeyAuditSink,
  OperationKeyDecision,
  OperationKeyInput,
  OperationKeyStore,
}

export const markOperationSucceeded = markOperationSucceededImpl

export const reserveOperationKey = reserveOperationKeyImpl

export const validateAuditEvent = validateStoredAuditEvent

export const createPackage3AuditEvent = createPackage3AuditEventImpl

export const recordInvalidationIntent = recordInvalidationIntentImpl
