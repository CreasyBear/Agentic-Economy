import type { ModuleResult } from '@/modules/common/result'
import { error, findOwnedThread } from '../ledger/facts'
import type {
  InquiryExportMessageProjection,
  InquiryExportReadback,
  InquiryMessageRecord,
  InquiryOwnerAuthority,
  InquirySourceState,
  InquiryThreadId,
  InquiryThreadRecord,
} from '../schema'
import { notificationProjections, ownerMessageProjection, projectInquiry } from './owner'

export type RequestInquiryExportResult = ModuleResult<
  'inquiry_export_read',
  'inquiry_not_found',
  { exportData: InquiryExportReadback },
  { reason: string }
>

export function requestInquiryExport(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): RequestInquiryExportResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_export_read',
    exportData: exportReadback(state, thread),
  }
}

export function exportReadback(state: InquirySourceState, thread: InquiryThreadRecord): InquiryExportReadback {
  return {
    thread: projectInquiry(state, thread),
    messages: state.messages
      .filter((message) => message.threadId === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.messageId).localeCompare(String(right.messageId)))
      .map(exportMessageProjection),
    notifications: notificationProjections(state, thread.threadId),
    auditRefs: state.auditEvents
      .filter((event) => event.targetRef === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.eventType).localeCompare(String(right.eventType)))
      .map((event) => ({
        eventType: event.eventType,
        targetRef: event.targetRef,
        payloadHash: event.payloadHash,
        createdAt: event.createdAt,
      })),
    tombstones: state.privacyTombstones.filter((tombstone) => tombstone.threadId === thread.threadId),
  }
}
export function exportMessageProjection(message: InquiryMessageRecord): InquiryExportMessageProjection {
  return {
    ...ownerMessageProjection(message),
    bodyHash: message.bodyHash,
    ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
    ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
  }
}
