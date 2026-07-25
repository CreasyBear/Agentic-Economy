import type { NotificationOutboxErrorCode } from '../internal/commands'
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
  code:
    | 'notification_webhook_received'
    | 'notification_webhook_duplicate'
    | 'notification_webhook_rejected'
    | 'notification_webhook_held'
  webhookEvent: ReturnType<typeof serializeWebhookEvent>
  dispatch?: ReturnType<typeof serializeDispatch>
}>

export type OperatorOkDispatchResult = Readonly<{
  kind: 'ok'
  code: 'notification_retry_scheduled' | 'notification_no_repair_marked'
  dispatch: ReturnType<typeof serializeDispatch>
}>

export type OperatorErrorResult = Readonly<{
  kind: 'error'
  code: NotificationOutboxErrorCode
  retryable: boolean
  reason: string
}>

export type IngestWebhookResult = OperatorOkWebhookResult | OperatorErrorResult
export type RetryDispatchResult = OperatorOkDispatchResult | OperatorErrorResult
export type MarkNoRepairResult = OperatorOkDispatchResult | OperatorErrorResult
