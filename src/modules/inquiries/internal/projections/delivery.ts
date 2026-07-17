import type { ModuleResult } from '@/modules/common/result'
import { error, findOwnedThread } from '../ledger/facts'
import type {
  InquiryDeliveryReadback,
  InquiryOwnerAuthority,
  InquirySourceState,
  InquiryThreadId,
} from '../schema'
import { notificationProjections } from './owner'

export type ReadInquiryDeliveryResult = ModuleResult<
  'inquiry_delivery_read',
  'inquiry_not_found',
  { readback: InquiryDeliveryReadback },
  { reason: string }
>


export function readInquiryDeliveryReadback(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadInquiryDeliveryResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_delivery_read',
    readback: {
      threadId: thread.threadId,
      notifications: notificationProjections(state, thread.threadId),
    },
  }
}
