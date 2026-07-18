import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import {
  bindInquiryNotificationDispatches as bindInquiryNotificationDispatchesModule,
} from '../src/modules/inquiries/public'
import type {
  InquiryNotificationDispatchBinding,
  InquiryNotificationRecord,
  InquirySourceState,
} from '../src/modules/inquiries/public'
import {
  createEmptyNotificationOutboxSourceState,
  enqueueInquiryNotification as enqueueInquiryNotificationModule,
  NotificationDispatchStatusValues,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationDispatchRecord,
  NotificationDispatchStatus,
  NotificationOutboxSourceState,
  NotificationProviderFamily,
} from '../src/modules/notification-outbox/public'
import type { RedactedPayload } from '../src/modules/observability/public'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import {
  booleanField,
  collect,
  isRecord,
  numberField,
  optionalNumberField,
  optionalStringField,
  stringField,
  upsertByFields,
} from './inquiryRuntimeDbHelpers'

export async function enqueueInquiryNotificationDispatches(
  db: RuntimeDb,
  state: InquirySourceState,
  notification: InquiryNotificationRecord,
  businessId: string,
  correlationId: string,
): Promise<{ state: InquirySourceState; notification: InquiryNotificationRecord }> {
  const now = Date.now()
  let outboxState = await loadNotificationDispatchBindingState(db)
  const bindings: InquiryNotificationDispatchBinding[] = []

  for (const providerFamily of notificationProviderFamilies()) {
    const result = enqueueInquiryNotificationModule(outboxState, {
      businessId: brandNonEmpty(businessId, 'BusinessId'),
      inquiryThreadId: notification.threadId,
      inquiryMessageId: notification.messageId,
      recipientRole: notification.recipientRole,
      providerFamily,
      redactedPayload: {
        notificationId: notification.notificationId,
        threadId: notification.threadId,
        messageId: notification.messageId,
        recipientRole: notification.recipientRole,
        notificationPayloadHash: notification.payloadHash,
      },
      providerIdempotencyKey: `ae:${notification.notificationId}:${providerFamily}`,
      operationKey: brandNonEmpty(`notification:enqueue:${notification.notificationId}:${providerFamily}`, 'OperationKey'),
      correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
      now,
    })

    if (result.kind === 'error') {
      continue
    }

    outboxState = result.state
    bindings.push(dispatchBindingFromDispatch(result.dispatch))
  }

  await persistNotificationDispatchBindingState(db, outboxState)
  const bound = bindInquiryNotificationDispatchesModule(state, {
    notificationId: notification.notificationId,
    dispatchBindings: bindings,
    now,
  })

  return bound.kind === 'ok' ? { state: bound.state, notification: bound.notification } : { state, notification }
}

function notificationProviderFamilies(): readonly NotificationProviderFamily[] {
  return ['novu', 'resend']
}

function dispatchBindingFromDispatch(dispatch: NotificationDispatchRecord): InquiryNotificationDispatchBinding {
  return {
    dispatchId: dispatch.dispatchId,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    payloadHash: dispatch.payloadHash,
    operatorNextAction: notificationOperatorNextAction(dispatch.status),
    updatedAt: dispatch.updatedAt,
  }
}

function notificationOperatorNextAction(
  status: NotificationDispatchStatus,
): InquiryNotificationDispatchBinding['operatorNextAction'] {
  if (status === 'no_repair' || status === 'delivered' || status === 'sent') {
    return 'terminal'
  }
  if (status === 'failed' || status === 'provider_missing' || status === 'orchestrator_missing') {
    return 'retry_available'
  }
  if (status === 'bounced' || status === 'complained' || status === 'delivery_delayed') {
    return 'operator_review_required'
  }
  return 'none'
}

async function loadNotificationDispatchBindingState(db: RuntimeDb): Promise<NotificationOutboxSourceState> {
  const dispatches = await collect(db, 'notificationDispatches')
  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatches.map(toNotificationDispatchRecord),
  })
}

async function persistNotificationDispatchBindingState(
  db: RuntimeDb,
  state: NotificationOutboxSourceState,
): Promise<void> {
  for (const dispatch of state.dispatches) {
    await upsertByFields(db, 'notificationDispatches', ['dispatchId'], {
      dispatchId: dispatch.dispatchId,
      businessId: dispatch.businessId,
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
    })
    await upsertNotificationDispatchReconstruction(db, dispatch)
  }
}

