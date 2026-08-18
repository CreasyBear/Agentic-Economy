import type { GenericDatabaseWriter } from 'convex/server'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type {
  AuditEventType,
  AuditTargetType,
  RedactedPayload,
} from '../src/modules/observability/public'
import type {
  NotificationDispatchAttemptRecord,
  NotificationDispatchRecord,
  NotificationWebhookEventRecord,
} from '../src/modules/notification-outbox/public'
import type { DataModel, Doc, Id } from './_generated/dataModel'

type NotificationReconstructionInput = Readonly<{
  code: string
  dispatch?: NotificationDispatchRecord
  attempt?: NotificationDispatchAttemptRecord
  webhookEvent?: NotificationWebhookEventRecord
  operationKey: string
  correlationId: string
  actorKind: 'admin' | 'system'
  actorRef: string
}>

export async function recordNotificationOperationReconstruction(
  db: GenericDatabaseWriter<DataModel>,
  input: NotificationReconstructionInput,
): Promise<void> {
  const targetRef = input.webhookEvent?.webhookEventId ?? input.dispatch?.dispatchId ?? 'notification:unknown'
  const businessId = input.dispatch === undefined
    ? undefined
    : businessIdFromValue(db, input.dispatch.businessId)
  const requestHash = canonicalDigest({
    code: input.code,
    ...(input.dispatch === undefined ? {} : { dispatchId: input.dispatch.dispatchId }),
    ...(input.attempt === undefined ? {} : { attemptId: input.attempt.attemptId }),
    ...(input.webhookEvent === undefined ? {} : { webhookEventId: input.webhookEvent.webhookEventId }),
  })
  const effectRefs = [
    `result:${input.code}`,
    input.dispatch === undefined ? undefined : `dispatch:${input.dispatch.dispatchId}`,
    input.dispatch === undefined ? undefined : `inquiryThread:${input.dispatch.inquiryThreadId}`,
    input.dispatch === undefined ? undefined : `inquiryMessage:${input.dispatch.inquiryMessageId}`,
    input.attempt === undefined ? undefined : `attempt:${input.attempt.attemptId}`,
    input.webhookEvent === undefined ? undefined : `webhook:${input.webhookEvent.webhookEventId}`,
  ].filter((value): value is string => typeof value === 'string')

  const operationKeyRow: Omit<Doc<'operationKeys'>, '_id' | '_creationTime'> = {
    scope: 'notification',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    operationName: notificationOperationName(input.code),
    key: input.operationKey,
    requestHash,
    sourceHash: targetRef,
    status: 'succeeded',
    resultHash: canonicalDigest({ code: input.code, targetRef }),
    effectRefs,
    createdAt: notificationReconstructionTime(input),
    updatedAt: notificationReconstructionTime(input),
  }
  const existingOperationKey = await db
    .query('operationKeys')
    .withIndex('by_scope_key', (query) => query.eq('scope', 'notification').eq('key', input.operationKey))
    .unique()
  if (existingOperationKey === null) {
    await db.insert('operationKeys', operationKeyRow)
  } else {
    await db.patch(existingOperationKey._id, operationKeyRow)
  }

  const reasonCode = notificationReasonCode(input)

  await persistNotificationAuditEvent(db, {
    eventType: notificationAuditEventType(input),
    targetType: input.webhookEvent === undefined ? 'notification' : 'notification_provider_event',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetRef,
    ...(businessId === undefined ? {} : { businessId }),
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: notificationBeforeState(input),
    afterState: notificationAfterState(input),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    redactedPayload: notificationReconstructionPayload(input),
    createdAt: notificationReconstructionTime(input),
  })

  await persistNotificationFunnelEvent(db, input)
}


async function persistNotificationAuditEvent(
  db: GenericDatabaseWriter<DataModel>,
  input: {
    eventType: AuditEventType
    targetType: Extract<AuditTargetType, 'notification' | 'notification_provider_event'>
    actorKind: 'admin' | 'system'
    actorRef: string
    targetRef: string
    businessId?: Id<'businesses'>
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    reasonCode?: string
    redactedPayload: RedactedPayload
    createdAt: number
  },
): Promise<void> {
  return
}
async function persistNotificationFunnelEvent(
  _db: GenericDatabaseWriter<DataModel>,
  _input: NotificationReconstructionInput,
): Promise<void> {
  return
}


