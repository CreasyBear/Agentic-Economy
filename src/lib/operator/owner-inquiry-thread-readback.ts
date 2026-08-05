import type { OwnerId } from '@/modules/common/ids'
import {
  createEmptyInquirySourceState,
  readInquiryDeliveryReadback,
  readInquiryPrivacyTombstone,
  readOwnerInquiry,
  type InquiryPrivacyTombstoneRecord,
  type InquirySourceState,
  type InquiryThreadId,
  type OwnerInboxNotificationProjection,
  type OwnerInquiryDetailReadback,
} from '@/modules/inquiries/public'

export type OwnerInquiryThreadRouteInput = {
  state?: InquirySourceState
  ownerId?: OwnerId
  threadId?: InquiryThreadId
}

export type OwnerInquiryThreadRouteReadback =
  | {
      kind: 'available'
      detail: OwnerInquiryDetailReadback
      notifications: readonly OwnerInboxNotificationProjection[]
      tombstones: readonly InquiryPrivacyTombstoneRecord[]
      canReply: boolean
      canClose: boolean
      canMarkRead: boolean
    }
  | {
      kind: 'not_found'
      reason: string
    }

const defaultOwnerId = 'owner:inquiry-thread-route' as OwnerId
const emptyInquiryState = createEmptyInquirySourceState()

export function readOwnerInquiryThreadRouteReadback(input: OwnerInquiryThreadRouteInput = {}): OwnerInquiryThreadRouteReadback {
  if (input.threadId === undefined) {
    return { kind: 'not_found', reason: 'Inquiry thread is required.' }
  }

  const state = input.state ?? emptyInquiryState
  const authority = { ownerId: input.ownerId ?? defaultOwnerId }
  const detail = readOwnerInquiry(state, {
    authority,
    threadId: input.threadId,
  })

  if (detail.kind === 'error') {
    return { kind: 'not_found', reason: detail.reason }
  }

  const delivery = readInquiryDeliveryReadback(state, {
    authority,
    threadId: input.threadId,
  })
  const tombstones = readInquiryPrivacyTombstone(state, {
    authority,
    threadId: input.threadId,
  })
  const status = detail.readback.inquiry.status

  return {
    kind: 'available',
    detail: detail.readback,
    notifications: delivery.kind === 'ok' ? delivery.readback.notifications : detail.readback.notifications,
    tombstones: tombstones.kind === 'ok' ? tombstones.tombstones : [],
    canReply: status !== 'closed',
    canClose: status !== 'closed',
    canMarkRead: status !== 'closed',
  }
}
