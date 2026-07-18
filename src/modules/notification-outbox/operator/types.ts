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
  code: string
  webhookEvent: ReturnType<typeof serializeWebhookEvent>
  dispatch?: ReturnType<typeof serializeDispatch>
}>

export type OperatorOkDispatchResult = Readonly<{
  kind: 'ok'
  code: string
  dispatch: ReturnType<typeof serializeDispatch>
}>

export type OperatorErrorResult = Readonly<{
  kind: 'error'
  code: string
  retryable: boolean
  reason: string
}>

export type IngestWebhookResult = OperatorOkWebhookResult | OperatorErrorResult
export type RetryDispatchResult = OperatorOkDispatchResult | OperatorErrorResult
export type MarkNoRepairResult = OperatorOkDispatchResult | OperatorErrorResult
