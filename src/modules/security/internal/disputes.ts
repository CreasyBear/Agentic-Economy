import { brandNonEmpty } from '@/modules/common/ids'
import type { AuditEventContract } from '@/modules/observability/public'
import { validateAuditEvent } from '@/modules/observability/public'
import { stableHash } from '@/modules/common/stable-hash'
import { assertCsrf, rateLimitClaim } from './duplicates'
import type {
  DisputeEvidenceInput,
  DisputeEvidenceMediaType,
  DisputeOpenCommand,
  DisputeOpenResult,
  DisputeRecord,
  DisputeSourceState,
  RemovalDisputeReasonCode,
  RemovalDisputeReceipt,
} from '@/modules/security/public'

const maxEvidenceItems = 5
const maxEvidenceItemBytes = 2_000_000
const maxEvidenceTotalBytes = 5_000_000
const maxPublicMessageLength = 1_500

const allowedEvidenceMediaTypes = new Set<DisputeEvidenceMediaType>([
  'text/plain',
  'image/jpeg',
  'image/png',
  'application/pdf',
])

const allowedReasonCodes = new Set<RemovalDisputeReasonCode>([
  'privacy_removal_requested',
  'ownership_contested',
  'duplicate_or_impersonation',
  'unsafe_or_inaccurate',
])

type DisputeOpenError = Extract<DisputeOpenResult, { kind: 'error' }>

export function createEmptyDisputeSourceState(): DisputeSourceState {
  return {
    disputes: [],
    abuseRateLimitBuckets: [],
    auditEvents: [],
  }
}

export function openRemovalDispute(state: DisputeSourceState, command: DisputeOpenCommand): DisputeOpenResult {
  const csrfDecision = assertCsrf(command.security.csrf)
  if (csrfDecision.kind === 'rejected') {
    return {
      kind: 'error',
      code: 'dispute_csrf_rejected',
      retryable: false,
      reason: csrfDecision.reason,
    }
  }

  const rateLimitDecision = rateLimitClaim(state.abuseRateLimitBuckets, command.security.rateLimit)
  if (rateLimitDecision.kind === 'limited') {
    return {
      kind: 'error',
      code: 'dispute_rate_limited',
      retryable: true,
      reason: `Retry after ${rateLimitDecision.retryAfter}.`,
    }
  }

  const target = validateTarget(command)
  if (target.kind === 'error') {
    return target
  }

  const reason = validateReason(command.reasonCode)
  if (reason.kind === 'error') {
    return reason
  }

  const contact = normalizeContact(command.contact)
  if (contact.kind === 'error') {
    return contact
  }

  const evidence = normalizeEvidence(command.evidence)
  if (evidence.kind === 'error') {
    return evidence
  }

  const publicMessageHash = stableHash(normalizePublicMessage(command.publicMessage))
  const replay = state.disputes.find((dispute) => dispute.operationKeys.includes(command.operationKey))
  if (replay !== undefined) {
    return {
      kind: 'ok',
      code: 'dispute_open_replayed',
      dispute: replay,
      receipt: toPublicReceipt(replay),
    }
  }

  const existing = state.disputes.find(
    (dispute) =>
      dispute.targetType === target.targetType &&
      dispute.targetRef === target.targetRef &&
      dispute.openedByContactHash === contact.contactHash &&
      dispute.reasonCode === reason.reasonCode &&
      dispute.status !== 'closed'
  )

  if (existing !== undefined) {
    const beforeState = existing.status
    existing.status = 'updated'
    existing.evidenceHash = evidence.evidenceHash
    existing.evidenceRefs = mergeEvidenceRefs(existing.evidenceRefs, evidence.evidenceRefs)
    existing.publicMessageHash = publicMessageHash
    existing.operationKeys.push(command.operationKey)
    existing.requestCount += 1
    existing.updatedAt = command.now

    const auditEvent = recordDisputeAuditEvent(state, existing, {
      eventType: 'dispute.updated',
      beforeState,
      afterState: existing.status,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      now: command.now,
    })

    return {
      kind: 'ok',
      code: 'dispute_open_updated',
      dispute: existing,
      receipt: toPublicReceipt(existing),
      auditEvent,
    }
  }

  const disputeId = `dispute:${stableHash({
    contactHash: contact.contactHash,
    reasonCode: reason.reasonCode,
    targetRef: target.targetRef,
    targetType: target.targetType,
  })}`
  const dispute: DisputeRecord = {
    disputeId,
    businessId: target.businessId,
    status: 'opened',
    openedByContactHash: contact.contactHash,
    targetType: target.targetType,
    targetRef: target.targetRef,
    reasonCode: reason.reasonCode,
    evidenceHash: evidence.evidenceHash,
    evidenceRefs: evidence.evidenceRefs,
    publicMessageHash,
    operationKey: command.operationKey,
    operationKeys: [command.operationKey],
    correlationId: command.correlationId,
    requestCount: 1,
    createdAt: command.now,
    updatedAt: command.now,
  }
  state.disputes.push(dispute)

  const auditEvent = recordDisputeAuditEvent(state, dispute, {
    eventType: 'dispute.opened',
    beforeState: 'none',
    afterState: dispute.status,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    now: command.now,
  })

  return {
    kind: 'ok',
    code: 'dispute_opened',
    dispute,
    receipt: toPublicReceipt(dispute),
    auditEvent,
  }
}

