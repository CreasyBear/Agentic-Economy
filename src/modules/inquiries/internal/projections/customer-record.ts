import type { ModuleResult } from '@/modules/common/result'
import {
  accessIdFromInquiryCustomerAccessKey,
  verifyInquiryCustomerAccess,
  type InquiryCustomerAccessKeyring,
} from '../customer-access'
import type { GovernedSendIntegrityKeyring } from '../governed-send'
import { error, findThread, preview } from '../ledger/facts'
import type {
  InquiryCustomerRecordReadback,
  InquiryMessageRecord,
  InquiryNotificationStatus,
  InquirySourceState,
  InquiryThreadId,
  InquiryThreadRecord,
} from '../schema'
import { governedSendRecordProjection } from './governed-send-view'
import { messageBodyForProjection } from './owner'

export type ReadCustomerRecordResult = ModuleResult<
  'inquiry_customer_record_read',
  'inquiry_not_found' | 'inquiry_access_denied',
  { record: InquiryCustomerRecordReadback },
  { reason: string }
>

export function readCustomerRecord(
  state: InquirySourceState,
  input: {
    threadId: InquiryThreadId
    accessKey: string
    keyring: InquiryCustomerAccessKeyring
    governedSendIntegrityKeyring: GovernedSendIntegrityKeyring
    now: number
  },
): ReadCustomerRecordResult {
  const thread = findThread(state, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry record was not found for this key.')
  }

  const accessId = accessIdFromInquiryCustomerAccessKey(input.accessKey)
  const grant = accessId === undefined
    ? undefined
    : state.customerAccessGrants.find((candidate) => candidate.accessId === accessId)
  if (!verifyInquiryCustomerAccess({
    grant,
    accessKey: input.accessKey,
    requestedThreadId: input.threadId,
    now: input.now,
    keyring: input.keyring,
  })) {
    return error('inquiry_access_denied', 'Inquiry record was not found for this key.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_customer_record_read',
    record: customerRecordReadback(state, thread, input.governedSendIntegrityKeyring),
  }
}

export function customerRecordReadback(
  state: InquirySourceState,
  thread: InquiryThreadRecord,
  keyring: GovernedSendIntegrityKeyring,
): InquiryCustomerRecordReadback {
  const governedSendProjection = governedSendRecordProjection(state, thread.threadId, keyring)
  const business = governedSendProjection.kind === 'verified'
    ? governedSendProjection.business
    : governedSendProjection.kind === 'absent'
      ? state.businesses.find((candidate) => candidate.businessId === thread.businessId)
      : undefined
  const firstMessage = state.messages.find((message) => message.messageId === thread.firstMessageId)
  const reply = state.messages
    .filter((message) => message.threadId === thread.threadId && message.sender === 'owner')
    .sort((left, right) => right.createdAt - left.createdAt || String(left.messageId).localeCompare(String(right.messageId)))[0]
  const deliveryNotification = state.notifications
    .filter((notification) => notification.threadId === thread.threadId && notification.recipientRole === 'owner')
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))[0]
  const deliveryState = deliveryNotification?.status ?? 'held'
  const deliveryUpdatedAt = deliveryNotification?.updatedAt ?? thread.updatedAt

  return {
    schemaVersion: 'inquiry-customer-record:v1',
    threadId: thread.threadId,
    business: {
      name: business?.name ?? 'Business unavailable',
      slug: business?.slug ?? '',
    },
    submitted: {
      messageSummary: preview(firstMessage?.body ?? ''),
      submittedAt: thread.createdAt,
    },
    ...(governedSendProjection.kind === 'verified'
      ? { governedSend: governedSendProjection.governedSend }
      : {}),
    delivery: {
      state: deliveryState,
      label: customerDeliveryLabel(deliveryState),
      updatedAt: deliveryUpdatedAt,
    },
    timeline: customerTimeline(thread, deliveryState, deliveryUpdatedAt, reply),
    ...(reply === undefined ? {} : { reply: { body: messageBodyForProjection(reply), createdAt: reply.createdAt } }),
    ...(thread.closedAt === undefined ? {} : { closedAt: thread.closedAt }),
    updatedAt: thread.updatedAt,
  }
}
export function customerTimeline(
  thread: InquiryThreadRecord,
  deliveryState: InquiryNotificationStatus,
  deliveryUpdatedAt: number,
  reply: InquiryMessageRecord | undefined
): InquiryCustomerRecordReadback['timeline'] {
  const sentComplete = deliveryState === 'sent'
  const deliveryCurrent = sentComplete === false && reply === undefined
  const replied = reply !== undefined || thread.repliedAt !== undefined || thread.status === 'replied' || thread.status === 'closed'
  const closed = thread.status === 'closed' && thread.closedAt !== undefined

  return [
    {
      key: 'received',
      label: 'Inquiry received',
      detail: 'Your ask is saved as a written record.',
      status: 'complete',
      timestamp: thread.createdAt,
    },
    {
      key: 'sent_to_business',
      label: 'Sent to business',
      detail: customerDeliveryDetail(deliveryState),
      status: sentComplete ? 'complete' : deliveryCurrent ? 'current' : 'complete',
      timestamp: deliveryUpdatedAt,
    },
    {
      key: 'business_replied',
      label: 'Business replied',
      detail: replied ? 'Their reply is saved on this record.' : 'Their reply will appear here when it arrives.',
      status: replied ? 'complete' : sentComplete ? 'current' : 'pending',
      ...(reply?.createdAt === undefined ? thread.repliedAt === undefined ? {} : { timestamp: thread.repliedAt } : { timestamp: reply.createdAt }),
    },
    {
      key: 'closed',
      label: 'Record closed',
      detail: closed ? 'This record is closed and kept for reference.' : 'The record stays open while the business follow-up is active.',
      status: closed ? 'complete' : replied ? 'current' : 'pending',
      ...(thread.closedAt === undefined ? {} : { timestamp: thread.closedAt }),
    },
  ]
}

export function customerDeliveryLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued for business delivery'
    case 'sent':
      return 'Delivery recorded'
    case 'failed':
      return 'Delivery needs review'
    case 'held':
      return 'Delivery held for review'
  }
}

export function customerDeliveryDetail(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'The written inquiry is queued for business delivery.'
    case 'sent':
      return 'The written inquiry has a delivery record.'
    case 'failed':
      return 'The written inquiry is saved; delivery needs review.'
    case 'held':
      return 'The written inquiry is saved and held for review.'
  }
}
