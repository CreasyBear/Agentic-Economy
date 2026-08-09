import type { SourceHash } from '../src/modules/common/ids'
import {
  decryptGovernedSendReceipt,
  InquiryMessageSenderValues,
  InquiryNotificationDispatchStatusValues,
  InquiryNotificationStatusValues,
  InquiryPrivacyTombstoneStatusValues,
  InquiryThreadStatusValues,
  R1TargetAdmissionVersion,
} from '../src/modules/inquiries/public'
import type {
  CapabilityLaunchSupportRecord,
  GovernedSendErasureLineageRecord,
  GovernedSendIntegrityCommitmentRecord,
  GovernedSendReceiptRecord,
  InquiryAuditRecord,
  InquiryCustomerAccessGrant,
  InquiryEncryptedReceiptPayload,
  InquiryFunnelRecord,
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
import type {
  BusinessOwnerRecord,
  BusinessRecord,
  ClaimRecord,
} from '../src/modules/business/public'
import { brandNonEmpty } from '../src/modules/common/ids'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'
import {
  ClaimStatusValues,
  PublicStatusValues,
  TrustTierValues,
  VisibilityTargetTypeValues,
} from '../src/modules/business/public'
import {
  BusinessOfferingStatusValues,
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  OfferingAccessPathStatusValues,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '../src/modules/catalog/public'
import type {
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  OfferingAccessPathDescriptor,
  OfferingAccessPathRecord,
  OfferingPrice,
} from '../src/modules/catalog/public'
import { FunnelEventTypeValues } from '../src/modules/observability/public'
import type {
  AbuseRateLimitBucketRecord,
  SuppressionRuleRecord,
} from '../src/modules/security/public'
import {
  AbuseBucketStateValues,
  SuppressionRuleStatusValues,
} from '../src/modules/security/public'
import { parseRedactedPayload } from '../src/modules/notification-outbox/operator/parse-payload'
import { exactAmountSchema } from '../src/modules/money/public'
import type { RedactedPayload } from '../src/modules/observability/public'

export type InquirySourceDocument = Readonly<Record<string, unknown> & { _id: string }>

const InquiryAuditEventTypeValues = [
  'inquiry.submitted',
  'inquiry.rejected',
  'inquiry.rate_limited',
  'inquiry.viewed',
  'inquiry.read_marked',
  'inquiry.replied',
  'inquiry.closed',
  'inquiry.private_content_deleted',
] as const

export type RedactedJson = {
  json: string
  payloadHash: SourceHash
}

export function redactedJson(value: RedactedPayload): RedactedJson {
  return {
    json: JSON.stringify(value),
    payloadHash: canonicalDigest(value),
  }
}

export function operationNameForResult(resultCode: string): string {
  switch (resultCode) {
    case 'inquiry_submitted':
    case 'inquiry_replayed':
      return 'submitInquiry'
    case 'inquiry_read_marked':
    case 'inquiry_read_replayed':
      return 'markInquiryRead'
    case 'inquiry_replied':
    case 'inquiry_reply_replayed':
      return 'replyToInquiry'
    case 'inquiry_closed':
    case 'inquiry_close_replayed':
      return 'closeInquiry'
    case 'inquiry_private_content_deleted':
    case 'inquiry_private_content_delete_replayed':
      return 'deleteInquiryPrivateContent'
    default:
      return resultCode
  }
}
type InquiryRowScalar = string | number | string[]

function readInquiryRowValue<T extends InquiryRowScalar>(
  row: Record<string, unknown>,
  field: string,
  isValue: (value: unknown) => value is T,
  kind: string,
  errorPrefix: string,
): T {
  const value = row[field]
  if (!isValue(value)) throw new Error(`${errorPrefix}_${kind}_required:${field}`)
  return value
}

export function requiredString(
  row: Record<string, unknown>,
  field: string,
  errorPrefix = 'inquiry_row',
): string {
  return readInquiryRowValue(row, field, (value): value is string => typeof value === 'string' && value.length > 0, 'string', errorPrefix)
}

export function optionalString(
  row: Record<string, unknown>,
  field: string,
  errorPrefix = 'inquiry_row',
): string | undefined {
  return row[field] === undefined ? undefined : requiredString(row, field, errorPrefix)
}

export function requiredNumber(
  row: Record<string, unknown>,
  field: string,
  errorPrefix = 'inquiry_row',
): number {
  return readInquiryRowValue(row, field, (value): value is number => typeof value === 'number' && Number.isFinite(value), 'number', errorPrefix)
}

export function optionalNumber(
  row: Record<string, unknown>,
  field: string,
  errorPrefix = 'inquiry_row',
): number | undefined {
  return row[field] === undefined ? undefined : requiredNumber(row, field, errorPrefix)
}

export function requiredStringArray(
  row: Record<string, unknown>,
  field: string,
  errorPrefix = 'inquiry_row',
): string[] {
  return readInquiryRowValue(row, field, (value): value is string[] =>
    Array.isArray(value) && value.some((item) => typeof item !== 'string') === false, 'string_array', errorPrefix)
}

function requiredRecord(row: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = row[field]
  if (!isRecord(value)) throw new Error(`inquiry_row_record_required:${field}`)
  return value
}
function requiredEnum<T extends string>(row: Record<string, unknown>, field: string, values: readonly T[]): T {
  const value = requiredString(row, field)
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`inquiry_row_enum_required:${field}`)
  return match
}
function requiredExactAmount(row: Record<string, unknown>, field: string) {
  const parsed = exactAmountSchema.safeParse(row[field])
  if (!parsed.success) throw new Error(`inquiry_row_exact_amount_required:${field}`)
  return parsed.data
}

function offeringPrice(row: Record<string, unknown>): OfferingPrice {
  const kind = requiredEnum(row, 'kind', OfferingPriceKindValues)
  const allowedFields = kind === 'quote_only'
    ? ['kind', 'currency', 'unit', 'taxTreatment']
    : kind === 'fixed' || kind === 'from'
      ? ['kind', 'amount', 'unit', 'taxTreatment']
      : ['kind', 'minimum', 'maximum', 'unit', 'taxTreatment']
  if (Object.keys(row).some((field) => !allowedFields.includes(field))) {
    throw new Error('inquiry_row_price_invalid')
  }
  const unit = row.unit === undefined ? undefined : requiredEnum(row, 'unit', OfferingPriceUnitValues)
  const taxTreatment = requiredEnum(row, 'taxTreatment', OfferingPriceTaxTreatmentValues)
  if (kind === 'quote_only') {
    return {
      kind,
      currency: requiredString(row, 'currency'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  if (kind === 'fixed' || kind === 'from') {
    return {
      kind,
      amount: requiredExactAmount(row, 'amount'),
      ...(unit === undefined ? {} : { unit }),
      taxTreatment,
    }
  }
  return {
    kind,
    minimum: requiredExactAmount(row, 'minimum'),
    maximum: requiredExactAmount(row, 'maximum'),
    ...(unit === undefined ? {} : { unit }),
    taxTreatment,
  }
}

function optionalOfferingPrice(row: Record<string, unknown>, field: string): OfferingPrice | undefined {
  return row[field] === undefined ? undefined : offeringPrice(requiredRecord(row, field))
}

function offeringAccessPathDescriptor(row: Record<string, unknown>): OfferingAccessPathDescriptor {
  const kind = requiredString(row, 'kind')
  if (kind === 'human_request') {
    const url = optionalString(row, 'url')
    return {
      kind,
      channel: requiredEnum(row, 'channel', HumanRequestChannelValues),
      disclosure: requiredString(row, 'disclosure'),
      ...(url === undefined ? {} : { url }),
    }
  }
  if (kind === 'external_operation') {
    const method = optionalString(row, 'method')
    const documentationUrl = optionalString(row, 'documentationUrl')
    const authenticationSummary = optionalString(row, 'authenticationSummary')
    const pricingSummary = optionalString(row, 'pricingSummary')
    const interfaceDescription = row.interfaceDescription === undefined
      ? undefined
      : requiredRecord(row, 'interfaceDescription')
    const interfaceUrl = interfaceDescription === undefined ? undefined : optionalString(interfaceDescription, 'url')
    return {
      kind,
      name: requiredString(row, 'name'),
      summary: requiredString(row, 'summary'),
      url: requiredString(row, 'url'),
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined
        ? {}
        : {
            interfaceDescription: {
              format: requiredString(interfaceDescription, 'format'),
              ...(interfaceUrl === undefined ? {} : { url: interfaceUrl }),
            },
          }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance: requiredEnum(row, 'provenance', ExternalOperationProvenanceValues),
    }
  }
  throw new Error('inquiry_row_access_path_descriptor_invalid')
}
export function toBusinessRecord(row: InquirySourceDocument): BusinessRecord {
  const publishedPhone = optionalString(row, 'publishedPhone')
  const suppressedAt = optionalNumber(row, 'suppressedAt')
  return {
    businessId: brandNonEmpty(requiredString(row, '_id'), 'BusinessId'),
    ownerId: brandNonEmpty(requiredString(row, 'ownerId'), 'OwnerId'),
    slug: brandNonEmpty(requiredString(row, 'slug'), 'Slug'),
    name: requiredString(row, 'name'),
    normalizedName: requiredString(row, 'normalizedName'),
    category: requiredString(row, 'category'),
    suburb: requiredString(row, 'suburb'),
    stateTerritory: requiredString(row, 'stateTerritory'),
    ...(publishedPhone === undefined ? {} : { publishedPhone }),
    publicStatus: requiredEnum(row, 'publicStatus', PublicStatusValues),
    trustTier: requiredEnum(row, 'trustTier', TrustTierValues),
    claimStatus: requiredEnum(row, 'claimStatus', ClaimStatusValues),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
    ...(suppressedAt === undefined ? {} : { suppressedAt }),
  }
}

export function toBusinessOwnerRecord(row: InquirySourceDocument): BusinessOwnerRecord {
  const displayName = optionalString(row, 'displayName')
  const emailHash = optionalString(row, 'emailHash')
  return {
    ownerId: brandNonEmpty(requiredString(row, '_id'), 'OwnerId'),
    clerkUserId: requiredString(row, 'clerkUserId'),
    ...(displayName === undefined ? {} : { displayName }),
    ...(emailHash === undefined ? {} : { emailHash }),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export function toClaimRecord(row: InquirySourceDocument): ClaimRecord {
  const businessId = optionalString(row, 'businessId')
  return {
    claimId: brandNonEmpty(requiredString(row, '_id'), 'ClaimId'),
    ownerId: brandNonEmpty(requiredString(row, 'ownerId'), 'OwnerId'),
    ...(businessId === undefined ? {} : { businessId: brandNonEmpty(businessId, 'BusinessId') }),
    slug: brandNonEmpty(requiredString(row, 'slug'), 'Slug'),
    status: requiredEnum(row, 'status', ClaimStatusValues),
    submittedFactsHash: brandNonEmpty(requiredString(row, 'submittedFactsHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export function toResolvableOwnerRecipient(row: InquirySourceDocument): ResolvableOwnerRecipient[] {
  const clerkUserId = requiredString(row, 'clerkUserId').trim()
  const emailHash = optionalString(row, 'emailHash')?.trim()
  if (clerkUserId.length === 0 || emailHash === undefined || emailHash.length === 0) return []
  return [{
    ownerId: brandNonEmpty(requiredString(row, '_id'), 'OwnerId'),
    recipientRef: `clerk-owner-email:${emailHash}`,
    resolvedAt: requiredNumber(row, 'updatedAt'),
  }]
}

export function toBusinessOfferingRecord(row: InquirySourceDocument): BusinessOfferingRecord {
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    currentRevision: requiredNumber(row, 'currentRevision'),
    status: requiredEnum(row, 'status', BusinessOfferingStatusValues),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export function toBusinessOfferingRevisionRecord(row: InquirySourceDocument): BusinessOfferingRevisionRecord {
  const serviceAreaSummary = optionalString(row, 'serviceAreaSummary')
  const availabilitySummary = optionalString(row, 'availabilitySummary')
  const pricingSummary = optionalString(row, 'pricingSummary')
  const price = optionalOfferingPrice(row, 'price')
  return {
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    revision: requiredNumber(row, 'revision'),
    name: requiredString(row, 'name'),
    category: requiredString(row, 'category'),
    summary: requiredString(row, 'summary'),
    ...(serviceAreaSummary === undefined ? {} : { serviceAreaSummary }),
    ...(availabilitySummary === undefined ? {} : { availabilitySummary }),
    ...(pricingSummary === undefined ? {} : { pricingSummary }),
    ...(price === undefined ? {} : { price }),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toOfferingAccessPathRecord(row: InquirySourceDocument): OfferingAccessPathRecord {
  return {
    accessPathRef: brandNonEmpty(requiredString(row, 'accessPathRef'), 'AccessPathRef'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    offeringRef: brandNonEmpty(requiredString(row, 'offeringRef'), 'OfferingRef'),
    offeringRevision: requiredNumber(row, 'offeringRevision'),
    offeringSourceHash: brandNonEmpty(requiredString(row, 'offeringSourceHash'), 'SourceHash'),
    status: requiredEnum(row, 'status', OfferingAccessPathStatusValues),
    descriptor: offeringAccessPathDescriptor(requiredRecord(row, 'descriptor')),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export function toSuppressionRuleRecord(row: InquirySourceDocument): SuppressionRuleRecord {
  const liftedByAdminRef = optionalString(row, 'liftedByAdminRef')
  const liftedReasonCode = optionalString(row, 'liftedReasonCode')
  const liftedEvidenceRefs = row.liftedEvidenceRefs === undefined ? undefined : requiredStringArray(row, 'liftedEvidenceRefs')
  const liftedAt = optionalNumber(row, 'liftedAt')
  return {
    targetType: requiredEnum(row, 'targetType', VisibilityTargetTypeValues),
    targetRef: requiredString(row, 'targetRef'),
    status: requiredEnum(row, 'status', SuppressionRuleStatusValues),
    reasonCode: requiredString(row, 'reasonCode'),
    evidenceRefs: requiredStringArray(row, 'evidenceRefs'),
    createdByAdminRef: requiredString(row, 'createdByAdminRef'),
    createdAt: requiredNumber(row, 'createdAt'),
    beforePublicStatus: requiredEnum(row, 'beforePublicStatus', PublicStatusValues),
    beforeClaimStatus: requiredEnum(row, 'beforeClaimStatus', ClaimStatusValues),
    ...(liftedByAdminRef === undefined ? {} : { liftedByAdminRef }),
    ...(liftedReasonCode === undefined ? {} : { liftedReasonCode }),
    ...(liftedEvidenceRefs === undefined ? {} : { liftedEvidenceRefs }),
    ...(liftedAt === undefined ? {} : { liftedAt }),
  }
}

export function toInquiryThreadRecord(row: InquirySourceDocument): InquiryThreadRecord {
  const customerReplyEmail = optionalString(row, 'customerReplyEmail')
  const readAt = optionalNumber(row, 'readAt')
  const repliedAt = optionalNumber(row, 'repliedAt')
  const closedAt = optionalNumber(row, 'closedAt')
  const originKind = optionalString(row, 'originKind')
  const origin = originKind === undefined
    ? undefined
    : originKind === 'answer_thread'
      ? { kind: 'answer_thread' as const, threadId: requiredString(row, 'originThreadId') }
      : (() => {
          throw new Error('inquiry_row_origin_kind_invalid')
        })()
  if (originKind === 'answer_thread' && origin === undefined) {
    throw new Error('inquiry_row_origin_thread_required')
  }

  const offeringRef = optionalString(row, 'offeringRef')
  const serviceId = optionalString(row, 'serviceId')
  const capabilityKind = optionalString(row, 'capabilityKind')
  const target = offeringRef !== undefined
    ? serviceId === undefined && capabilityKind === undefined
      ? { offeringRef: brandNonEmpty(offeringRef, 'OfferingRef') }
      : (() => {
          throw new Error('inquiry_row_target_shape_invalid')
        })()
    : serviceId !== undefined && capabilityKind !== undefined
      ? {
          serviceId: brandNonEmpty(serviceId, 'ServiceId'),
          capabilityKind,
        }
      : (() => {
          throw new Error('inquiry_row_target_required')
        })()

  return {
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    ownerId: brandNonEmpty(requiredString(row, 'ownerId'), 'OwnerId'),
    ...target,
    status: requiredEnum(row, 'status', InquiryThreadStatusValues),
    firstMessageId: brandNonEmpty(requiredString(row, 'firstMessageId'), 'InquiryMessageId'),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
    version: requiredNumber(row, 'version'),
    ...(customerReplyEmail === undefined ? {} : { customerReplyEmail }),
    ...(readAt === undefined ? {} : { readAt }),
    ...(repliedAt === undefined ? {} : { repliedAt }),
    ...(closedAt === undefined ? {} : { closedAt }),
    ...(origin === undefined ? {} : { origin }),
  }
}

export function toInquiryCustomerAccessGrant(row: InquirySourceDocument): InquiryCustomerAccessGrant {
  const revokedAt = optionalNumber(row, 'revokedAt')
  return {
    accessId: requiredString(row, 'accessId'),
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    scope: 'customer_record',
    version: 'inquiry-customer-access:v1',
    verifier: hmacSha256(requiredString(row, 'verifier')),
    keyId: requiredString(row, 'keyId'),
    status: requiredEnum(row, 'status', ['active', 'revoked']),
    createdAt: requiredNumber(row, 'createdAt'),
    expiresAt: requiredNumber(row, 'expiresAt'),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  }
}

export function toInquiryMessageRecord(row: InquirySourceDocument): InquiryMessageRecord {
  const contactHash = optionalString(row, 'contactHash')
  const redactedContact = row.redactedContact === undefined ? undefined : requiredRecord(row, 'redactedContact')
  const privateDeletedAt = optionalNumber(row, 'privateDeletedAt')
  return {
    messageId: brandNonEmpty(requiredString(row, 'messageId'), 'InquiryMessageId'),
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    sender: requiredEnum(row, 'sender', InquiryMessageSenderValues),
    body: requiredString(row, 'body'),
    bodyHash: brandNonEmpty(requiredString(row, 'bodyHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    ...(contactHash === undefined ? {} : { contactHash: brandNonEmpty(contactHash, 'SourceHash') }),
    ...(redactedContact === undefined ? {} : { redactedContact: parseRedactedPayload(requiredString(redactedContact, 'json')) }),
    ...(privateDeletedAt === undefined ? {} : { privateDeletedAt }),
  }
}

export function toInquiryNotificationRecord(row: InquirySourceDocument): InquiryNotificationRecord {
  const redactedPayload = requiredRecord(row, 'redactedPayload')
  const failureCode = optionalString(row, 'failureCode')
  return {
    notificationId: brandNonEmpty(requiredString(row, 'notificationId'), 'InquiryNotificationId'),
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    messageId: brandNonEmpty(requiredString(row, 'messageId'), 'InquiryMessageId'),
    recipientRole: requiredEnum(row, 'recipientRole', ['owner', 'customer']),
    status: requiredEnum(row, 'status', InquiryNotificationStatusValues),
    redactedPayload: parseRedactedPayload(requiredString(redactedPayload, 'json')),
    payloadHash: brandNonEmpty(requiredString(redactedPayload, 'payloadHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
    ...(failureCode === undefined ? {} : { failureCode }),
    dispatchBindings: inquiryNotificationDispatchBindings(optionalString(row, 'dispatchBindingsJson')),
  }
}

function inquiryNotificationDispatchBindings(value: string | undefined): InquiryNotificationDispatchBinding[] {
  if (value === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('inquiry_row_dispatch_bindings_json_invalid')
  }
  if (!Array.isArray(parsed)) throw new Error('inquiry_row_dispatch_bindings_array_required')
  return parsed.map((item) => inquiryNotificationDispatchBinding(item))
}

function inquiryNotificationDispatchBinding(value: unknown): InquiryNotificationDispatchBinding {
  if (!isRecord(value)) throw new Error('inquiry_row_dispatch_binding_invalid')
  return {
    dispatchId: brandNonEmpty(requiredString(value, 'dispatchId'), 'NotificationDispatchId'),
    providerFamily: requiredEnum(value, 'providerFamily', ['resend', 'novu']),
    status: requiredEnum(value, 'status', InquiryNotificationDispatchStatusValues),
    providerIdempotencyKey: requiredString(value, 'providerIdempotencyKey'),
    payloadHash: brandNonEmpty(requiredString(value, 'payloadHash'), 'SourceHash'),
    operatorNextAction: requiredEnum(value, 'operatorNextAction', [
      'none',
      'retry_available',
      'operator_review_required',
      'terminal',
    ]),
    updatedAt: requiredNumber(value, 'updatedAt'),
  }
}

export function toInquiryPrivacyTombstoneRecord(row: InquirySourceDocument): InquiryPrivacyTombstoneRecord {
  const appliedAt = optionalNumber(row, 'appliedAt')
  return {
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    businessId: brandNonEmpty(requiredString(row, 'businessId'), 'BusinessId'),
    reasonCode: requiredString(row, 'reasonCode'),
    status: requiredEnum(row, 'status', InquiryPrivacyTombstoneStatusValues),
    operationKey: brandNonEmpty(requiredString(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(requiredString(row, 'correlationId'), 'CorrelationId'),
    createdAt: requiredNumber(row, 'createdAt'),
    ...(appliedAt === undefined ? {} : { appliedAt }),
    receiptErasureCount: requiredNumber(row, 'receiptErasureCount'),
    erasureEventIds: requiredStringArray(row, 'erasureEventIds'),
  }
}

export function toInquiryAuditRecord(row: InquirySourceDocument): InquiryAuditRecord | undefined {
  const businessId = optionalString(row, 'businessId')
  const eventType = requiredString(row, 'eventType')
  if (!eventType.startsWith('inquiry.') || businessId === undefined) return undefined
  const beforeState = optionalString(row, 'beforeState')
  const afterState = optionalString(row, 'afterState')
  return {
    eventType: inquiryAuditEventType(eventType),
    actorKind: auditActorKind(requiredString(row, 'actorKind')),
    actorRef: requiredString(row, 'actorRef'),
    targetType: 'inquiry',
    targetRef: requiredString(row, 'targetRef'),
    businessId: brandNonEmpty(businessId, 'BusinessId'),
    operationKey: brandNonEmpty(requiredString(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(requiredString(row, 'correlationId'), 'CorrelationId'),
    ...(beforeState === undefined ? {} : { beforeState }),
    ...(afterState === undefined ? {} : { afterState }),
    redactedPayload: parseRedactedPayload(requiredString(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(requiredString(row, 'payloadHash'), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toInquiryFunnelRecord(row: InquirySourceDocument): InquiryFunnelRecord | undefined {
  const businessId = optionalString(row, 'businessId')
  const rawEventType = requiredString(row, 'eventType')
  if (businessId === undefined || (!rawEventType.startsWith('inquiry') && !rawEventType.startsWith('owner_inquiry'))) return undefined
  const eventType = requiredEnum(row, 'eventType', FunnelEventTypeValues)
  const redactedPayload = parseRedactedPayload(requiredString(row, 'redactedPayloadJson'))
  return {
    eventType,
    businessId: brandNonEmpty(businessId, 'BusinessId'),
    correlationId: brandNonEmpty(requiredString(row, 'correlationId'), 'CorrelationId'),
    pseudonymousSessionId: requiredString(row, 'pseudonymousSessionId'),
    redactedPayload,
    payloadHash: brandNonEmpty(canonicalDigest(redactedPayload), 'SourceHash'),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toInquiryOperationRecord(row: InquirySourceDocument): InquiryOperationRecord {
  if (requiredString(row, 'scope') !== 'inquiry') throw new Error('inquiry_row_operation_scope_invalid')
  const effectRefs = requiredStringArray(row, 'effectRefs')
  const resultCode = effectValue(effectRefs, 'result')
  if (resultCode === undefined) throw new Error('inquiry_row_operation_result_required')
  const threadId = effectValue(effectRefs, 'thread')
  const messageId = effectValue(effectRefs, 'message')
  const notificationId = effectValue(effectRefs, 'notification')
  return {
    operationKey: brandNonEmpty(requiredString(row, 'key'), 'OperationKey'),
    requestHash: brandNonEmpty(requiredString(row, 'requestHash'), 'SourceHash'),
    resultCode,
    ...(threadId === undefined ? {} : { threadId: brandNonEmpty(threadId, 'InquiryThreadId') }),
    ...(messageId === undefined ? {} : { messageId: brandNonEmpty(messageId, 'InquiryMessageId') }),
    ...(notificationId === undefined ? {} : { notificationId: brandNonEmpty(notificationId, 'InquiryNotificationId') }),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toAbuseRateLimitBucketRecord(row: InquirySourceDocument): AbuseRateLimitBucketRecord {
  return {
    scope: 'inquiry_submit',
    key: requiredString(row, 'key'),
    window: requiredString(row, 'window'),
    count: requiredNumber(row, 'count'),
    state: requiredEnum(row, 'state', AbuseBucketStateValues),
    resetAt: requiredNumber(row, 'resetAt'),
    updatedAt: requiredNumber(row, 'updatedAt'),
  }
}

export async function toGovernedSendReceiptRecord(
  row: InquirySourceDocument,
  keyRows: readonly InquirySourceDocument[],
  lineageRows: readonly InquirySourceDocument[],
  keyring: InquiryReceiptKeyring,
): Promise<GovernedSendReceiptRecord | undefined> {
  const proofRow = requiredRecord(row, 'admissionProof')
  if (requiredString(proofRow, 'version') !== R1TargetAdmissionVersion || proofRow.admitted !== true) throw new Error('inquiry_row_admission_proof_invalid')
  const proofDetails = requiredRecord(proofRow, 'proof')
  if (requiredString(proofDetails, 'kind') !== 'claimed_owner') throw new Error('inquiry_row_admission_proof_invalid')
  const destinationVerifiedAt = optionalNumber(proofDetails, 'destinationVerifiedAt')
  const operationKey = brandNonEmpty(requiredString(row, 'operationKey'), 'OperationKey')
  const threadId = brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId')
  const base = {
    digest: sha256Digest(requiredString(row, 'digest')),
    algorithm: 'sha256' as const,
    schemaVersion: requiredNumber(row, 'schemaVersion'),
    createdAt: requiredNumber(row, 'createdAt'),
    operationKey,
    threadId,
    admissionProof: {
      version: R1TargetAdmissionVersion,
      admitted: true as const,
      proof: {
        kind: 'claimed_owner' as const,
        claimRef: requiredString(proofDetails, 'claimRef'),
        recipientRef: requiredString(proofDetails, 'recipientRef'),
        ...(destinationVerifiedAt === undefined ? {} : { destinationVerifiedAt }),
      },
    },
    recipientRef: requiredString(row, 'recipientRef'),
  }
  const keyRef = requiredString(row, 'keyRef')
  const wrappedKeyRow = keyRows.find((candidate) => requiredString(candidate, 'keyRef') === keyRef)
  const matchingLineageRows = lineageRows.filter((candidate) => requiredString(candidate, 'receiptOperationKey') === operationKey)
  if (matchingLineageRows.length > 1) return undefined
  const lineageRow = matchingLineageRows[0]
  if (wrappedKeyRow === undefined) {
    if (lineageRow === undefined) return undefined
    const lineage = toGovernedSendErasureLineageRecord(lineageRow)
    return { ...base, retention: 'erased', erasedAt: lineage.destroyedAt, erasureEventId: lineage.erasureEventId }
  }
  if (lineageRow !== undefined) return undefined
  const payload: InquiryEncryptedReceiptPayload = {
    envelopeVersion: 'inquiry-receipt-envelope:v1',
    keyRef,
    ciphertextBase64: requiredString(row, 'ciphertextBase64'),
    contentIvBase64: requiredString(row, 'contentIvBase64'),
  }
  const wrappedKey: InquiryWrappedReceiptKey = {
    keyRef,
    receiptOperationKey: requiredString(wrappedKeyRow, 'receiptOperationKey'),
    wrappedKeyBase64: requiredString(wrappedKeyRow, 'wrappedKeyBase64'),
    wrapIvBase64: requiredString(wrappedKeyRow, 'wrapIvBase64'),
    kekKeyId: requiredString(wrappedKeyRow, 'kekKeyId'),
    createdAt: requiredNumber(wrappedKeyRow, 'createdAt'),
  }
  try {
    const canonicalBytesBase64 = await decryptGovernedSendReceipt({ receipt: base, payload, wrappedKey, keyring })
    return { ...base, retention: 'recoverable', canonicalBytesBase64 }
  } catch {
    return undefined
  }
}

export function toGovernedSendIntegrityCommitmentRecord(row: InquirySourceDocument): GovernedSendIntegrityCommitmentRecord {
  const targetBinding = requiredRecord(row, 'targetBinding')
  if (requiredString(row, 'version') !== 'governed-send-integrity:v1') throw new Error('inquiry_row_commitment_version_invalid')

  const offeringRef = optionalString(targetBinding, 'offeringRef')
  const serviceId = optionalString(targetBinding, 'serviceId')
  const capabilityKind = optionalString(targetBinding, 'capabilityKind')
  const target = offeringRef !== undefined
    ? serviceId === undefined && capabilityKind === undefined
      ? {
          businessId: brandNonEmpty(requiredString(targetBinding, 'businessId'), 'BusinessId'),
          ownerId: brandNonEmpty(requiredString(targetBinding, 'ownerId'), 'OwnerId'),
          offeringRef: brandNonEmpty(offeringRef, 'OfferingRef'),
          claimRef: requiredString(targetBinding, 'claimRef'),
          recipientRef: requiredString(targetBinding, 'recipientRef'),
        }
      : (() => {
          throw new Error('inquiry_row_commitment_target_shape_invalid')
        })()
    : serviceId !== undefined && capabilityKind !== undefined
      ? {
          businessId: brandNonEmpty(requiredString(targetBinding, 'businessId'), 'BusinessId'),
          ownerId: brandNonEmpty(requiredString(targetBinding, 'ownerId'), 'OwnerId'),
          serviceId: brandNonEmpty(serviceId, 'ServiceId'),
          capabilityKind,
          claimRef: requiredString(targetBinding, 'claimRef'),
          recipientRef: requiredString(targetBinding, 'recipientRef'),
        }
      : (() => {
          throw new Error('inquiry_row_commitment_target_required')
        })()

  return {
    version: 'governed-send-integrity:v1',
    receiptRef: requiredString(row, 'receiptRef'),
    operationKey: brandNonEmpty(requiredString(row, 'operationKey'), 'OperationKey'),
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    digest: sha256Digest(requiredString(row, 'digest')),
    keyId: requiredString(row, 'keyId'),
    targetBinding: target,
    signature: hmacSha256(requiredString(row, 'signature')),
    createdAt: requiredNumber(row, 'createdAt'),
  }
}

export function toGovernedSendErasureLineageRecord(row: InquirySourceDocument): GovernedSendErasureLineageRecord {
  return {
    erasureEventId: requiredString(row, 'erasureEventId'),
    receiptOperationKey: brandNonEmpty(requiredString(row, 'receiptOperationKey'), 'OperationKey'),
    privacyOperationKey: brandNonEmpty(requiredString(row, 'privacyOperationKey'), 'OperationKey'),
    threadId: brandNonEmpty(requiredString(row, 'threadId'), 'InquiryThreadId'),
    digest: sha256Digest(requiredString(row, 'digest')),
    keyRef: requiredString(row, 'keyRef'),
    reasonCode: requiredString(row, 'reasonCode'),
    destroyedAt: requiredNumber(row, 'destroyedAt'),
    priorReceiptCommitment: requiredString(row, 'priorReceiptCommitment'),
    lineageHash: requiredString(row, 'lineageHash'),
  }
}

export function toCapabilityLaunchSupportRecord(row: InquirySourceDocument): CapabilityLaunchSupportRecord | undefined {
  if (requiredString(row, 'capability') !== 'human_inquiry_owner_inbox') return undefined
  return {
    capability: 'human_inquiry_owner_inbox',
    primaryOwnerRef: requiredString(row, 'primaryOwnerRef'),
    primaryAdminOperatorRef: requiredString(row, 'primaryAdminOperatorRef'),
    backupOwnerRef: requiredString(row, 'backupOwnerRef'),
    backupAdminOperatorRef: requiredString(row, 'backupAdminOperatorRef'),
    supportedStage: requiredEnum(row, 'supportedStage', ['internal_alpha', 'public_alpha', 'manual_support']),
    supportedChannels: requiredStringArray(row, 'supportedChannels').map(supportChannel),
    capacityThreshold: supportCapacityThreshold(requiredString(row, 'capacityThresholdJson')),
    backlogAgeThresholdMs: requiredNumber(row, 'backlogAgeThresholdMs'),
    phaseIncidentCounts: supportIncidentCounts(requiredString(row, 'phaseIncidentCountsJson')),
    supportEscalationPath: requiredString(row, 'supportEscalationPath'),
    claimDisablePath: requiredString(row, 'claimDisablePath'),
    perChannelKillRules: supportKillRules(requiredString(row, 'perChannelKillRulesJson')),
    evidenceRefs: requiredStringArray(row, 'evidenceRefs'),
    sourceHash: brandNonEmpty(requiredString(row, 'sourceHash'), 'SourceHash'),
    correlationId: brandNonEmpty(requiredString(row, 'correlationId'), 'CorrelationId'),
    lastReviewedAt: requiredNumber(row, 'lastReviewedAt'),
  }
}

function supportChannel(value: string): CapabilityLaunchSupportRecord['supportedChannels'][number] {
  if (isInquirySupportChannel(value)) return value
  throw new Error('inquiry_row_support_channel_invalid')
}

function isInquirySupportChannel(value: string): value is CapabilityLaunchSupportRecord['supportedChannels'][number] {
  return value === 'public_inquiry' || value === 'owner_inbox' || value === 'email_notification' || value === 'provider_readback' || value === 'operator_readback'
}

function supportCapacityThreshold(value: string): CapabilityLaunchSupportRecord['capacityThreshold'] {
  const parsed = parseRecordJson(value)
  return {
    maxOpenThreads: requiredNumber(parsed, 'maxOpenThreads'),
    maxFailedNotifications: requiredNumber(parsed, 'maxFailedNotifications'),
  }
}

function supportIncidentCounts(value: string): CapabilityLaunchSupportRecord['phaseIncidentCounts'] {
  const parsed = parseRecordJson(value)
  return {
    retryExhausted: requiredNumber(parsed, 'retryExhausted'),
    noRepair: requiredNumber(parsed, 'noRepair'),
    unresolvedDeliveryFailures: requiredNumber(parsed, 'unresolvedDeliveryFailures'),
    abuseBlocked: requiredNumber(parsed, 'abuseBlocked'),
    privacyDeletes: requiredNumber(parsed, 'privacyDeletes'),
  }
}

function supportKillRules(value: string): CapabilityLaunchSupportRecord['perChannelKillRules'] {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('inquiry_row_support_kill_rules_json_invalid')
  }
  if (!Array.isArray(parsed)) throw new Error('inquiry_row_support_kill_rules_array_required')
  return parsed.map(supportKillRule)
}

function supportKillRule(value: unknown): CapabilityLaunchSupportRecord['perChannelKillRules'][number] {
  if (!isRecord(value)) throw new Error('inquiry_row_support_kill_rule_invalid')
  return {
    channel: supportKillRuleChannel(requiredString(value, 'channel')),
    trigger: requiredString(value, 'trigger'),
    action: requiredString(value, 'action'),
  }
}

function supportKillRuleChannel(value: string): CapabilityLaunchSupportRecord['perChannelKillRules'][number]['channel'] {
  if (isInquirySupportChannel(value) || value === 'public_claim') return value
  throw new Error('inquiry_row_support_kill_channel_invalid')
}

function parseRecordJson(value: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('inquiry_row_record_json_invalid')
  }
  if (!isRecord(parsed)) throw new Error('inquiry_row_record_required')
  return parsed
}

function effectValue(effectRefs: readonly string[], kind: string): string | undefined {
  const prefix = `${kind}:`
  return effectRefs.find((ref) => ref.startsWith(prefix))?.slice(prefix.length)
}

function sha256Digest(value: string): `sha256:${string}` {
  if (!isSha256Digest(value)) throw new Error('inquiry_row_sha256_required')
  return value
}

function isSha256Digest(value: string): value is `sha256:${string}` {
  return value.startsWith('sha256:') && value.length > 'sha256:'.length
}

function hmacSha256(value: string): `hmac-sha256:${string}` {
  if (!isHmacSha256(value)) throw new Error('inquiry_row_hmac_sha256_required')
  return value
}

function isHmacSha256(value: string): value is `hmac-sha256:${string}` {
  return value.startsWith('hmac-sha256:') && value.length > 'hmac-sha256:'.length
}

function inquiryAuditEventType(value: string): InquiryAuditRecord['eventType'] {
  const match = InquiryAuditEventTypeValues.find((candidate) => candidate === value)
  if (match === undefined) throw new Error('inquiry_row_audit_event_type_invalid')
  return match
}

function auditActorKind(value: string): InquiryAuditRecord['actorKind'] {
  if (value === 'owner' || value === 'system' || value === 'anonymous') return value
  throw new Error('inquiry_row_audit_actor_kind_invalid')
}
