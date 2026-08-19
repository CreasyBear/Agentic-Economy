import type { GenericDatabaseWriter } from 'convex/server'

import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { parseRedactedPayload } from '../src/modules/notification-outbox/operator/parse-payload'
import type {
  NotificationDispatchAttemptRecord,
  NotificationDispatchRecord,
  NotificationWebhookEventRecord,
} from '../src/modules/notification-outbox/public'
import type { DataModel, Doc, Id } from './_generated/dataModel'

type NotificationDispatchRow = Omit<Record<string, unknown>, '_id' | '_creationTime'>

type NotificationDispatchAttemptRow = Omit<Record<string, unknown>, '_id' | '_creationTime'>

type NotificationWebhookEventRow = Omit<Record<string, unknown>, '_id' | '_creationTime'>

export async function persistNotificationDispatch(
  _db: GenericDatabaseWriter<DataModel>,
  _dispatch: NotificationDispatchRecord,
): Promise<void> { return }


export async function persistNotificationDispatchAttempt(
  _db: GenericDatabaseWriter<DataModel>,
  _attempt: NotificationDispatchAttemptRecord,
): Promise<void> { return }


export async function persistNotificationWebhookEvent(
  _db: GenericDatabaseWriter<DataModel>,
  _webhookEvent: NotificationWebhookEventRecord,
): Promise<void> { return }


/** Enqueue-path reconstruction used by the inquiry notification bridge. */
export async function persistNotificationDispatchEnqueueReconstruction(
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  await Promise.all([
    persistNotificationOperationKey(db, dispatch),
    persistNotificationQueuedAuditEvent(db, dispatch),
    persistNotificationQueuedFunnelEvent(db, dispatch),
  ])
}

async function persistNotificationOperationKey(
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  const row: Omit<Doc<'operationKeys'>, '_id' | '_creationTime'> = {
    scope: 'notification',
    actorKind: 'system',
    actorRef: 'system:notification-outbox',
    operationName: 'enqueueInquiryNotification',
    key: dispatch.operationKey,
    requestHash: dispatch.payloadHash,
    sourceHash: dispatch.dispatchId,
    status: 'succeeded',
    resultHash: canonicalDigest({ code: 'notification_queued', dispatchId: dispatch.dispatchId }),
    effectRefs: [
      'result:notification_queued',
      `dispatch:${dispatch.dispatchId}`,
      `inquiryThread:${dispatch.inquiryThreadId}`,
      `inquiryMessage:${dispatch.inquiryMessageId}`,
    ],
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
  }
  const existing = await db
    .query('operationKeys')
    .withIndex('by_scope_key', (query) => query.eq('scope', 'notification').eq('key', dispatch.operationKey))
    .unique()
  if (existing === null) {
    await db.insert('operationKeys', row)
    return
  }
  await db.patch(existing._id, row)
}

async function persistNotificationQueuedAuditEvent(
  _db: GenericDatabaseWriter<DataModel>,
  _dispatch: NotificationDispatchRecord,
): Promise<void> { return }

async function persistNotificationQueuedFunnelEvent(
  _db: GenericDatabaseWriter<DataModel>,
  _dispatch: NotificationDispatchRecord,
): Promise<void> { return }

function notificationDispatchRow(
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): NotificationDispatchRow {
  return {
    dispatchId: dispatch.dispatchId,
    businessId: businessIdFromValue(db, dispatch.businessId),
    inquiryThreadId: dispatch.inquiryThreadId,
    inquiryMessageId: dispatch.inquiryMessageId,
    recipientRole: dispatch.recipientRole,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    redactedPayloadJson: JSON.stringify(dispatch.redactedPayload),
    payloadHash: dispatch.payloadHash,
    ...(dispatch.resendMessageId === undefined ? {} : { resendMessageId: dispatch.resendMessageId }),
    ...(dispatch.novuTransactionId === undefined ? {} : { novuTransactionId: dispatch.novuTransactionId }),
    ...(dispatch.novuWorkflowId === undefined ? {} : { novuWorkflowId: dispatch.novuWorkflowId }),
    ...(dispatch.novuMessageId === undefined ? {} : { novuMessageId: dispatch.novuMessageId }),
    ...(dispatch.novuSubscriberId === undefined ? {} : { novuSubscriberId: dispatch.novuSubscriberId }),
    providerMissing: dispatch.providerMissing,
    orchestratorMissing: dispatch.orchestratorMissing,
    retryCount: dispatch.retryCount,
    ...(dispatch.retryAfter === undefined ? {} : { retryAfter: dispatch.retryAfter }),
    ...(dispatch.lastRedactedError === undefined ? {} : { lastRedactedError: dispatch.lastRedactedError }),
    operationKey: dispatch.operationKey,
    correlationId: dispatch.correlationId,
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
  }
}

function notificationDispatchAttemptRow(attempt: NotificationDispatchAttemptRecord): NotificationDispatchAttemptRow {
  return {
    attemptId: attempt.attemptId,
    dispatchId: attempt.dispatchId,
    providerFamily: attempt.providerFamily,
    status: attempt.status,
    providerIdempotencyKey: attempt.providerIdempotencyKey,
    requestPayloadHash: attempt.requestPayloadHash,
    redactedRequestPayloadJson: JSON.stringify(attempt.redactedRequestPayload),
    ...(attempt.providerResponseHash === undefined ? {} : { providerResponseHash: attempt.providerResponseHash }),
    ...(attempt.redactedError === undefined ? {} : { redactedError: attempt.redactedError }),
    ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }),
    startedAt: attempt.startedAt,
    ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
  }
}

function notificationWebhookEventRow(webhookEvent: NotificationWebhookEventRecord): NotificationWebhookEventRow {
  return {
    webhookEventId: webhookEvent.webhookEventId,
    providerFamily: webhookEvent.providerFamily,
    providerEventId: webhookEvent.providerEventId,
    logicalObjectKey: webhookEvent.logicalObjectKey,
    ...(webhookEvent.dispatchId === undefined ? {} : { dispatchId: webhookEvent.dispatchId }),
    status: webhookEvent.status,
    eventType: webhookEvent.eventType,
    signatureStatus: webhookEvent.signatureStatus,
    payloadHash: webhookEvent.payloadHash,
    redactedPayloadJson: JSON.stringify(webhookEvent.redactedPayload),
    ...(webhookEvent.reason === undefined ? {} : { reason: webhookEvent.reason }),
    operationKey: webhookEvent.operationKey,
    correlationId: webhookEvent.correlationId,
    receivedAt: webhookEvent.receivedAt,
  }
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
