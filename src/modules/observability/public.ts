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

export { callFundingValue, classifyCallFunding, emptyMarketplaceFunding, marketplaceFundingValue } from './marketplace-metrics'
export type { CallFunding, MarketplaceFunding } from './marketplace-metrics'

export {
  payloadHash,
  redactPayload,
} from './internal/redaction'

export {
  AuditEventTypeSchema,
  AuditTargetTypeSchema,
  FunnelEventTypeSchema,
} from './internal/validators'

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

export type { InvalidationIntent, OperationKeyRecord } from './internal/contracts'

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