function validateTarget(
  command: DisputeOpenCommand
): { kind: 'ok'; businessId: DisputeRecord['businessId']; targetType: DisputeRecord['targetType']; targetRef: string } | DisputeOpenError {
  const targetRef = command.targetRef.trim()
  const businessId = command.businessId.trim()
  if (targetRef.length === 0 || businessId.length === 0) {
    return {
      kind: 'error',
      code: 'dispute_invalid_target',
      retryable: false,
      reason: 'Removal target is required.',
    }
  }

  return {
    kind: 'ok',
    businessId: brandNonEmpty(businessId, 'BusinessId'),
    targetType: command.targetType,
    targetRef,
  }
}

function validateReason(
  reasonCode: RemovalDisputeReasonCode
): { kind: 'ok'; reasonCode: RemovalDisputeReasonCode } | DisputeOpenError {
  if (!allowedReasonCodes.has(reasonCode)) {
    return {
      kind: 'error',
      code: 'dispute_invalid_reason',
      retryable: false,
      reason: 'Removal request reason is not supported.',
    }
  }

  return { kind: 'ok', reasonCode }
}

function normalizeContact(contact: DisputeOpenCommand['contact']): { kind: 'ok'; contactHash: string } | DisputeOpenError {
  const email = normalizeContactPart(contact.email).toLowerCase()
  const phone = normalizeContactPart(contact.phone)
  const name = normalizeContactPart(contact.name)

  if (email.length === 0 && phone.length === 0 && name.length === 0) {
    return {
      kind: 'error',
      code: 'dispute_invalid_contact',
      retryable: false,
      reason: 'At least one contact value is required.',
    }
  }

  return {
    kind: 'ok',
    contactHash: stableHash({
      email: email.length === 0 ? null : email,
      name: name.length === 0 ? null : name,
      phone: phone.length === 0 ? null : phone,
    }),
  }
}

function normalizeEvidence(
  evidence: readonly DisputeEvidenceInput[]
): { kind: 'ok'; evidenceHash: string; evidenceRefs: string[] } | DisputeOpenError {
  if (evidence.length === 0 || evidence.length > maxEvidenceItems) {
    return {
      kind: 'error',
      code: 'dispute_invalid_evidence',
      retryable: false,
      reason: 'Evidence count is outside the supported range.',
    }
  }

  let totalBytes = 0
  const normalized = []
  const evidenceRefs: string[] = []
  for (const item of evidence) {
    const label = normalizePublicText(item.label, 120)
    const privateRef = item.privateRef.trim()
    totalBytes += item.byteLength

    if (
      label.length === 0 ||
      privateRef.length === 0 ||
      !privateRef.startsWith('private:evidence:') ||
      !allowedEvidenceMediaTypes.has(item.mediaType) ||
      item.byteLength <= 0 ||
      item.byteLength > maxEvidenceItemBytes ||
      totalBytes > maxEvidenceTotalBytes
    ) {
      return {
        kind: 'error',
        code: 'dispute_invalid_evidence',
        retryable: false,
        reason: 'Evidence type, size, or private reference is invalid.',
      }
    }

    evidenceRefs.push(privateRef)
    normalized.push({
      byteLength: item.byteLength,
      label,
      mediaType: item.mediaType,
      privateRefHash: stableHash(privateRef),
    })
  }

  return {
    kind: 'ok',
    evidenceHash: stableHash(normalized),
    evidenceRefs,
  }
}

function recordDisputeAuditEvent(
  state: DisputeSourceState,
  dispute: DisputeRecord,
  input: {
    eventType: 'dispute.opened' | 'dispute.updated'
    beforeState: string
    afterState: string
    operationKey: DisputeRecord['operationKey']
    correlationId: DisputeRecord['correlationId']
    now: number
  }
): AuditEventContract {
  const redactedPayload = {
    contactHash: dispute.openedByContactHash,
    evidenceCount: dispute.evidenceRefs.length,
    publicMessageHash: dispute.publicMessageHash,
    reasonCode: dispute.reasonCode,
    requestCount: dispute.requestCount,
    targetType: dispute.targetType,
  }
  const validation = validateAuditEvent({
    eventId: brandNonEmpty(`audit:${input.eventType}:${dispute.disputeId}:${input.operationKey}`, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: 'anonymous',
    actorRef: dispute.openedByContactHash,
    targetType: 'dispute',
    targetRef: dispute.disputeId,
    businessId: dispute.businessId,
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    reasonCode: dispute.reasonCode,
    evidenceRefs: dispute.evidenceRefs,
    redactedPayload,
    payloadHash: stableHash(redactedPayload),
    createdAt: input.now,
  })

  if (!validation.valid) {
    throw new Error(`Invalid dispute audit event: ${validation.reason}`)
  }

  state.auditEvents.push(validation.event)
  return validation.event
}

function toPublicReceipt(dispute: DisputeRecord): RemovalDisputeReceipt {
  return {
    disputeId: dispute.disputeId,
    status: dispute.status,
    targetType: dispute.targetType,
    targetRef: dispute.targetRef,
    reasonCode: dispute.reasonCode,
    evidenceHash: dispute.evidenceHash,
    requestCount: dispute.requestCount,
    updatedAt: dispute.updatedAt,
  }
}

function mergeEvidenceRefs(existing: readonly string[], next: readonly string[]): string[] {
  return [...new Set([...existing, ...next])]
}

function normalizeContactPart(value: string | undefined): string {
  return normalizePublicText(value ?? '', 240).toLowerCase()
}

function normalizePublicMessage(value: string | undefined): string {
  return normalizePublicText(value ?? '', maxPublicMessageLength)
}

function normalizePublicText(value: string, maxLength: number): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
