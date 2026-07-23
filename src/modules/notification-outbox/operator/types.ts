import type {
  IngestNotificationWebhookResult,
  MarkNotificationNoRepairResult,
  NotificationOutboxErrorCode,
  RetryNotificationDispatchResult,
} from '../internal/commands'
import type {
  NotificationProviderFamily,
  NotificationSignatureStatus,
} from '../internal/schema'
import {
  serializeDispatch,
  serializeWebhookEvent,
} from './serialize'

export type IngestWebhookArgs = Readonly<{
  providerFamily: NotificationProviderFamily
  providerEventId: string
  logicalObjectKey: string
  eventType: string
  signatureStatus: NotificationSignatureStatus
  payloadHash: string
  redactedPayloadJson: string
  dispatchId?: string
  operationKey: string
  correlationId: string
}>

export type RetryDispatchArgs = Readonly<{
  dispatchId: string
  retryAfter: number
  operationKey: string
  correlationId: string
}>

export type MarkNoRepairArgs = Readonly<{
  dispatchId: string
  reason: string
  operationKey: string
  correlationId: string
}>

export type OperatorOkWebhookResult = Readonly<{
  kind: 'ok'
  code: Extract<IngestNotificationWebhookResult, { kind: 'ok' }>['code']
  webhookEvent: ReturnType<typeof serializeWebhookEvent>
  dispatch?: ReturnType<typeof serializeDispatch>
}>

export type OperatorOkDispatchResult<Code extends string> = Readonly<{
  kind: 'ok'
  code: Code
  dispatch: ReturnType<typeof serializeDispatch>
}>

export type OperatorErrorResult = Readonly<{
  kind: 'error'
  code: NotificationOutboxErrorCode
  retryable: boolean
  reason: string
}>

export type IngestWebhookResult = OperatorOkWebhookResult | OperatorErrorResult
export type RetryDispatchResult =
  | OperatorOkDispatchResult<Extract<RetryNotificationDispatchResult, { kind: 'ok' }>['code']>
  | OperatorErrorResult
export type MarkNoRepairResult =
  | OperatorOkDispatchResult<Extract<MarkNotificationNoRepairResult, { kind: 'ok' }>['code']>
  | OperatorErrorResult
