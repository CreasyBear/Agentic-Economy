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

type NotificationDispatchRow = Omit<Doc<'notificationDispatches'>, '_id' | '_creationTime'>

type NotificationDispatchAttemptRow = Omit<Doc<'notificationDispatchAttempts'>, '_id' | '_creationTime'>

type NotificationWebhookEventRow = Omit<Doc<'notificationWebhookEvents'>, '_id' | '_creationTime'>

export function toDispatchRecord(row: Doc<'notificationDispatches'>): NotificationDispatchRecord {
  return {
    dispatchId: brandNonEmpty(row.dispatchId, 'NotificationDispatchId'),
    businessId: brandNonEmpty(row.businessId, 'BusinessId'),
    inquiryThreadId: row.inquiryThreadId,
    inquiryMessageId: row.inquiryMessageId,
    recipientRole: row.recipientRole,
    providerFamily: row.providerFamily,
    status: row.status,
    providerIdempotencyKey: row.providerIdempotencyKey,
    redactedPayload: parseRedactedPayload(row.redactedPayloadJson),
    payloadHash: brandNonEmpty(row.payloadHash, 'SourceHash'),
    ...(row.resendMessageId === undefined ? {} : { resendMessageId: row.resendMessageId }),
    ...(row.novuTransactionId === undefined ? {} : { novuTransactionId: row.novuTransactionId }),
    ...(row.novuWorkflowId === undefined ? {} : { novuWorkflowId: row.novuWorkflowId }),
    ...(row.novuMessageId === undefined ? {} : { novuMessageId: row.novuMessageId }),
    ...(row.novuSubscriberId === undefined ? {} : { novuSubscriberId: row.novuSubscriberId }),
    providerMissing: row.providerMissing,
    orchestratorMissing: row.orchestratorMissing,
    retryCount: row.retryCount,
    ...(row.retryAfter === undefined ? {} : { retryAfter: row.retryAfter }),
    ...(row.lastRedactedError === undefined ? {} : { lastRedactedError: row.lastRedactedError }),
    operationKey: brandNonEmpty(row.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function persistNotificationDispatch(
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  const row = notificationDispatchRow(db, dispatch)
  const existing = await db
    .query('notificationDispatches')
    .withIndex('by_dispatchId', (query) => query.eq('dispatchId', dispatch.dispatchId))
    .unique()
  if (existing === null) {
    await db.insert('notificationDispatches', row)
    return
  }
  await db.patch(existing._id, row)
}

export async function persistNotificationDispatchAttempt(
  db: GenericDatabaseWriter<DataModel>,
  attempt: NotificationDispatchAttemptRecord,
): Promise<void> {
  const row = notificationDispatchAttemptRow(attempt)
  const existing = await db
    .query('notificationDispatchAttempts')
    .withIndex('by_attemptId', (query) => query.eq('attemptId', attempt.attemptId))
    .unique()
  if (existing === null) {
    await db.insert('notificationDispatchAttempts', row)
    return
  }
  await db.patch(existing._id, row)
}

export async function persistNotificationWebhookEvent(
  db: GenericDatabaseWriter<DataModel>,
  webhookEvent: NotificationWebhookEventRecord,
): Promise<void> {
  const row = notificationWebhookEventRow(webhookEvent)
  const existing = await db
    .query('notificationWebhookEvents')
    .withIndex('by_webhookEventId', (query) => query.eq('webhookEventId', webhookEvent.webhookEventId))
    .unique()
  if (existing === null) {
    await db.insert('notificationWebhookEvents', row)
    return
  }
  await db.patch(existing._id, row)
}

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
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  const eventId = `audit:${canonicalDigest({
    eventType: 'notification.queued',
    operationKey: dispatch.operationKey,
    targetRef: dispatch.dispatchId,
  })}`
  const businessId = businessIdFromValue(db, dispatch.businessId)
  const row: Omit<Doc<'auditEvents'>, '_id' | '_creationTime'> = {
    eventId,
    eventType: 'notification.queued',
    actorKind: 'system',
    actorRef: 'system:notification-outbox',
    businessId,
    targetType: 'notification',
    targetRef: dispatch.dispatchId,
    beforeState: 'none',
    afterState: dispatch.status,
    idempotencyKey: dispatch.operationKey,
    correlationId: dispatch.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify({
      dispatchId: dispatch.dispatchId,
      providerFamily: dispatch.providerFamily,
      inquiryThreadId: dispatch.inquiryThreadId,
      inquiryMessageId: dispatch.inquiryMessageId,
      payloadHash: dispatch.payloadHash,
    }),
    payloadHash: canonicalDigest({
      dispatchId: dispatch.dispatchId,
      providerFamily: dispatch.providerFamily,
      inquiryThreadId: dispatch.inquiryThreadId,
      inquiryMessageId: dispatch.inquiryMessageId,
      payloadHash: dispatch.payloadHash,
    }),
    createdAt: dispatch.createdAt,
  }
  const existing = await db
    .query('auditEvents')
    .withIndex('by_eventId', (query) => query.eq('eventId', eventId))
    .unique()
  if (existing === null) {
    await db.insert('auditEvents', row)
    return
  }
  await db.patch(existing._id, row)
}
async function persistNotificationQueuedFunnelEvent(
  db: GenericDatabaseWriter<DataModel>,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  const businessId = businessIdFromValue(db, dispatch.businessId)
  const row: Omit<Doc<'funnelEvents'>, '_id' | '_creationTime'> = {
    eventType: 'notification_queued',
    source: 'notification-outbox',
    stage: 'published',
    pseudonymousSessionId: `notification:${dispatch.recipientRole}`,
    businessId,
    redactedPayloadJson: JSON.stringify({
      dispatchId: dispatch.dispatchId,
      providerFamily: dispatch.providerFamily,
      status: dispatch.status,
    }),
    consentFlag: true,
    correlationId: dispatch.correlationId,
    createdAt: dispatch.createdAt,
  }
  const existing = await db
    .query('funnelEvents')
    .withIndex('by_eventType_business_correlation_createdAt', (builder) =>
      builder
        .eq('eventType', 'notification_queued')
        .eq('businessId', businessId)
        .eq('correlationId', dispatch.correlationId)
        .eq('createdAt', dispatch.createdAt)
    )
    .first()
  if (existing === null) {
    await db.insert('funnelEvents', row)
    return
  }
  await db.patch(existing._id, row)
}
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
