import type { CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ModuleResult } from '@/modules/common/result'
import type { GovernedSendErasureLineageRecord } from '../governed-send'
import { inquiryReceiptKeyRef } from '../receipt-envelope'
import { normalizeInquiryWhitespace } from '../normalize-text'
import {
  auditRecord,
  error,
  findOperation,
  findOwnedThread,
  operationRecord,
} from '../ledger/facts'
import type {
  InquiryMessageRecord,
  InquiryOwnerAuthority,
  InquiryPrivacyTombstoneRecord,
  InquirySourceState,
  InquiryThreadId,
  InquiryThreadRecord,
} from '../schema'

export type InquiryPrivacyErrorCode = 'inquiry_not_found' | 'inquiry_duplicate_conflict'

export type DeleteInquiryPrivateContentCommand = {
  authority: InquiryOwnerAuthority
  threadId: InquiryThreadId
  reasonCode: string
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type DeleteInquiryPrivateContentResult = ModuleResult<
  'inquiry_private_content_deleted' | 'inquiry_private_content_delete_replayed',
  InquiryPrivacyErrorCode,
  { state: InquirySourceState; tombstone: InquiryPrivacyTombstoneRecord },
  { reason: string }
>

export type ReadInquiryPrivacyTombstoneResult = ModuleResult<
  'inquiry_privacy_tombstone_read',
  'inquiry_not_found',
  { tombstones: readonly InquiryPrivacyTombstoneRecord[] },
  { reason: string }
>

export function deleteInquiryPrivateContent(
  state: InquirySourceState,
  command: DeleteInquiryPrivateContentCommand
): DeleteInquiryPrivateContentResult {
  const thread = findOwnedThread(state, command.authority, command.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  const reasonCode = normalizeReasonCode(command.reasonCode)
  const requestHash = canonicalDigest({
    action: 'delete_private_content',
    threadId: command.threadId,
    ownerId: command.authority.ownerId,
    reasonCode,
  })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different privacy delete request.')
    }

    const replayTombstone = findPrivacyTombstone(state, command.threadId, command.operationKey)
    return replayTombstone === undefined
      ? error('inquiry_not_found', 'Inquiry privacy tombstone was not found for this owner.')
      : { kind: 'ok', code: 'inquiry_private_content_delete_replayed', state, tombstone: replayTombstone }
  }

  const redactedThread = removeCustomerReplyEmail(thread)
  const receiptErasureLineage: GovernedSendErasureLineageRecord[] = state.governedSendReceipts
    .filter((receipt) => receipt.threadId === thread.threadId && receipt.retention === 'recoverable')
    .map((receipt) => {
      const keyRef = inquiryReceiptKeyRef(receipt)
      const erasureEventId = `governed-send-erasure:${canonicalDigest({
        receiptOperationKey: String(receipt.operationKey),
        privacyOperationKey: String(command.operationKey),
        keyRef,
      })}`
      const priorReceiptCommitment = canonicalDigest({
        operationKey: String(receipt.operationKey),
        threadId: String(receipt.threadId),
        digest: receipt.digest,
        schemaVersion: receipt.schemaVersion,
        recipientRef: receipt.recipientRef,
        keyRef,
      })
      const lineage = {
        erasureEventId,
        receiptOperationKey: receipt.operationKey,
        privacyOperationKey: command.operationKey,
        threadId: receipt.threadId,
        digest: receipt.digest,
        keyRef,
        reasonCode,
        destroyedAt: command.now,
        priorReceiptCommitment,
      }
      return { ...lineage, lineageHash: canonicalDigest(lineage) }
    })
  const erasureEventIds = receiptErasureLineage.map((lineage) => lineage.erasureEventId)
  const tombstone: InquiryPrivacyTombstoneRecord = {
    threadId: thread.threadId,
    businessId: thread.businessId,
    reasonCode,
    status: 'applied',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    createdAt: command.now,
    appliedAt: command.now,
    receiptErasureCount: receiptErasureLineage.length,
    erasureEventIds,
  }
  const redactedMessages = state.messages.map((message) =>
    message.threadId === thread.threadId ? redactPrivateMessage(message, command.now) : message
  )
  const messageHashes: SourceHash[] = []
  for (const message of state.messages) {
    if (message.threadId === thread.threadId) {
      messageHashes.push(message.bodyHash)
    }
  }

  const auditEvent = auditRecord({
    eventType: 'inquiry.private_content_deleted',
    actorKind: 'owner',
    actorRef: command.authority.ownerId,
    businessId: thread.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: thread.threadId,
    beforeState: 'private_content_present',
    afterState: 'private_content_deleted',
    redactedPayload: {
      threadId: thread.threadId,
      reasonCode,
      messageHashes,
    },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_private_content_deleted', command.now, {
    threadId: thread.threadId,
  })
  const nextState: InquirySourceState = {
    ...state,
    threads: state.threads.map((candidate) => (candidate.threadId === redactedThread.threadId ? redactedThread : candidate)),
    messages: redactedMessages,
    auditEvents: [...state.auditEvents, auditEvent],
    operations: [...state.operations, operation],
    privacyTombstones: [...state.privacyTombstones, tombstone],
    governedSendReceipts: state.governedSendReceipts.map((receipt) => {
      const lineage = receiptErasureLineage.find((candidate) => candidate.receiptOperationKey === receipt.operationKey)
      if (lineage === undefined || receipt.retention === 'erased') return receipt
      const { canonicalBytesBase64: _discardedCanonicalBytes, ...receiptMetadata } = receipt
      return {
        ...receiptMetadata,
        retention: 'erased' as const,
        erasedAt: command.now,
        erasureEventId: lineage.erasureEventId,
      }
    }),
    governedSendErasureLineage: [...state.governedSendErasureLineage, ...receiptErasureLineage],
  }

  return { kind: 'ok', code: 'inquiry_private_content_deleted', state: nextState, tombstone }
}

export function readInquiryPrivacyTombstone(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadInquiryPrivacyTombstoneResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_privacy_tombstone_read',
    tombstones: state.privacyTombstones.filter((tombstone) => tombstone.threadId === thread.threadId),
  }
}

function removeCustomerReplyEmail(thread: InquiryThreadRecord): InquiryThreadRecord {
  const { customerReplyEmail: _customerReplyEmail, ...rest } = thread
  return rest
}
function findPrivacyTombstone(
  state: InquirySourceState,
  threadId: InquiryThreadId,
  operationKey: OperationKey
): InquiryPrivacyTombstoneRecord | undefined {
  return state.privacyTombstones.find((tombstone) => tombstone.threadId === threadId && tombstone.operationKey === operationKey)
}

function redactPrivateMessage(message: InquiryMessageRecord, deletedAt: number): InquiryMessageRecord {
  return {
    ...message,
    body: '[private content deleted]',
    privateDeletedAt: message.privateDeletedAt ?? deletedAt,
    ...(message.redactedContact === undefined ? {} : { redactedContact: { deleted: true } }),
  }
}

function normalizeReasonCode(value: string): string {
  const normalized = normalizeInquiryWhitespace(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, '_')
  return normalized.length === 0 ? 'privacy_delete_requested' : normalized.slice(0, 96)
}
