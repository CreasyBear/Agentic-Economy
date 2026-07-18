import {
  decryptGovernedSendReceipt,
  InquiryNotificationDispatchStatusValues,
} from '../src/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  GovernedSendErasureLineageRecord,
  GovernedSendIntegrityCommitmentRecord,
  GovernedSendReceiptRecord,
  InquiryAuditRecord,
  InquiryCustomerAccessGrant,
  InquiryEncryptedReceiptPayload,
  InquiryMessageRecord,
  InquiryNotificationDispatchBinding,
  InquiryNotificationDispatchStatus,
  InquiryNotificationRecord,
  InquiryOperationRecord,
  InquiryPrivacyTombstoneRecord,
  InquiryReceiptKeyring,
  InquiryThreadRecord,
  InquiryWrappedReceiptKey,
  ResolvableOwnerRecipient,
} from '../src/modules/inquiries/public'
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import { CapabilityKindValues } from '../src/modules/catalog/public'
import type { BusinessServiceRecord, CapabilityKind, ServiceCapabilityRecord } from '../src/modules/catalog/public'
import type { BusinessOwnerRecord, BusinessRecord, ClaimRecord } from '../src/modules/business/public'
import type { RedactedPayload } from '../src/modules/observability/public'
import type { AbuseRateLimitBucketRecord, SuppressionRuleRecord } from '../src/modules/security/public'
import type { RuntimeDocument } from './source_state'
import {
  arrayField,
  isRecord,
  numberField,
  optionalNumberField,
  optionalNumberFromUnknown,
  optionalStringField,
  stringArrayField,
  stringField,
  stringFromUnknown,
} from './inquiryRuntimeDbHelpers'

