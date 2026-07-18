import { brandNonEmpty } from '../src/modules/common/ids'
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
} from '../src/modules/notification-outbox/public'
import type {
  NotificationDispatchRecord,
  NotificationDispatchStatus,
  NotificationOutboxSourceState,
  NotificationProviderFamily,
} from '../src/modules/notification-outbox/public'
import type { RuntimeDb } from './source_state'
import { collect } from './inquiryRuntimeDbHelpers'
import {
  toDispatchRecord,
  upsertNotificationDispatch,
  upsertNotificationDispatchEnqueueReconstruction,
} from './notificationOutboxPersistence'

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
    dispatches: dispatches.map(toDispatchRecord),
  })
}

async function persistNotificationDispatchBindingState(
  db: RuntimeDb,
  state: NotificationOutboxSourceState,
): Promise<void> {
  for (const dispatch of state.dispatches) {
    await upsertNotificationDispatch(db, dispatch)
    await upsertNotificationDispatchEnqueueReconstruction(db, dispatch)
  }
}