async function upsertNotificationDispatchReconstruction(
  db: RuntimeDb,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  await Promise.all([
    upsertByFields(db, 'operationKeys', ['scope', 'key'], {
      scope: 'notification',
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
      operationName: 'enqueueInquiryNotification',
      key: dispatch.operationKey,
      requestHash: dispatch.payloadHash,
      sourceHash: dispatch.dispatchId,
      status: 'succeeded',
      resultHash: stableHash({ code: 'notification_queued', dispatchId: dispatch.dispatchId }),
      effectRefs: [
        'result:notification_queued',
        `dispatch:${dispatch.dispatchId}`,
        `inquiryThread:${dispatch.inquiryThreadId}`,
        `inquiryMessage:${dispatch.inquiryMessageId}`,
      ],
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
    }),
    upsertNotificationAuditEvent(db, {
      eventType: 'notification.queued',
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
      targetRef: dispatch.dispatchId,
      businessId: dispatch.businessId,
      operationKey: dispatch.operationKey,
      correlationId: dispatch.correlationId,
      beforeState: 'none',
      afterState: dispatch.status,
      redactedPayload: {
        dispatchId: dispatch.dispatchId,
        providerFamily: dispatch.providerFamily,
        inquiryThreadId: dispatch.inquiryThreadId,
        inquiryMessageId: dispatch.inquiryMessageId,
        payloadHash: dispatch.payloadHash,
      },
      createdAt: dispatch.createdAt,
    }),
    upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
      eventType: 'notification_queued',
      source: 'notification-outbox',
      stage: 'published',
      pseudonymousSessionId: `notification:${dispatch.recipientRole}`,
      businessId: dispatch.businessId,
      redactedPayloadJson: JSON.stringify({
        dispatchId: dispatch.dispatchId,
        providerFamily: dispatch.providerFamily,
        status: dispatch.status,
      }),
      consentFlag: true,
      correlationId: dispatch.correlationId,
      createdAt: dispatch.createdAt,
    }),
  ])
}

async function upsertNotificationAuditEvent(
  db: RuntimeDb,
  input: {
    eventType: string
    actorKind: 'anonymous' | 'owner' | 'admin' | 'system'
    actorRef: string
    targetRef: string
    businessId?: string
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    redactedPayload: RedactedPayload
    createdAt: number
  },
): Promise<void> {
  const payloadHash = stableHash(input.redactedPayload)
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId: `audit:${stableHash({
      eventType: input.eventType,
      operationKey: input.operationKey,
      targetRef: input.targetRef,
    })}`,
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    targetType: 'notification',
    targetRef: input.targetRef,
    beforeState: input.beforeState,
    afterState: input.afterState,
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(input.redactedPayload),
    payloadHash,
    createdAt: input.createdAt,
  })
}

function toNotificationDispatchRecord(row: RuntimeDocument): NotificationDispatchRecord {
  return {
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    inquiryThreadId: stringField(row, 'inquiryThreadId'),
    inquiryMessageId: stringField(row, 'inquiryMessageId'),
    recipientRole: recipientRole(row),
    providerFamily: notificationProviderFamily(row),
    status: notificationDispatchStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    redactedPayload: parseJson(stringField(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    ...(optionalStringField(row, 'resendMessageId') === undefined ? {} : { resendMessageId: stringField(row, 'resendMessageId') }),
    ...(optionalStringField(row, 'novuTransactionId') === undefined ? {} : { novuTransactionId: stringField(row, 'novuTransactionId') }),
    ...(optionalStringField(row, 'novuWorkflowId') === undefined ? {} : { novuWorkflowId: stringField(row, 'novuWorkflowId') }),
    ...(optionalStringField(row, 'novuMessageId') === undefined ? {} : { novuMessageId: stringField(row, 'novuMessageId') }),
    ...(optionalStringField(row, 'novuSubscriberId') === undefined ? {} : { novuSubscriberId: stringField(row, 'novuSubscriberId') }),
    providerMissing: booleanField(row, 'providerMissing'),
    orchestratorMissing: booleanField(row, 'orchestratorMissing'),
    retryCount: numberField(row, 'retryCount'),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    ...(optionalStringField(row, 'lastRedactedError') === undefined ? {} : { lastRedactedError: stringField(row, 'lastRedactedError') }),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function recipientRole(row: RuntimeDocument) {
  return stringField(row, 'recipientRole') === 'customer' ? 'customer' : 'owner'
}

function notificationProviderFamily(row: RuntimeDocument): NotificationProviderFamily {
  return stringField(row, 'providerFamily') === 'novu' ? 'novu' : 'resend'
}

function notificationDispatchStatus(row: RuntimeDocument): NotificationDispatchStatus {
  const value = stringField(row, 'status')
  return NotificationDispatchStatusValues.find((candidate) => candidate === value) ?? 'queued'
}

function parseJson(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRedactedPayload(value: unknown): value is RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRedactedPayload)
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
}
