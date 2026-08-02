import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type {
  InquiryOperatorAuditRef,
  InquiryOperatorDispatchAttemptRef,
  InquiryOperatorFunnelRef,
  InquiryOperatorOperationRef,
  InquiryOperatorReconstructionAllowedReadback,
  InquiryOperatorReconstructionRow,
  InquiryOperatorWebhookRef,
} from '../src/modules/inquiries/public'
import { parseRedactedPayload } from '../src/modules/notification-outbox/operator/parse-payload'
import type { Doc } from './_generated/dataModel'

export function serializeOperatorReconstructionReadback(
  readback: InquiryOperatorReconstructionAllowedReadback,
  refs: {
    actorRef: string
    attempts: readonly Doc<'notificationDispatchAttempts'>[]
    webhooks: readonly Doc<'notificationWebhookEvents'>[]
    auditRows: readonly Doc<'auditEvents'>[]
    funnelRows: readonly Doc<'funnelEvents'>[]
    operationRows: readonly Doc<'operationKeys'>[]
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

export function serializeOperatorRow(
  row: InquiryOperatorReconstructionRow,
  refs: {
    attempts: readonly Doc<'notificationDispatchAttempts'>[]
    webhooks: readonly Doc<'notificationWebhookEvents'>[]
    auditRows: readonly Doc<'auditEvents'>[]
    funnelRows: readonly Doc<'funnelEvents'>[]
    operationRows: readonly Doc<'operationKeys'>[]
  },
) {
  const dispatchIds = new Set(row.dispatchRefs.map((dispatch) => String(dispatch.dispatchId)))
  const webhookRefs = refs.webhooks.filter((webhook) => webhook.dispatchId !== undefined && dispatchIds.has(webhook.dispatchId))
  const webhookIds = new Set(webhookRefs.map((webhook) => webhook.webhookEventId))
  const notificationCorrelationIds = new Set([
    ...row.correlationIds.map((correlationId) => String(correlationId)),
    ...webhookRefs.map((webhook) => webhook.correlationId),
  ].filter(Boolean))
  const notificationAuditRefs: InquiryOperatorAuditRef[] = []
  for (const audit of refs.auditRows) {
    if (!audit.eventType.startsWith('notification.')) continue
    if (dispatchIds.has(audit.targetRef) || webhookIds.has(audit.targetRef)) notificationAuditRefs.push(operatorAuditRefFromRow(audit))
  }
  const notificationFunnelRefs: InquiryOperatorFunnelRef[] = []
  for (const funnel of refs.funnelRows) {
    if (funnel.eventType.startsWith('notification_') && notificationCorrelationIds.has(funnel.correlationId)) notificationFunnelRefs.push(operatorFunnelRefFromRow(funnel))
  }
  const notificationOperationRefs: InquiryOperatorOperationRef[] = []
  for (const operation of refs.operationRows) {
    if (operation.scope !== 'notification') continue
    const hasMatchingEffect = operation.effectRefs.some((effect) =>
      dispatchIds.has(effectValueFromRef(effect, 'dispatch') ?? '') || webhookIds.has(effectValueFromRef(effect, 'webhook') ?? ''))
    if (hasMatchingEffect) notificationOperationRefs.push(operatorOperationRefFromRow(operation))
  }
  const attemptsByDispatchId = new Map<string, InquiryOperatorDispatchAttemptRef[]>()
  const webhooksByDispatchId = new Map<string, InquiryOperatorWebhookRef[]>()
  if (row.dispatchRefs.length > 0) {
    for (const attempt of refs.attempts) {
      const existing = attemptsByDispatchId.get(attempt.dispatchId)
      const attemptRef = operatorAttemptRefFromRow(attempt)
      if (existing === undefined) attemptsByDispatchId.set(attempt.dispatchId, [attemptRef])
      else existing.push(attemptRef)
    }
    for (const webhook of webhookRefs) {
      if (webhook.dispatchId === undefined) continue
      const existing = webhooksByDispatchId.get(webhook.dispatchId)
      const webhookRef = operatorWebhookRefFromRow(webhook)
      if (existing === undefined) webhooksByDispatchId.set(webhook.dispatchId, [webhookRef])
      else existing.push(webhookRef)
    }
  }
  const target = row.offeringRef === undefined
    ? { serviceId: row.serviceId, capabilityKind: row.capabilityKind }
    : { offeringRef: row.offeringRef }
  return {
    rowId: row.rowId,
    threadId: row.threadId,
    businessId: row.businessId,
    ...target,
    status: row.status,
    sourceHash: row.sourceHash,
    correlationIds: row.correlationIds.map(String),
    operatorNextAction: row.operatorNextAction,
    messageRefs: row.messageRefs.map((message) => ({ ...message })),
    notificationRefs: row.notificationRefs.map((notification) => ({ ...notification, dispatchIds: notification.dispatchIds.map(String) })),
    dispatchRefs: row.dispatchRefs.map((dispatch) => ({ ...dispatch, attemptRefs: attemptsByDispatchId.get(dispatch.dispatchId) ?? [], webhookRefs: webhooksByDispatchId.get(dispatch.dispatchId) ?? [] })),
    auditRefs: uniqueOperatorRefs([...row.auditRefs, ...notificationAuditRefs], (ref) => `${ref.eventType}:${ref.targetRef}:${ref.operationKey}`),
    funnelRefs: uniqueOperatorRefs([...row.funnelRefs, ...notificationFunnelRefs], (ref) => `${ref.eventType}:${ref.correlationId}:${ref.createdAt}`),
    operationRefs: uniqueOperatorRefs([...row.operationRefs, ...notificationOperationRefs], (ref) => `${ref.operationKey}:${ref.resultCode}`),
    updatedAt: row.updatedAt,
  }
}

function operatorAttemptRefFromRow(row: Doc<'notificationDispatchAttempts'>): InquiryOperatorDispatchAttemptRef {
  return {
    attemptId: row.attemptId,
    providerFamily: row.providerFamily,
    status: row.status,
    requestPayloadHash: row.requestPayloadHash,
    ...(row.providerResponseHash === undefined ? {} : { providerResponseHash: row.providerResponseHash }),
    ...(row.retryAfter === undefined ? {} : { retryAfter: row.retryAfter }),
    startedAt: row.startedAt,
    ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
  }
}
function operatorWebhookRefFromRow(row: Doc<'notificationWebhookEvents'>): InquiryOperatorWebhookRef {
  return {
    webhookEventId: row.webhookEventId,
    providerFamily: row.providerFamily,
    providerEventId: row.providerEventId,
    logicalObjectKey: row.logicalObjectKey,
    ...(row.dispatchId === undefined ? {} : { dispatchId: row.dispatchId }),
    status: row.status,
    eventType: row.eventType,
    signatureStatus: row.signatureStatus,
    payloadHash: row.payloadHash,
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    operationKey: row.operationKey,
    correlationId: row.correlationId,
    receivedAt: row.receivedAt,
  }
}
function operatorAuditRefFromRow(row: Doc<'auditEvents'>): InquiryOperatorAuditRef {
  return { eventType: row.eventType, targetRef: row.targetRef, payloadHash: row.payloadHash, operationKey: row.idempotencyKey, correlationId: row.correlationId, createdAt: row.createdAt }
}
function operatorFunnelRefFromRow(row: Doc<'funnelEvents'>): InquiryOperatorFunnelRef {
  return { eventType: row.eventType, businessId: row.businessId === undefined ? '' : String(row.businessId), payloadHash: canonicalDigest(parseRedactedPayload(row.redactedPayloadJson)), correlationId: row.correlationId, createdAt: row.createdAt }
}
function operatorOperationRefFromRow(row: Doc<'operationKeys'>): InquiryOperatorOperationRef {
  const resultCode = effectValue(row.effectRefs, 'result')
  const dispatchId = effectValue(row.effectRefs, 'dispatch')
  const webhookEventId = effectValue(row.effectRefs, 'webhook')
  return { operationKey: row.key, requestHash: row.requestHash, resultCode: resultCode ?? row.operationName, createdAt: row.createdAt, ...(dispatchId === undefined ? {} : { dispatchId }), ...(webhookEventId === undefined ? {} : { webhookEventId }) }
}
function effectValue(effectRefs: readonly string[], kind: string): string | undefined { return effectRefs.find((ref) => ref.startsWith(`${kind}:`))?.slice(kind.length + 1) }
function effectValueFromRef(ref: string, kind: string): string | undefined { return ref.startsWith(`${kind}:`) ? ref.slice(kind.length + 1) : undefined }
function uniqueOperatorRefs<T>(refs: readonly T[], key: (ref: T) => string): T[] { const seen = new Set<string>(); return refs.filter((ref) => { const refKey = key(ref); if (seen.has(refKey)) return false; seen.add(refKey); return true }) }