function notificationOperationName(code: string): string {
  if (code === 'notification_queued' || code === 'notification_enqueue_replayed') {
    return 'enqueueInquiryNotification'
  }
  if (code.startsWith('notification_webhook_')) {
    return 'ingestNotificationWebhook'
  }
  if (code === 'notification_retry_scheduled') {
    return 'retryNotificationDispatch'
  }
  if (code === 'notification_no_repair_marked') {
    return 'markNotificationNoRepair'
  }
  return 'dispatchNotificationOutbox'
}

function notificationAuditEventType(input: NotificationReconstructionInput): AuditEventType {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'notification.queued'
  if (input.code === 'notification_sent') return 'notification.sent'
  if (input.code === 'notification_provider_missing' || input.code === 'notification_orchestrator_missing') return 'notification.failed'
  if (input.code === 'notification_dispatch_failed') return 'notification.failed'
  if (input.code === 'notification_retry_scheduled') return 'notification.retry_scheduled'
  if (input.code === 'notification_no_repair_marked') return 'notification.no_repair_marked'
  if (input.code === 'notification_webhook_duplicate') return 'notification.webhook_duplicate'
  if (input.code === 'notification_webhook_rejected') return 'notification.webhook_rejected'
  if (input.code === 'notification_webhook_held') return 'notification.webhook_held'
  if (input.code === 'notification_webhook_received') return 'notification.webhook_received'
  return 'notification.triggered'
}

function notificationBeforeState(input: NotificationReconstructionInput): string {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'none'
  if (input.webhookEvent !== undefined) return 'provider_event_received'
  return 'queued'
}

function notificationAfterState(input: NotificationReconstructionInput): string {
  if (input.webhookEvent !== undefined) return input.webhookEvent.status
  return input.dispatch?.status ?? input.code
}

function notificationReasonCode(input: NotificationReconstructionInput): string | undefined {
  return input.webhookEvent?.reason ?? input.dispatch?.lastRedactedError ?? input.attempt?.redactedError
}

function notificationReconstructionPayload(input: NotificationReconstructionInput): RedactedPayload {
  return {
    code: input.code,
    ...(input.dispatch === undefined
      ? {}
      : {
          dispatchId: input.dispatch.dispatchId,
          providerFamily: input.dispatch.providerFamily,
          status: input.dispatch.status,
          payloadHash: input.dispatch.payloadHash,
          inquiryThreadId: input.dispatch.inquiryThreadId,
          inquiryMessageId: input.dispatch.inquiryMessageId,
        }),
    ...(input.attempt === undefined
      ? {}
      : {
          attemptId: input.attempt.attemptId,
          attemptStatus: input.attempt.status,
          requestPayloadHash: input.attempt.requestPayloadHash,
        }),
    ...(input.webhookEvent === undefined
      ? {}
      : {
          webhookEventId: input.webhookEvent.webhookEventId,
          providerEventId: input.webhookEvent.providerEventId,
          logicalObjectKey: input.webhookEvent.logicalObjectKey,
          status: input.webhookEvent.status,
          signatureStatus: input.webhookEvent.signatureStatus,
          payloadHash: input.webhookEvent.payloadHash,
        }),
  }
}

function notificationReconstructionTime(input: NotificationReconstructionInput): number {
  return input.webhookEvent?.receivedAt
    ?? input.attempt?.completedAt
    ?? input.attempt?.startedAt
    ?? input.dispatch?.updatedAt
    ?? Date.now()
}

function notificationFunnelEventType(
  input: NotificationReconstructionInput,
): 'notification_queued' | 'notification_delivered' | 'notification_failed' | undefined {
  if (input.code === 'notification_queued') {
    return 'notification_queued'
  }
  const status = input.dispatch?.status
  if (status === 'delivered' || status === 'sent') {
    return 'notification_delivered'
  }
  if (
    status === 'failed'
    || status === 'provider_missing'
    || status === 'orchestrator_missing'
    || status === 'bounced'
    || status === 'complained'
    || status === 'suppressed'
  ) {
    return 'notification_failed'
  }
  return undefined
}

function businessIdFromValue(
  db: GenericDatabaseWriter<DataModel>,
  value: string,
): Id<'businesses'> {
  const id = db.normalizeId('businesses', value)
  if (id === null) {
    throw new Error('invalid_business_id')
  }
  return id
}

