import {
  createEmptyInquirySourceState,
  listOwnerInbox,
  type InquirySourceState,
  type OwnerInboxReadback,
} from '@/modules/inquiries/public'

export type OwnerInquiriesRouteInput = {
  state?: InquirySourceState
  ownerId?: OwnerInboxReadback['ownerId']
}

export type OwnerInquiriesRouteReadback = {
  inbox: OwnerInboxReadback
  error?: {
    code: string
    reason: string
  }
}

const defaultOwnerId = 'owner:inquiries-route' as OwnerInboxReadback['ownerId']
const emptyInquiryState = createEmptyInquirySourceState()

export function readOwnerInquiriesRouteReadback(input: OwnerInquiriesRouteInput = {}): OwnerInquiriesRouteReadback {
  const ownerId = input.ownerId ?? defaultOwnerId

  return {
    inbox: listOwnerInbox(input.state ?? emptyInquiryState, { authority: { ownerId } }),
  }
}