export function toBusinessRecord(row: RuntimeDocument): BusinessRecord {
  return {
    businessId: brandNonEmpty(row._id, 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    slug: brandNonEmpty(stringField(row, 'slug'), 'Slug'),
    name: stringField(row, 'name'),
    normalizedName: stringField(row, 'normalizedName'),
    category: stringField(row, 'category'),
    suburb: stringField(row, 'suburb'),
    stateTerritory: stringField(row, 'stateTerritory'),
    publicStatus: publicStatus(row),
    trustTier: trustTier(row),
    claimStatus: claimStatus(row),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toBusinessOwnerRecord(row: RuntimeDocument): BusinessOwnerRecord {
  const displayName = optionalStringField(row, 'displayName')
  const emailHash = optionalStringField(row, 'emailHash')
  return {
    ownerId: brandNonEmpty(row._id, 'OwnerId'),
    clerkUserId: stringField(row, 'clerkUserId'),
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toClaimRecord(row: RuntimeDocument): ClaimRecord {
  const businessId = optionalStringField(row, 'businessId')
  return {
    claimId: brandNonEmpty(row._id, 'ClaimId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    ...(businessId === undefined ? {} : { businessId: brandNonEmpty(businessId, 'BusinessId') }),
    slug: brandNonEmpty(stringField(row, 'slug'), 'Slug'),
    status: claimRecordStatus(row),
    submittedFactsHash: brandNonEmpty(stringField(row, 'submittedFactsHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toResolvableOwnerRecipient(row: RuntimeDocument): ResolvableOwnerRecipient[] {
  const clerkUserId = stringField(row, 'clerkUserId').trim()
  const emailHash = optionalStringField(row, 'emailHash')?.trim()
  if (clerkUserId.length === 0 || emailHash === undefined || emailHash.length === 0) return []
  return [{
    ownerId: brandNonEmpty(row._id, 'OwnerId'),
    recipientRef: `clerk-owner-email:${emailHash}`,
    resolvedAt: numberField(row, 'updatedAt'),
  }]
}

export function toBusinessServiceRecord(row: RuntimeDocument): BusinessServiceRecord {
  return {
    serviceId: brandNonEmpty(row._id, 'ServiceId'),
    serviceSlug: brandNonEmpty(stringField(row, 'serviceSlug'), 'Slug'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    name: stringField(row, 'name'),
    category: stringField(row, 'category'),
    summary: stringField(row, 'summary'),
    serviceArea: stringField(row, 'serviceArea'),
    hoursOrUnknown: stringField(row, 'hoursOrUnknown'),
    status: businessServiceStatus(row),
    sortOrder: numberField(row, 'sortOrder'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toServiceCapabilityRecord(row: RuntimeDocument): ServiceCapabilityRecord {
  const mode = firstRequestMode(row)
  const noContactReason = optionalStringField(row, 'noContactReason')
  return {
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    serviceId: brandNonEmpty(stringField(row, 'serviceId'), 'ServiceId'),
    kind: capabilityKind(row),
    status: capabilityStatus(row),
    firstRequest:
      mode === 'not_available_yet'
        ? {
            mode,
            publicDisclosure: stringField(row, 'publicDisclosure'),
            publicChannel: publicFirstRequestChannel(row),
            rawContactExcluded: true,
            noContactReason: noContactReason ?? 'Not available yet.',
          }
        : {
            mode,
            publicDisclosure: stringField(row, 'publicDisclosure'),
            publicChannel: publicFirstRequestChannel(row),
            rawContactExcluded: true,
          },
    callable: false as const,
    paymentRequired: false as const,
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toSuppressionRuleRecord(row: RuntimeDocument): SuppressionRuleRecord {
  return {
    targetType: suppressionTargetType(row),
    targetRef: stringField(row, 'targetRef'),
    status: suppressionStatus(row),
    reasonCode: stringField(row, 'reasonCode'),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    createdByAdminRef: stringField(row, 'createdByAdminRef'),
    createdAt: numberField(row, 'createdAt'),
    beforePublicStatus: beforePublicStatus(row),
    beforeClaimStatus: beforeClaimStatus(row),
    ...(optionalStringField(row, 'liftedByAdminRef') === undefined ? {} : { liftedByAdminRef: stringField(row, 'liftedByAdminRef') }),
    ...(optionalStringField(row, 'liftedReasonCode') === undefined ? {} : { liftedReasonCode: stringField(row, 'liftedReasonCode') }),
    ...(arrayField(row, 'liftedEvidenceRefs') === undefined ? {} : { liftedEvidenceRefs: stringArrayField(row, 'liftedEvidenceRefs') }),
    ...(optionalNumberField(row, 'liftedAt') === undefined ? {} : { liftedAt: numberField(row, 'liftedAt') }),
  }
}

export function toInquiryThreadRecord(row: RuntimeDocument): InquiryThreadRecord {
  const origin = inquiryOriginRef(row)
  return {
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    serviceId: brandNonEmpty(stringField(row, 'serviceId'), 'ServiceId'),
    capabilityKind: capabilityKind(row),
    status: inquiryThreadStatus(row),
    firstMessageId: brandNonEmpty(stringField(row, 'firstMessageId'), 'InquiryMessageId'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
    version: numberField(row, 'version'),
    ...(optionalStringField(row, 'customerReplyEmail') === undefined ? {} : { customerReplyEmail: stringField(row, 'customerReplyEmail') }),
    ...(optionalNumberField(row, 'readAt') === undefined ? {} : { readAt: numberField(row, 'readAt') }),
    ...(optionalNumberField(row, 'repliedAt') === undefined ? {} : { repliedAt: numberField(row, 'repliedAt') }),
    ...(optionalNumberField(row, 'closedAt') === undefined ? {} : { closedAt: numberField(row, 'closedAt') }),
    ...(origin === undefined ? {} : { origin }),
  }
}

export function toInquiryCustomerAccessGrant(row: RuntimeDocument): InquiryCustomerAccessGrant {
  const status = stringField(row, 'status') === 'revoked' ? 'revoked' as const : 'active' as const
  return {
    accessId: stringField(row, 'accessId'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    scope: 'customer_record',
    version: 'inquiry-customer-access:v1',
    verifier: stringField(row, 'verifier') as `hmac-sha256:${string}`,
    keyId: stringField(row, 'keyId'),
    status,
    createdAt: numberField(row, 'createdAt'),
    expiresAt: numberField(row, 'expiresAt'),
    ...(optionalNumberField(row, 'revokedAt') === undefined ? {} : { revokedAt: numberField(row, 'revokedAt') }),
  }
}

function inquiryOriginRef(row: RuntimeDocument): InquiryThreadRecord['origin'] | undefined {
  const kind = optionalStringField(row, 'originKind')
  const threadId = optionalStringField(row, 'originThreadId')
  if (kind !== 'answer_thread' || threadId === undefined) {
    return undefined
  }
  return { kind, threadId }
}

export function toInquiryMessageRecord(row: RuntimeDocument): InquiryMessageRecord {
  const contactHash = optionalStringField(row, 'contactHash')
  const redactedContact = redactedJsonPayload(row, 'redactedContact')
  return {
    messageId: brandNonEmpty(stringField(row, 'messageId'), 'InquiryMessageId'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    sender: inquiryMessageSender(row),
    body: stringField(row, 'body'),
    bodyHash: brandNonEmpty(stringField(row, 'bodyHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    ...(contactHash === undefined ? {} : { contactHash: brandNonEmpty(contactHash, 'SourceHash') }),
    ...(redactedContact === undefined ? {} : { redactedContact }),
    ...(optionalNumberField(row, 'privateDeletedAt') === undefined ? {} : { privateDeletedAt: numberField(row, 'privateDeletedAt') }),
  }
}

export function toInquiryNotificationRecord(row: RuntimeDocument): InquiryNotificationRecord {
  const payload = redactedJsonPayload(row, 'redactedPayload') ?? null
  const dispatchBindings = inquiryNotificationDispatchBindings(row)
  return {
    notificationId: brandNonEmpty(stringField(row, 'notificationId'), 'InquiryNotificationId'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    messageId: brandNonEmpty(stringField(row, 'messageId'), 'InquiryMessageId'),
    recipientRole: recipientRole(row),
    status: inquiryNotificationStatus(row),
    redactedPayload: payload,
    payloadHash: brandNonEmpty(redactedJsonHash(row, 'redactedPayload'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
    ...(optionalStringField(row, 'failureCode') === undefined ? {} : { failureCode: stringField(row, 'failureCode') }),
    dispatchBindings,
  }
}

function inquiryNotificationDispatchBindings(row: RuntimeDocument): InquiryNotificationDispatchBinding[] {
  const value = optionalStringField(row, 'dispatchBindingsJson')
  if (value === undefined) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter(isInquiryNotificationDispatchBinding) : []
  } catch {
    return []
  }
}

function isInquiryNotificationDispatchBinding(value: unknown): value is InquiryNotificationDispatchBinding {
  return (
    isRecord(value) &&
    typeof value.dispatchId === 'string' &&
    (value.providerFamily === 'resend' || value.providerFamily === 'novu') &&
    typeof value.status === 'string' &&
    InquiryNotificationDispatchStatusValues.includes(value.status as InquiryNotificationDispatchStatus) &&
    typeof value.providerIdempotencyKey === 'string' &&
    typeof value.payloadHash === 'string' &&
    typeof value.updatedAt === 'number' &&
    (
      value.operatorNextAction === 'none' ||
      value.operatorNextAction === 'retry_available' ||
      value.operatorNextAction === 'operator_review_required' ||
      value.operatorNextAction === 'terminal'
    )
  )
}

export function toInquiryPrivacyTombstoneRecord(row: RuntimeDocument): InquiryPrivacyTombstoneRecord {
  return {
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    reasonCode: stringField(row, 'reasonCode'),
    status: inquiryPrivacyTombstoneStatus(row),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    ...(optionalNumberField(row, 'appliedAt') === undefined ? {} : { appliedAt: numberField(row, 'appliedAt') }),
    receiptErasureCount: numberField(row, 'receiptErasureCount'),
    erasureEventIds: stringArrayField(row, 'erasureEventIds'),
  }
}

export function toInquiryAuditRecord(row: RuntimeDocument): InquiryAuditRecord | undefined {
  if (!stringField(row, 'eventType').startsWith('inquiry.') || optionalStringField(row, 'businessId') === undefined) {
    return undefined
  }

  return {
    eventType: inquiryAuditEventType(row),
    actorKind: auditActorKind(row),
    actorRef: stringField(row, 'actorRef'),
    targetType: 'inquiry',
    targetRef: stringField(row, 'targetRef'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    operationKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    ...(optionalStringField(row, 'beforeState') === undefined ? {} : { beforeState: stringField(row, 'beforeState') }),
    ...(optionalStringField(row, 'afterState') === undefined ? {} : { afterState: stringField(row, 'afterState') }),
    redactedPayload: parseJson(stringField(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
  }
}

export function toAbuseRateLimitBucketRecord(row: RuntimeDocument): AbuseRateLimitBucketRecord {
  return {
    scope: 'inquiry_submit',
    key: stringField(row, 'key'),
    window: stringField(row, 'window'),
    count: numberField(row, 'count'),
    state: abuseBucketState(row),
    resetAt: numberField(row, 'resetAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export function toInquiryOperationRecord(row: RuntimeDocument): InquiryOperationRecord {
  const effectRefs = stringArrayField(row, 'effectRefs')
  return {
    operationKey: brandNonEmpty(stringField(row, 'key'), 'OperationKey'),
    requestHash: brandNonEmpty(stringField(row, 'requestHash'), 'SourceHash'),
    resultCode: effectValue(effectRefs, 'result') ?? 'inquiry_submitted',
    ...(effectValue(effectRefs, 'thread') === undefined ? {} : { threadId: brandNonEmpty(effectValue(effectRefs, 'thread') ?? '', 'InquiryThreadId') }),
    ...(effectValue(effectRefs, 'message') === undefined ? {} : { messageId: brandNonEmpty(effectValue(effectRefs, 'message') ?? '', 'InquiryMessageId') }),
    ...(effectValue(effectRefs, 'notification') === undefined ? {} : { notificationId: brandNonEmpty(effectValue(effectRefs, 'notification') ?? '', 'InquiryNotificationId') }),
    createdAt: numberField(row, 'createdAt'),
  }
}
export async function toGovernedSendReceiptRecord(
  row: RuntimeDocument,
  keyRows: readonly RuntimeDocument[],
  lineageRows: readonly RuntimeDocument[],
  keyring: InquiryReceiptKeyring,
): Promise<GovernedSendReceiptRecord | undefined> {
  const proof = isRecord(row.admissionProof) ? row.admissionProof : {}
  const proofDetail = isRecord(proof.proof) ? proof.proof : {}
  const destinationVerifiedAt = optionalNumberFromUnknown(proofDetail.destinationVerifiedAt)
  const operationKey = brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey')
  const threadId = brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId')
  const digest = stringField(row, 'digest') as `sha256:${string}`
  const keyRef = stringField(row, 'keyRef')
  const base = {
    digest,
    algorithm: 'sha256' as const,
    schemaVersion: numberField(row, 'schemaVersion'),
    createdAt: numberField(row, 'createdAt'),
    operationKey,
    threadId,
    admissionProof: {
      version: 'r1-target-admitted:v1' as const,
      admitted: true as const,
      proof: {
        kind: 'claimed_owner' as const,
        claimRef: stringFromUnknown(proofDetail.claimRef),
        recipientRef: stringFromUnknown(proofDetail.recipientRef),
        ...(destinationVerifiedAt === undefined ? {} : { destinationVerifiedAt }),
      },
    },
    recipientRef: stringField(row, 'recipientRef'),
  }
  const wrappedKeyRow = keyRows.find((candidate) => stringField(candidate, 'keyRef') === keyRef)
  const matchingLineageRows = lineageRows.filter(
    (candidate) => stringField(candidate, 'receiptOperationKey') === String(operationKey),
  )
  if (matchingLineageRows.length > 1) return undefined
  const lineageRow = matchingLineageRows[0]
  if (wrappedKeyRow === undefined) {
    if (lineageRow === undefined) return undefined
    const lineage = toGovernedSendErasureLineageRecord(lineageRow)
    return {
      ...base,
      retention: 'erased',
      erasedAt: lineage.destroyedAt,
      erasureEventId: lineage.erasureEventId,
    }
  }
  if (lineageRow !== undefined) return undefined

  const payload: InquiryEncryptedReceiptPayload = {
    envelopeVersion: 'inquiry-receipt-envelope:v1',
    keyRef,
    ciphertextBase64: stringField(row, 'ciphertextBase64'),
    contentIvBase64: stringField(row, 'contentIvBase64'),
  }
  const wrappedKey: InquiryWrappedReceiptKey = {
    keyRef,
    receiptOperationKey: stringField(wrappedKeyRow, 'receiptOperationKey'),
    wrappedKeyBase64: stringField(wrappedKeyRow, 'wrappedKeyBase64'),
    wrapIvBase64: stringField(wrappedKeyRow, 'wrapIvBase64'),
    kekKeyId: stringField(wrappedKeyRow, 'kekKeyId'),
    createdAt: numberField(wrappedKeyRow, 'createdAt'),
  }
  try {
    const canonicalBytesBase64 = await decryptGovernedSendReceipt({ receipt: base, payload, wrappedKey, keyring })
    return { ...base, retention: 'recoverable', canonicalBytesBase64 }
  } catch {
    return undefined
  }
}

export function toGovernedSendIntegrityCommitmentRecord(
  row: RuntimeDocument,
): GovernedSendIntegrityCommitmentRecord {
  const targetBinding = isRecord(row.targetBinding) ? row.targetBinding : {}
  return {
    version: stringField(row, 'version') as 'governed-send-integrity:v1',
    receiptRef: stringField(row, 'receiptRef'),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    digest: stringField(row, 'digest') as `sha256:${string}`,
    keyId: stringField(row, 'keyId'),
    targetBinding: {
      businessId: brandNonEmpty(stringFromUnknown(targetBinding.businessId), 'BusinessId'),
      ownerId: brandNonEmpty(stringFromUnknown(targetBinding.ownerId), 'OwnerId'),
      serviceId: brandNonEmpty(stringFromUnknown(targetBinding.serviceId), 'ServiceId'),
      capabilityKind: stringFromUnknown(targetBinding.capabilityKind) as CapabilityKind,
      claimRef: stringFromUnknown(targetBinding.claimRef),
      recipientRef: stringFromUnknown(targetBinding.recipientRef),
    },
    signature: stringField(row, 'signature') as `hmac-sha256:${string}`,
    createdAt: numberField(row, 'createdAt'),
  }
}

export function toGovernedSendErasureLineageRecord(row: RuntimeDocument): GovernedSendErasureLineageRecord {
  return {
    erasureEventId: stringField(row, 'erasureEventId'),
    receiptOperationKey: brandNonEmpty(stringField(row, 'receiptOperationKey'), 'OperationKey'),
    privacyOperationKey: brandNonEmpty(stringField(row, 'privacyOperationKey'), 'OperationKey'),
    threadId: brandNonEmpty(stringField(row, 'threadId'), 'InquiryThreadId'),
    digest: stringField(row, 'digest') as `sha256:${string}`,
    keyRef: stringField(row, 'keyRef'),
    reasonCode: stringField(row, 'reasonCode'),
    destroyedAt: numberField(row, 'destroyedAt'),
    priorReceiptCommitment: stringField(row, 'priorReceiptCommitment'),
    lineageHash: stringField(row, 'lineageHash'),
  }
}


export function toCapabilityLaunchSupportRecord(row: RuntimeDocument): CapabilityLaunchSupportRecord | undefined {
  if (stringField(row, 'capability') !== 'human_inquiry_owner_inbox') {
    return undefined
  }
  const sourceHash = optionalStringField(row, 'sourceHash')
  const correlationId = optionalStringField(row, 'correlationId')
  if (sourceHash === undefined || correlationId === undefined) {
    return undefined
  }

  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: optionalStringField(row, 'primaryOwnerRef') ?? '',
    primaryAdminOperatorRef: optionalStringField(row, 'primaryAdminOperatorRef') ?? '',
    backupOwnerRef: optionalStringField(row, 'backupOwnerRef') ?? '',
    backupAdminOperatorRef: optionalStringField(row, 'backupAdminOperatorRef') ?? '',
    supportedStage: inquirySupportStage(row),
    supportedChannels: stringArrayField(row, 'supportedChannels').filter(isInquirySupportChannel),
    capacityThreshold: supportCapacityThreshold(row),
    backlogAgeThresholdMs: numberField(row, 'backlogAgeThresholdMs'),
    phaseIncidentCounts: supportIncidentCounts(row),
    supportEscalationPath: optionalStringField(row, 'supportEscalationPath') ?? '',
    claimDisablePath: optionalStringField(row, 'claimDisablePath') ?? '',
    perChannelKillRules: supportKillRules(row),
    evidenceRefs: stringArrayField(row, 'evidenceRefs'),
    sourceHash: brandNonEmpty(sourceHash, 'SourceHash'),
    correlationId: brandNonEmpty(correlationId, 'CorrelationId'),
    lastReviewedAt: numberField(row, 'lastReviewedAt'),
  }
}

function inquirySupportStage(row: RuntimeDocument): CapabilityLaunchSupportRecord['supportedStage'] {
  const value = stringField(row, 'supportedStage')
  return value === 'internal_alpha' || value === 'public_alpha' ? value : 'manual_support'
}

function isInquirySupportChannel(value: string): value is CapabilityLaunchSupportRecord['supportedChannels'][number] {
  return (
    value === 'public_inquiry' ||
    value === 'owner_inbox' ||
    value === 'email_notification' ||
    value === 'provider_readback' ||
    value === 'operator_readback'
  )
}

function supportCapacityThreshold(row: RuntimeDocument): CapabilityLaunchSupportRecord['capacityThreshold'] {
  const value = parseRecordJson(optionalStringField(row, 'capacityThresholdJson'))
  return {
    maxOpenThreads: numberFromRecord(value, 'maxOpenThreads'),
    maxFailedNotifications: numberFromRecord(value, 'maxFailedNotifications'),
  }
}

function supportIncidentCounts(row: RuntimeDocument): CapabilityLaunchSupportRecord['phaseIncidentCounts'] {
  const value = parseRecordJson(optionalStringField(row, 'phaseIncidentCountsJson'))
  return {
    retryExhausted: numberFromRecord(value, 'retryExhausted'),
    noRepair: numberFromRecord(value, 'noRepair'),
    unresolvedDeliveryFailures: numberFromRecord(value, 'unresolvedDeliveryFailures'),
    abuseBlocked: numberFromRecord(value, 'abuseBlocked'),
    privacyDeletes: numberFromRecord(value, 'privacyDeletes'),
  }
}

function supportKillRules(row: RuntimeDocument): CapabilityLaunchSupportRecord['perChannelKillRules'] {
  const value = optionalStringField(row, 'perChannelKillRulesJson')
  if (value === undefined) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isSupportKillRule)
  } catch {
    return []
  }
}

function isSupportKillRule(value: unknown): value is CapabilityLaunchSupportRecord['perChannelKillRules'][number] {
  return (
    isRecord(value) &&
    typeof value.channel === 'string' &&
    (isInquirySupportChannel(value.channel) || value.channel === 'public_claim') &&
    typeof value.trigger === 'string' &&
    typeof value.action === 'string'
  )
}

function parseRecordJson(value: string | undefined): Record<string, unknown> {
  if (value === undefined) {
    return {}
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function numberFromRecord(record: Record<string, unknown>, field: string): number {
  const value = record[field]
  return typeof value === 'number' ? value : 0
}
export function operationNameForResult(resultCode: string): string {
  if (resultCode === 'inquiry_read_marked') {
    return 'markInquiryRead'
  }
  if (resultCode === 'inquiry_replied') {
    return 'replyToInquiry'
  }
  if (resultCode === 'inquiry_closed') {
    return 'closeInquiry'
  }
  if (resultCode === 'inquiry_private_content_deleted') {
    return 'deleteInquiryPrivateContent'
  }
  return 'submitInquiry'
}

export function redactedJson(payload: RedactedPayload) {
  return {
    json: JSON.stringify(payload),
    payloadHash: stableHash(payload),
  }
}

function redactedJsonPayload(row: RuntimeDocument, field: string): RedactedPayload | undefined {
  const value = row[field]
  if (!isRecord(value)) {
    return undefined
  }
  const json = value.json
  if (typeof json !== 'string') {
    return undefined
  }
  return parseJson(json)
}

function redactedJsonHash(row: RuntimeDocument, field: string): string {
  const value = row[field]
  if (!isRecord(value) || typeof value.payloadHash !== 'string') {
    return stableHash(null)
  }
  return value.payloadHash
}

function parseJson(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRedactedPayload(value: unknown): value is RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRedactedPayload)
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
}







export function effectValue(effectRefs: readonly string[], kind: string): string | undefined {
  const prefix = `${kind}:`
  return effectRefs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length)
}

function publicStatus(row: RuntimeDocument): BusinessRecord['publicStatus'] {
  const value = stringField(row, 'publicStatus')
  return value === 'published' || value === 'suppressed' ? value : 'unpublished'
}

function trustTier(row: RuntimeDocument): BusinessRecord['trustTier'] {
  const value = stringField(row, 'trustTier')
  return value === 'contact_confirmed' || value === 'listed' || value === 'registry_verified' ? value : 'claimed'
}

function claimStatus(row: RuntimeDocument): BusinessRecord['claimStatus'] {
  const value = stringField(row, 'claimStatus')
  return value === 'published' || value === 'contested' || value === 'disputed' || value === 'suppressed' || value === 'draft'
    ? value
    : 'authenticated'
}

function claimRecordStatus(row: RuntimeDocument): ClaimRecord['status'] {
  const value = stringField(row, 'status')
  return value === 'published' || value === 'contested' || value === 'disputed' || value === 'suppressed' || value === 'draft'
    ? value
    : 'authenticated'
}

function businessServiceStatus(row: RuntimeDocument): BusinessServiceRecord['status'] {
  const value = stringField(row, 'status')
  return value === 'published' || value === 'suppressed' ? value : 'draft'
}

function capabilityKind(row: RuntimeDocument): CapabilityKind {
  const value = stringField(row, 'kind')
  return CapabilityKindValues.find((candidate) => candidate === value) ?? 'phone_inquiry'
}

function capabilityStatus(row: RuntimeDocument): ServiceCapabilityRecord['status'] {
  const value = stringField(row, 'status')
  return value === 'available' || value === 'degraded' || value === 'stale' ? value : 'unavailable'
}

function firstRequestMode(row: RuntimeDocument): ServiceCapabilityRecord['firstRequest']['mode'] {
  const value = stringField(row, 'firstRequestMode')
  return value === 'inquiry_available' || value === 'quote_request_available' ? value : 'not_available_yet'
}

function publicFirstRequestChannel(row: RuntimeDocument): ServiceCapabilityRecord['firstRequest']['publicChannel'] {
  const value = stringField(row, 'publicChannel')
  return value === 'public_business_contact' || value === 'ae_status_only' ? value : 'not_available'
}

function suppressionTargetType(row: RuntimeDocument) {
  const value = stringField(row, 'targetType')
  return value === 'service' || value === 'capability' ? value : 'business'
}

function suppressionStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'lifted' ? value : 'active'
}

function beforePublicStatus(row: RuntimeDocument) {
  const value = stringField(row, 'beforePublicStatus')
  return value === 'published' || value === 'suppressed' ? value : 'unpublished'
}

function beforeClaimStatus(row: RuntimeDocument) {
  const value = stringField(row, 'beforeClaimStatus')
  return value === 'published' || value === 'contested' || value === 'disputed' || value === 'suppressed' || value === 'draft'
    ? value
    : 'authenticated'
}

function inquiryThreadStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'read' || value === 'replied' || value === 'closed' ? value : 'unread'
}

function inquiryMessageSender(row: RuntimeDocument) {
  return stringField(row, 'sender') === 'owner' ? 'owner' : 'customer'
}

function recipientRole(row: RuntimeDocument) {
  return stringField(row, 'recipientRole') === 'customer' ? 'customer' : 'owner'
}

function inquiryNotificationStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'sent' || value === 'failed' || value === 'held' ? value : 'queued'
}
function inquiryAuditEventType(row: RuntimeDocument): InquiryAuditRecord['eventType'] {
  const value = stringField(row, 'eventType')
  switch (value) {
    case 'inquiry.rejected':
    case 'inquiry.rate_limited':
    case 'inquiry.viewed':
    case 'inquiry.read_marked':
    case 'inquiry.replied':
    case 'inquiry.closed':
    case 'inquiry.private_content_deleted':
      return value
    default:
      return 'inquiry.submitted'
  }
}

function auditActorKind(row: RuntimeDocument): InquiryAuditRecord['actorKind'] {
  const value = stringField(row, 'actorKind')
  return value === 'owner' || value === 'system' ? value : 'anonymous'
}

function inquiryPrivacyTombstoneStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return value === 'requested' || value === 'held' ? value : 'applied'
}

function abuseBucketState(row: RuntimeDocument) {
  return stringField(row, 'state') === 'limited' ? 'limited' : 'open'
}
