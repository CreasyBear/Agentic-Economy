import { stableHash } from '../src/modules/common/stable-hash'
import type {
  InquiryOperatorAuditRef,
  InquiryOperatorDispatchAttemptRef,
  InquiryOperatorFunnelRef,
  InquiryOperatorOperationRef,
  InquiryOperatorReconstructionAllowedReadback,
  InquiryOperatorReconstructionRow,
  InquiryOperatorWebhookRef,
} from '../src/modules/inquiries/public'
import {
  NotificationAttemptStatusValues,
  NotificationWebhookEventStatusValues,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationAttemptStatus,
  NotificationProviderFamily,
  NotificationSignatureStatus,
  NotificationWebhookEventStatus,
} from '../src/modules/notification-outbox/public'
import type { RuntimeDocument } from './source_state'
import {
  isRecord,
  numberField,
  optionalNumberField,
  optionalStringField,
  stringArrayField,
  stringField,
} from './inquiryRuntimeDbHelpers'

export function serializeOperatorReconstructionReadback(
  readback: InquiryOperatorReconstructionAllowedReadback,
  refs: {
    actorRef: string
    attempts: readonly RuntimeDocument[]
    webhooks: readonly RuntimeDocument[]
    auditRows: readonly RuntimeDocument[]
    funnelRows: readonly RuntimeDocument[]
    operationRows: readonly RuntimeDocument[]
  },
) {
  const rows = readback.rows.map((row) => serializeOperatorRow(row, refs))
  return {
    ...readback,
    actorRef: refs.actorRef,
    rows,
    summary: {
      threads: rows.length,
      messages: rows.reduce((count, row) => count + row.messageRefs.length, 0),
      notifications: rows.reduce((count, row) => count + row.notificationRefs.length, 0),
      dispatches: rows.reduce((count, row) => count + row.dispatchRefs.length, 0),
      needsRepair: rows.filter((row) => row.operatorNextAction === 'retry_available' || row.operatorNextAction === 'operator_review_required').length,
      terminal: rows.filter((row) => row.operatorNextAction === 'terminal').length,
    },
  }
}

