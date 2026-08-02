import type { BusinessId } from '@/modules/common/ids'
import type { ModuleResult } from '@/modules/common/result'
import { error, findOwnedThread, latestNotification, preview } from '../ledger/facts'
import type {
  InquiryMessageRecord,
  InquiryNotificationStatus,
  InquiryOwnerAuthority,
  InquirySourceState,
  InquiryThreadId,
  InquiryThreadRecord,
  OwnerInboxBucket,
  OwnerInboxDeliveryCounts,
  OwnerInboxInquiryProjection,
  OwnerInboxMessageProjection,
  OwnerInboxNotificationProjection,
  OwnerInboxOriginProjection,
  OwnerInboxReadback,
  OwnerInquiryDetailReadback,
} from '../schema'

export type ReadOwnerInquiryResult = ModuleResult<
  'inquiry_read',
  'inquiry_not_found',
  { readback: OwnerInquiryDetailReadback },
  { reason: string }
>

export function listOwnerInbox(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; businessId?: BusinessId }
): OwnerInboxReadback {
  const ownedBusinessIds = new Set<BusinessId>()
  for (const business of state.businesses) {
    if (business.ownerId !== input.authority.ownerId) {
      continue
    }
    if (input.businessId !== undefined && business.businessId !== input.businessId) {
      continue
    }
    ownedBusinessIds.add(business.businessId)
  }
  const inquiries: OwnerInboxInquiryProjection[] = []
  for (const thread of state.threads) {
    if (ownedBusinessIds.has(thread.businessId)) {
      inquiries.push(projectInquiry(state, thread))
    }
  }
  inquiries.sort((left, right) => right.updatedAt - left.updatedAt || String(left.threadId).localeCompare(String(right.threadId)))
  const buckets = { unread: 0, needs_reply: 0, resolved: 0 }
  const delivery: OwnerInboxDeliveryCounts = { queued: 0, sent: 0, failed: 0, held: 0 }

  for (const inquiry of inquiries) {
    buckets[inquiry.bucket] += 1
    delivery[inquiry.notificationStatus] += 1
  }

  return {
    ownerId: input.authority.ownerId,
    empty: inquiries.length === 0,
    buckets,
    delivery,
    inquiries,
  }
}

export function readOwnerInquiry(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadOwnerInquiryResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_read',
    readback: detailReadback(state, thread),
  }
}

export function detailReadback(state: InquirySourceState, thread: InquiryThreadRecord): OwnerInquiryDetailReadback {
  return {
    inquiry: projectInquiry(state, thread),
    messages: state.messages
      .filter((message) => message.threadId === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.messageId).localeCompare(String(right.messageId)))
      .map(ownerMessageProjection),
    notifications: notificationProjections(state, thread.threadId),
  }
}
export function ownerMessageProjection(message: InquiryMessageRecord): OwnerInboxMessageProjection {
  return {
    messageId: message.messageId,
    sender: message.sender,
    body: messageBodyForProjection(message),
    createdAt: message.createdAt,
  }
}
export function messageBodyForProjection(message: InquiryMessageRecord): string {
  return message.privateDeletedAt === undefined ? message.body : '[private content deleted]'
}

export function projectInquiry(state: InquirySourceState, thread: InquiryThreadRecord): OwnerInboxInquiryProjection {
  const business = state.businesses.find((candidate) => candidate.businessId === thread.businessId)
  const offering = state.businessOfferings.find((candidate) =>
    candidate.businessId === thread.businessId && candidate.offeringRef === thread.offeringRef)
  const revision = offering === undefined
    ? undefined
    : state.businessOfferingRevisions.find((candidate) =>
      candidate.businessId === thread.businessId
      && candidate.offeringRef === thread.offeringRef
      && candidate.revision === offering.currentRevision)
  const firstMessage = state.messages.find((message) => message.messageId === thread.firstMessageId)
  const notificationStatus = latestNotification(state, thread.threadId)?.status ?? 'held'

  return {
    threadId: thread.threadId,
    businessId: thread.businessId,
    offeringRef: thread.offeringRef,
    businessName: business?.name ?? 'Business unavailable',
    offeringName: revision?.name ?? 'Offering unavailable',
    status: thread.status,
    bucket: bucketForThread(thread),
    preview: preview(firstMessage?.body ?? ''),
    notificationStatus,
    notificationLabel: notificationLabel(notificationStatus),
    messageCount: state.messages.filter((message) => message.threadId === thread.threadId).length,
    version: thread.version,
    submittedAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    ...(thread.origin === undefined ? {} : { origin: ownerOriginProjection(thread.origin) }),
  }
}

export function ownerOriginProjection(origin: NonNullable<InquiryThreadRecord['origin']>): OwnerInboxOriginProjection {
  switch (origin.kind) {
    case 'answer_thread':
      return {
        kind: origin.kind,
        label: 'From answer',
        href: `/t/${encodeURIComponent(origin.threadId)}`,
      }
  }
}

export function notificationProjections(state: InquirySourceState, threadId: InquiryThreadId): OwnerInboxNotificationProjection[] {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))
    .map((notification) => ({
      notificationId: notification.notificationId,
      messageId: notification.messageId,
      recipientRole: notification.recipientRole,
      status: notification.status,
      label: notificationLabel(notification.status),
      updatedAt: notification.updatedAt,
      ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
      dispatchIds: notification.dispatchBindings.map((binding) => binding.dispatchId),
      providerFamilies: notification.dispatchBindings.map((binding) => binding.providerFamily),
      dispatchStatuses: notification.dispatchBindings.map((binding) => binding.status),
      dispatchBindings: notification.dispatchBindings.map((binding) => ({ ...binding })),
    }))
}
export function bucketForThread(thread: InquiryThreadRecord): OwnerInboxBucket {
  if (thread.status === 'closed') {
    return 'resolved'
  }
  if (thread.status === 'unread') {
    return 'unread'
  }

  return 'needs_reply'
}
export function notificationLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'sent':
      return 'Sent'
    case 'failed':
      return 'Failed'
    case 'held':
      return 'Held'
  }
}
