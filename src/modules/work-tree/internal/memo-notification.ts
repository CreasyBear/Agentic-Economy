import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty, type BusinessId, type CorrelationId, type OperationKey } from '@/modules/common/ids'
import type { RedactedPayload } from '@/modules/observability/public'
import {
  enqueueInquiryNotification,
  type EnqueueInquiryNotificationResult,
  type NotificationOutboxSourceState,
  type NotificationProviderFamily,
  type NotificationRecipientRole,
} from '@/modules/notification-outbox/public'

import { renderWeeklyMemo, type WeeklyMemoData } from './memo'

export type WorkTreeMemoNotificationInput = Readonly<{
  businessId: BusinessId
  projectId: string
  revision: number
  recipientRole: NotificationRecipientRole
  providerFamily: NotificationProviderFamily
  correlationId: CorrelationId
  readbackUrl: string
  memo: WeeklyMemoData
  now: number
  operationKey?: OperationKey
}>

export type WorkTreeMemoNotificationResult = EnqueueNotificationResult
export type EnqueueNotificationResult = EnqueueInquiryNotificationResult

/**
 * Enqueue one memo as a logical outbox notification. The outbox state is the
 * only returned state; rendering and projection do not mutate WorkTree source
 * state. A stable operation key makes retries replay the same dispatch/link.
 */
export function enqueueWorkTreeMemoNotification(
  state: NotificationOutboxSourceState,
  input: WorkTreeMemoNotificationInput,
  renderedHtml?: string,
): WorkTreeMemoNotificationResult {
  const readbackUrl = safeReadbackUrl(input.readbackUrl)
  const memo = sanitizeMemo({ ...input.memo, readbackUrl })
  const memoIdentity = canonicalDigest({
    projectId: input.projectId,
    revision: input.revision,
    periodLabel: memo.periodLabel,
    readbackUrl,
  })
  const operationIdentity = canonicalDigest({
    memoIdentity,
    businessId: input.businessId,
    recipientRole: input.recipientRole,
  })
  const operationKey = input.operationKey
    ?? brandNonEmpty(`work-tree:memo:${operationIdentity}:${input.providerFamily}`, 'OperationKey')
  const inquiryThreadId = `work-tree:${input.projectId}`
  const inquiryMessageId = `memo:${memoIdentity}`
  const redactedPayload: RedactedPayload = {
    template: 'work-tree-weekly-memo',
    projectId: input.projectId,
    revision: input.revision,
    readbackUrl,
    title: memo.title,
    periodLabel: memo.periodLabel,
    nextDecision: memo.nextDecision,
    ...(memo.changes === undefined ? {} : { changes: memo.changes }),
    ...(memo.receipts === undefined ? {} : { receipts: memo.receipts }),
    ...(memo.nextActions === undefined ? {} : { nextActions: memo.nextActions }),
    exceptions: memo.exceptions,
    ...(renderedHtml === undefined ? {} : { html: safeText(renderedHtml) }),
  }
  return enqueueInquiryNotification(state, {
    businessId: input.businessId,
    inquiryThreadId,
    inquiryMessageId,
    recipientRole: input.recipientRole,
    providerFamily: input.providerFamily,
    redactedPayload,
    operationKey,
    correlationId: input.correlationId,
    now: input.now,
    providerIdempotencyKey: `ae:${operationKey}`,
  })
}

/** Render with React Email, then enqueue the same idempotent logical memo. */
export async function enqueueRenderedWorkTreeMemoNotification(
  state: NotificationOutboxSourceState,
  input: WorkTreeMemoNotificationInput,
): Promise<WorkTreeMemoNotificationResult> {
  const readbackUrl = safeReadbackUrl(input.readbackUrl)
  const memo = sanitizeMemo({ ...input.memo, readbackUrl })
  const html = await renderWeeklyMemo(memo)
  return enqueueWorkTreeMemoNotification(state, { ...input, memo, readbackUrl }, html)
}

function sanitizeMemo(input: WeeklyMemoData): WeeklyMemoData {
  return {
    ...input,
    title: safeText(input.title),
    periodLabel: safeText(input.periodLabel),
    nextDecision: safeText(input.nextDecision),
    timingCriticalPathSummary: safeText(input.timingCriticalPathSummary),
    exceptions: input.exceptions.map((exception) => ({
      ...exception,
      title: safeText(exception.title),
      detail: safeText(exception.detail),
    })),
    ...(input.waitingDecisions === undefined ? {} : {
      waitingDecisions: input.waitingDecisions.map((decision) => ({
        ...decision,
        title: safeText(decision.title),
        ...(decision.detail === undefined ? {} : { detail: safeText(decision.detail) }),
      })),
    }),
    ...(input.changes === undefined ? {} : {
      changes: input.changes.map((change) => ({
        title: safeText(change.title),
        detail: safeText(change.detail),
      })),
    }),
    ...(input.receipts === undefined ? {} : {
      receipts: input.receipts.map((receipt) => ({
        ...receipt,
        title: safeText(receipt.title),
        detail: safeText(receipt.detail),
      })),
    }),
    ...(input.nextActions === undefined ? {} : {
      nextActions: input.nextActions.map((action) => ({
        title: safeText(action.title),
        detail: safeText(action.detail),
      })),
    }),
    ...(input.readbackUrl === undefined ? {} : { readbackUrl: safeReadbackUrl(input.readbackUrl) }),
  }
}

function safeText(value: string): string {
  return value.replace(
    /(?:api[_ -]?key|authorization|bearer|password|secret|token|raw model reasoning|chain of thought)\s*(?:["']?\s*[:=]\s*["']?|\s+)[^<>"'`,;}\]\r\n]+/giu,
    '[redacted]',
  )
}

export function safeReadbackUrl(value: string): string {
  const trimmed = value.trim()
  return /^\/[A-Za-z0-9_-]/u.test(trimmed) ? trimmed : '/'
}