function serializeOperatorRow(
  row: InquiryOperatorReconstructionRow,
  refs: {
    attempts: readonly RuntimeDocument[]
    webhooks: readonly RuntimeDocument[]
    auditRows: readonly RuntimeDocument[]
    funnelRows: readonly RuntimeDocument[]
    operationRows: readonly RuntimeDocument[]
  },
) {
  const dispatchIds = new Set(row.dispatchRefs.map((dispatch) => String(dispatch.dispatchId)))
  const webhookRefs = refs.webhooks.filter((webhook) => {
    const dispatchId = optionalStringField(webhook, 'dispatchId')
    return dispatchId !== undefined && dispatchIds.has(dispatchId)
  })
  const webhookIds = new Set(webhookRefs.map((webhook) => stringField(webhook, 'webhookEventId')))
  const notificationCorrelationIds = new Set([
    ...row.correlationIds.map((correlationId) => String(correlationId)),
    ...webhookRefs.map((webhook) => stringField(webhook, 'correlationId')),
  ].filter(Boolean))
  const notificationAuditRefs: InquiryOperatorAuditRef[] = []
  for (const audit of refs.auditRows) {
    if (!stringField(audit, 'eventType').startsWith('notification.')) {
      continue
    }

    const targetRef = stringField(audit, 'targetRef')
    if (dispatchIds.has(targetRef) || webhookIds.has(targetRef)) {
      notificationAuditRefs.push(operatorAuditRefFromRow(audit))
    }
  }

  const notificationFunnelRefs: InquiryOperatorFunnelRef[] = []
  for (const funnel of refs.funnelRows) {
    if (
      stringField(funnel, 'eventType').startsWith('notification_') &&
      notificationCorrelationIds.has(stringField(funnel, 'correlationId'))
    ) {
      notificationFunnelRefs.push(operatorFunnelRefFromRow(funnel))
    }
  }

  const notificationOperationRefs: InquiryOperatorOperationRef[] = []
  for (const operation of refs.operationRows) {
    if (stringField(operation, 'scope') !== 'notification') {
      continue
    }

    const effects = stringArrayField(operation, 'effectRefs')
    const hasMatchingEffect = effects.some((effect) => {
      return (
        dispatchIds.has(effectValueFromRef(effect, 'dispatch') ?? '') ||
        webhookIds.has(effectValueFromRef(effect, 'webhook') ?? '')
      )
    })

    if (hasMatchingEffect) {
      notificationOperationRefs.push(operatorOperationRefFromRow(operation))
    }
  }
  const attemptsByDispatchId = new Map<string, InquiryOperatorDispatchAttemptRef[]>()
  const webhooksByDispatchId = new Map<string, InquiryOperatorWebhookRef[]>()
  if (row.dispatchRefs.length > 0) {
    for (const attempt of refs.attempts) {
      const dispatchId = stringField(attempt, 'dispatchId')
      const existing = attemptsByDispatchId.get(dispatchId)
      const attemptRef = operatorAttemptRefFromRow(attempt)
      if (existing === undefined) {
        attemptsByDispatchId.set(dispatchId, [attemptRef])
      } else {
        existing.push(attemptRef)
      }
    }

    for (const webhook of webhookRefs) {
      const dispatchId = optionalStringField(webhook, 'dispatchId')
      if (dispatchId === undefined) {
        continue
      }
      const existing = webhooksByDispatchId.get(dispatchId)
      const webhookRef = operatorWebhookRefFromRow(webhook)
      if (existing === undefined) {
        webhooksByDispatchId.set(dispatchId, [webhookRef])
      } else {
        existing.push(webhookRef)
      }
    }
  }

  return {
    rowId: row.rowId,
    threadId: row.threadId,
    businessId: row.businessId,
    serviceId: row.serviceId,
    status: row.status,
    sourceHash: row.sourceHash,
    correlationIds: row.correlationIds.map((correlationId) => String(correlationId)),
    operatorNextAction: row.operatorNextAction,
    messageRefs: row.messageRefs.map((message) => ({ ...message })),
    notificationRefs: row.notificationRefs.map((notification) => ({
      ...notification,
      dispatchIds: notification.dispatchIds.map((dispatchId) => dispatchId),
    })),
    dispatchRefs: row.dispatchRefs.map((dispatch) => ({
      ...dispatch,
      attemptRefs: attemptsByDispatchId.get(dispatch.dispatchId) ?? [],
      webhookRefs: webhooksByDispatchId.get(dispatch.dispatchId) ?? [],
    })),
    auditRefs: uniqueOperatorRefs([...row.auditRefs, ...notificationAuditRefs], (ref) => `${ref.eventType}:${ref.targetRef}:${ref.operationKey}`),
    funnelRefs: uniqueOperatorRefs([...row.funnelRefs, ...notificationFunnelRefs], (ref) => `${ref.eventType}:${ref.correlationId}:${ref.createdAt}`),
    operationRefs: uniqueOperatorRefs([...row.operationRefs, ...notificationOperationRefs], (ref) => `${ref.operationKey}:${ref.resultCode}`),
    updatedAt: row.updatedAt,
  }
}

function operatorAttemptRefFromRow(row: RuntimeDocument): InquiryOperatorDispatchAttemptRef {
  return {
    attemptId: stringField(row, 'attemptId'),
    providerFamily: notificationProviderFamily(row),
    status: notificationAttemptStatus(row),
    requestPayloadHash: stringField(row, 'requestPayloadHash'),
    ...(optionalStringField(row, 'providerResponseHash') === undefined ? {} : { providerResponseHash: stringField(row, 'providerResponseHash') }),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    startedAt: numberField(row, 'startedAt'),
    ...(optionalNumberField(row, 'completedAt') === undefined ? {} : { completedAt: numberField(row, 'completedAt') }),
  }
}

