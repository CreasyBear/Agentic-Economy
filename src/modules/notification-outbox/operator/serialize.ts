import type {
  NotificationDispatchAttemptRecord,
  NotificationDispatchReadback,
  NotificationDispatchRecord,
  NotificationWebhookEventRecord,
} from '../internal/schema'

export function serializeDispatch(dispatch: NotificationDispatchRecord) {
  return {
    dispatchId: dispatch.dispatchId,
    businessId: dispatch.businessId,
    inquiryThreadId: dispatch.inquiryThreadId,
    inquiryMessageId: dispatch.inquiryMessageId,
    recipientRole: dispatch.recipientRole,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
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

export function serializeAttempt(attempt: NotificationDispatchAttemptRecord) {
  return {
    attemptId: attempt.attemptId,
    dispatchId: attempt.dispatchId,
    providerFamily: attempt.providerFamily,
    status: attempt.status,
    providerIdempotencyKey: attempt.providerIdempotencyKey,
    requestPayloadHash: attempt.requestPayloadHash,
    ...(attempt.providerResponseHash === undefined ? {} : { providerResponseHash: attempt.providerResponseHash }),
    ...(attempt.redactedError === undefined ? {} : { redactedError: attempt.redactedError }),
    ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }),
    startedAt: attempt.startedAt,
    ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
  }
}

export function serializeWebhookEvent(event: NotificationWebhookEventRecord) {
  return {
    webhookEventId: event.webhookEventId,
    providerFamily: event.providerFamily,
    providerEventId: event.providerEventId,
    logicalObjectKey: event.logicalObjectKey,
    ...(event.dispatchId === undefined ? {} : { dispatchId: event.dispatchId }),
    status: event.status,
    eventType: event.eventType,
    signatureStatus: event.signatureStatus,
    payloadHash: event.payloadHash,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    operationKey: event.operationKey,
    correlationId: event.correlationId,
    receivedAt: event.receivedAt,
  }
}

export function serializeReadback(readback: NotificationDispatchReadback) {
  return {
    dispatch: serializeDispatch(readback.dispatch),
    attempts: readback.attempts.map(serializeAttempt),
    webhookEvents: readback.webhookEvents.map(serializeWebhookEvent),
    ownerCanRepair: false as const,
    operatorNextAction: readback.operatorNextAction,
  }
}
