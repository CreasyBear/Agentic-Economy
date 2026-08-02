import type { BusinessRecord } from '@/modules/business/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { base64Codec } from '@/modules/common/base64-codec'
import type { InquiryThreadId, InquiryCustomerRecordReadback, InquirySourceState } from '../schema'
import {
  GOVERNED_ACTION_WIRE_FORMAT,
  verifyGovernedActionBytes,
} from '@/modules/governed-action/public'
import {
  GOVERNED_SEND_ACTION_CLASS,
  GOVERNED_SEND_CANONICAL_FIELDS,
  GOVERNED_SEND_SCHEMA_VERSION,
  type GovernedSendCanonicalFieldKey,
  type GovernedSendIntegrityKeyring,
} from '../governed-send'
import { inquiryReceiptKeyRef } from '../receipt-envelope'
import { validatedGovernedSendBusiness } from '../ledger/facts'

export { validatedGovernedSendBusiness } from '../ledger/facts'

export type GovernedSendRecordProjection =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{
      kind: 'verified'
      business: BusinessRecord
      governedSend: NonNullable<InquiryCustomerRecordReadback['governedSend']>
    }>

const absentGovernedSendProjection = { kind: 'absent' } as const
const invalidGovernedSendProjection = { kind: 'invalid' } as const
export function governedSendRecordProjection(
  state: InquirySourceState,
  threadId: InquiryThreadId,
  keyring: GovernedSendIntegrityKeyring,
): GovernedSendRecordProjection {
  const receipts = state.governedSendReceipts.filter((candidate) => candidate.threadId === threadId)
  const commitments = state.governedSendIntegrityCommitments.filter((candidate) => candidate.threadId === threadId)
  if (receipts.length === 0 && commitments.length === 0) return absentGovernedSendProjection
  if (receipts.length !== 1 || commitments.length !== 1) return invalidGovernedSendProjection

  const receipt = receipts[0]
  const commitment = commitments[0]
  if (receipt === undefined || commitment === undefined) return invalidGovernedSendProjection
  const business = validatedGovernedSendBusiness(state, receipt, commitment, keyring)
  if (business === undefined) return invalidGovernedSendProjection

  if (receipt.retention === 'erased') {
    const lineages = state.governedSendErasureLineage.filter(
      (candidate) => candidate.receiptOperationKey === receipt.operationKey &&
        candidate.threadId === threadId,
    )
    if (lineages.length !== 1) return invalidGovernedSendProjection
    const lineage = lineages[0]
    if (lineage === undefined) return invalidGovernedSendProjection
    const tombstone = state.privacyTombstones.find(
      (candidate) => candidate.threadId === threadId &&
        candidate.operationKey === lineage.privacyOperationKey &&
        candidate.status === 'applied',
    )
    if (tombstone === undefined) return invalidGovernedSendProjection
    const keyRef = inquiryReceiptKeyRef(receipt)
    const expectedMaterial = tombstone.appliedAt === undefined
      ? undefined
      : {
          erasureEventId: `governed-send-erasure:${canonicalDigest({ receiptOperationKey: String(receipt.operationKey), privacyOperationKey: String(tombstone.operationKey), keyRef })}`,
          receiptOperationKey: receipt.operationKey,
          privacyOperationKey: tombstone.operationKey,
          threadId: receipt.threadId,
          digest: receipt.digest,
          keyRef,
          reasonCode: tombstone.reasonCode,
          destroyedAt: tombstone.appliedAt,
          priorReceiptCommitment: canonicalDigest({ operationKey: String(receipt.operationKey), threadId: String(receipt.threadId), digest: receipt.digest, schemaVersion: receipt.schemaVersion, recipientRef: receipt.recipientRef, keyRef }),
        }
    const expectedLineage = expectedMaterial === undefined
      ? undefined
      : { ...expectedMaterial, lineageHash: canonicalDigest(expectedMaterial) }
    const uniqueErasureEventIds = new Set(tombstone.erasureEventIds)
    if (
      expectedLineage === undefined ||
      stableStringify(expectedLineage) !== stableStringify(lineage) ||
      !tombstone.erasureEventIds.includes(lineage.erasureEventId) ||
      tombstone.receiptErasureCount !== tombstone.erasureEventIds.length ||
      uniqueErasureEventIds.size !== tombstone.erasureEventIds.length
    ) return invalidGovernedSendProjection
    return {
      kind: 'verified',
      business,
      governedSend: {
        posture: 'erased',
        digest: receipt.digest,
        erasedAt: receipt.erasedAt,
        erasureEventId: receipt.erasureEventId,
      },
    }
  }
  const appliedTombstone = state.privacyTombstones.some(
    (tombstone) => tombstone.threadId === threadId && tombstone.status === 'applied',
  )
  if (appliedTombstone) return invalidGovernedSendProjection

  try {
    const bytes = base64Codec.fromBase64(receipt.canonicalBytesBase64)
    if (!verifyGovernedActionBytes(bytes, receipt.digest)) return invalidGovernedSendProjection
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const envelope: unknown = JSON.parse(decoded)
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return invalidGovernedSendProjection
    }

    const envelopeRecord = envelope as Record<string, unknown>
    const envelopeKeys = Object.keys(envelopeRecord).sort()
    const declaredEnvelopeKeys = ['actionClass', 'payload', 'schemaVersion', 'wireFormat']
    if (
      envelopeKeys.length !== declaredEnvelopeKeys.length ||
      envelopeKeys.some((key, index) => key !== declaredEnvelopeKeys[index])
    ) return invalidGovernedSendProjection
    if (
      envelopeRecord.wireFormat !== GOVERNED_ACTION_WIRE_FORMAT ||
      envelopeRecord.schemaVersion !== GOVERNED_SEND_SCHEMA_VERSION ||
      envelopeRecord.actionClass !== GOVERNED_SEND_ACTION_CLASS
    ) return invalidGovernedSendProjection

    const payload = envelopeRecord.payload
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return invalidGovernedSendProjection
    }
    const payloadRecord = payload as Record<string, unknown>
    const payloadKeys = Object.keys(payloadRecord).sort()
    const declaredKeys = GOVERNED_SEND_CANONICAL_FIELDS.map((field) => field.key).sort()
    if (payloadKeys.length !== declaredKeys.length || payloadKeys.some((key, index) => key !== declaredKeys[index])) {
      return invalidGovernedSendProjection
    }
    if (
      !('offeringRef' in commitment.targetBinding) ||
      payloadRecord.offeringRef !== String(commitment.targetBinding.offeringRef)
    ) return invalidGovernedSendProjection

    const fields: { key: GovernedSendCanonicalFieldKey; label: string; value: string | null }[] = []
    for (const field of GOVERNED_SEND_CANONICAL_FIELDS) {
      const value = payloadRecord[field.key]
      if (value !== null && typeof value !== 'string') return invalidGovernedSendProjection
      fields.push({ key: field.key, label: field.label, value })
    }
    return {
      kind: 'verified',
      business,
      governedSend: { posture: 'verified', digest: receipt.digest, fields },
    }
  } catch {
    return invalidGovernedSendProjection
  }
}