function operatorWebhookRefFromRow(row: RuntimeDocument): InquiryOperatorWebhookRef {
  return {
    webhookEventId: stringField(row, 'webhookEventId'),
    providerFamily: notificationProviderFamily(row),
    providerEventId: stringField(row, 'providerEventId'),
    logicalObjectKey: stringField(row, 'logicalObjectKey'),
    status: notificationWebhookEventStatus(row),
    eventType: stringField(row, 'eventType'),
    signatureStatus: notificationSignatureStatus(row),
    payloadHash: stringField(row, 'payloadHash'),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    operationKey: stringField(row, 'operationKey'),
    correlationId: stringField(row, 'correlationId'),
    receivedAt: numberField(row, 'receivedAt'),
  }
}

function operatorAuditRefFromRow(row: RuntimeDocument) {
  return {
    eventType: stringField(row, 'eventType'),
    targetRef: stringField(row, 'targetRef'),
    payloadHash: stringField(row, 'payloadHash'),
    operationKey: stringField(row, 'idempotencyKey'),
    correlationId: stringField(row, 'correlationId'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function operatorFunnelRefFromRow(row: RuntimeDocument) {
  return {
    eventType: stringField(row, 'eventType'),
    businessId: stringField(row, 'businessId'),
    payloadHash: redactedJsonHash(row, 'redactedPayloadJson'),
    correlationId: stringField(row, 'correlationId'),
    createdAt: numberField(row, 'createdAt'),
  }
}

function operatorOperationRefFromRow(row: RuntimeDocument): InquiryOperatorOperationRef {
  const effectRefs = stringArrayField(row, 'effectRefs')
  const resultCode = effectValue(effectRefs, 'result')
  const dispatchId = effectValue(effectRefs, 'dispatch')
  const webhookEventId = effectValue(effectRefs, 'webhook')
  return {
    operationKey: stringField(row, 'key'),
    requestHash: stringField(row, 'requestHash'),
    resultCode: resultCode ?? stringField(row, 'operationName'),
    createdAt: numberField(row, 'createdAt'),
    ...(dispatchId === undefined ? {} : { dispatchId }),
    ...(webhookEventId === undefined ? {} : { webhookEventId }),
  }
}

function redactedJsonHash(row: RuntimeDocument, field: string): string {
  const value = row[field]
  if (!isRecord(value) || typeof value.payloadHash !== 'string') {
    return stableHash(null)
  }
  return value.payloadHash
}

function effectValue(effectRefs: readonly string[], kind: string): string | undefined {
  const prefix = `${kind}:`
  return effectRefs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length)
}

function effectValueFromRef(ref: string, kind: string): string | undefined {
  const prefix = `${kind}:`
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined
}

function uniqueOperatorRefs<T>(refs: readonly T[], key: (ref: T) => string): T[] {
  const seen = new Set<string>()
  return refs.filter((ref) => {
    const refKey = key(ref)
    if (seen.has(refKey)) {
      return false
    }
    seen.add(refKey)
    return true
  })
}

function notificationProviderFamily(row: RuntimeDocument): NotificationProviderFamily {
  return stringField(row, 'providerFamily') === 'novu' ? 'novu' : 'resend'
}

function notificationAttemptStatus(row: RuntimeDocument): NotificationAttemptStatus {
  const value = stringField(row, 'status')
  return NotificationAttemptStatusValues.find((candidate) => candidate === value) ?? 'pending'
}

function notificationWebhookEventStatus(row: RuntimeDocument): NotificationWebhookEventStatus {
  const value = stringField(row, 'status')
  return NotificationWebhookEventStatusValues.find((candidate) => candidate === value) ?? 'held_for_operator'
}

function notificationSignatureStatus(row: RuntimeDocument): NotificationSignatureStatus {
  return stringField(row, 'signatureStatus') === 'verified' ? 'verified' : 'rejected'
}
