import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import type {
  BillingOfferId,
  BillingOperationId,
  BillingProviderEventId,
  BillingReceiptId,
  BillingReconciliationId,
  BillingSupportRecordId,
  BusinessId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'

export const BillingProviderValues = ['autumn_cloud', 'stripe_psp'] as const
export type BillingProvider = (typeof BillingProviderValues)[number]

export const BillingOperationKindValues = ['checkout', 'portal'] as const
export type BillingOperationKind = (typeof BillingOperationKindValues)[number]

export const BillingProviderEventRetrievalStatusValues = ['not_required', 'retrieved', 'failed'] as const
export type BillingProviderEventRetrievalStatus = (typeof BillingProviderEventRetrievalStatusValues)[number]

export const BillingOperationStatusValues = [
  'pending_provider_redirect',
  'paid_active',
  'payment_failed',
  'past_due',
  'required_action',
  'refunded',
  'dispute_hold',
  'chargeback_recorded',
  'billing_cancelled',
  'provider_unavailable',
  'reconciliation_stale',
  'reconciliation_missing',
  'no_repair',
  'paid_activation_disabled',
] as const
export type BillingOperationStatus = (typeof BillingOperationStatusValues)[number]

export const BillingProviderEventStatusValues = [
  'accepted',
  'duplicate',
  'rejected',
  'held_for_operator',
] as const
export type BillingProviderEventStatus = (typeof BillingProviderEventStatusValues)[number]

export const BillingReconciliationStatusValues = [
  'matched',
  'missing',
  'mismatched',
  'provider_unavailable',
  'retry_available',
  'retry_exhausted',
  'no_repair',
] as const
export type BillingReconciliationStatus = (typeof BillingReconciliationStatusValues)[number]

export const BillingOfferStatusValues = ['draft', 'active', 'disabled'] as const
export type BillingOfferStatus = (typeof BillingOfferStatusValues)[number]

export const BillingSupportStatusValues = ['open', 'resolved', 'no_repair'] as const
export type BillingSupportStatus = (typeof BillingSupportStatusValues)[number]

export const BillingSupportCapabilityValues = ['human_inquiry_owner_inbox', 'paid_activation_money_rails'] as const
export type BillingSupportCapability = (typeof BillingSupportCapabilityValues)[number]

export type BillingOffer = {
  id: BillingOfferId
  businessId: BusinessId
  status: BillingOfferStatus
  publicName: string
  publicDescription: string
  publicCtaLabel: string
  planId: string
  provider: 'autumn_cloud'
  priceSummary: string
  termsSummary: string
  sourceHash: SourceHash
  updatedAt: number
}

export type BillingProviderRef = {
  provider: BillingProvider
  objectId: string
  payloadHash: SourceHash
  readAt: number
}

export type BillingOperation = {
  id: BillingOperationId
  businessId: BusinessId
  ownerId: OwnerId
  offerId: BillingOfferId
  operationKey: OperationKey
  correlationId: CorrelationId
  operationKind: BillingOperationKind
  provider: BillingProvider
  status: BillingOperationStatus
  providerCustomerId: string
  providerSessionId?: string
  providerSubscriptionId?: string
  providerRefs: BillingProviderRef[]
  checkoutUrl?: string
  portalUrl?: string
  receiptIds: BillingReceiptId[]
  supportRecordIds: BillingSupportRecordId[]
  returnPath: string
  cancelPath: string
  retryCount: number
  retryAfter?: number
  reason?: string
  evidenceRefs: string[]
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
}

export type BillingReceipt = {
  id: BillingReceiptId
  operationId: BillingOperationId
  businessId: BusinessId
  provider: BillingProvider
  providerReceiptId: string
  invoiceUrl?: string
  amountSummary?: string
  status: 'paid' | 'refunded' | 'disputed' | 'chargeback'
  payloadHash: SourceHash
  providerEvidenceRefs: readonly string[]
  paidStateTransition: string
  refundReversalDisputeRefs: readonly string[]
  correlationId: CorrelationId
  issuedAt: number
  recordedAt: number
}

export type BillingProviderEvent = {
  id: BillingProviderEventId
  provider: BillingProvider
  providerEventId: string
  logicalProviderObjectKey: string
  status: BillingProviderEventStatus
  eventType: string
  providerCustomerId?: string
  providerSubscriptionId?: string
  providerSessionId?: string
  operationId?: BillingOperationId
  businessId?: BusinessId
  payloadHash: SourceHash
  redactedPayloadJson: string
  normalizedFieldsJson: string
  retrievalStatus: BillingProviderEventRetrievalStatus
  signatureVerified: boolean
  correlationId: CorrelationId
  receivedAt: number
  reason?: string
}

export type BillingReconciliation = {
  id: BillingReconciliationId
  operationId?: BillingOperationId
  businessId: BusinessId
  status: BillingReconciliationStatus
  provider: BillingProvider
  retryCount: number
  retryAfter?: number
  actorRef?: string
  reason?: string
  providerRefs: BillingProviderRef[]
  evidenceRefs: string[]
  operatorNextAction: string
  createdAt: number
  updatedAt: number
}

export type BillingSupportRecord = {
  id: BillingSupportRecordId
  operationId?: BillingOperationId
  businessId: BusinessId
  capability?: BillingSupportCapability
  status: BillingSupportStatus
  reason: string
  evidenceRefs: string[]
  primaryOwnerRef?: string
  primaryAdminOperatorRef?: string
  backupOwnerRef?: string
  backupAdminOperatorRef?: string
  supportedStage?: 'internal_alpha' | 'manual_support' | 'public_alpha'
  supportedChannels?: readonly string[]
  capacityThresholdJson?: string
  backlogAgeThresholdMs?: number
  phaseIncidentCountsJson?: string
  supportEscalationPath?: string
  claimDisablePath?: string
  perChannelKillRulesJson?: string
  sourceHash?: SourceHash
  correlationId?: CorrelationId
  lastReviewedAt?: number
  operatorNextAction?: string
  createdAt: number
  updatedAt: number
}

export type BillingSourceState = {
  offers: BillingOffer[]
  operations: BillingOperation[]
  providerEvents: BillingProviderEvent[]
  receipts: BillingReceipt[]
  reconciliations: BillingReconciliation[]
  supportRecords: BillingSupportRecord[]
}

export type BillingOwnerAuthority = {
  ownerId: OwnerId
  businessId: BusinessId
}

export type BillingAdminAuthority = {
  role: 'owner_admin' | 'support' | 'reviewer'
  clerkUserId: string
}

export type BillingOperatorControls = {
  paidActivationEnabled: boolean
  billingWebhooksEnabled: boolean
  billingReconciliationEnabled: boolean
}

export const defaultBillingOperatorControls: BillingOperatorControls = {
  paidActivationEnabled: true,
  billingWebhooksEnabled: true,
  billingReconciliationEnabled: true,
}

const providerRefValidator = v.object({
  provider: literalUnion(BillingProviderValues),
  objectId: v.string(),
  payloadHash: v.string(),
  readAt: v.number(),
})

export const billingTables = {
  billingOffers: defineTable({
    offerId: v.string(),
    businessId: v.id('businesses'),
    status: literalUnion(BillingOfferStatusValues),
    publicName: v.string(),
    publicDescription: v.string(),
    publicCtaLabel: v.string(),
    planId: v.string(),
    provider: v.literal('autumn_cloud'),
    priceSummary: v.string(),
    termsSummary: v.string(),
    sourceHash: v.string(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_offerId', ['offerId']),

  billingOperations: defineTable({
    operationId: v.string(),
    ownerId: v.id('owners'),
    businessId: v.id('businesses'),
    offerId: v.string(),
    sourcePlanQuoteHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    operationKind: literalUnion(BillingOperationKindValues),
    status: literalUnion(BillingOperationStatusValues),
    providerFamily: literalUnion(BillingProviderValues),
    providerCustomerId: v.string(),
    providerSessionId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    sourceControlledReturnUrlKey: v.string(),
    sourceControlledCancelUrlKey: v.string(),
    providerRefs: v.array(providerRefValidator),
    receiptIds: v.array(v.string()),
    supportRecordIds: v.array(v.string()),
    evidenceRefs: v.array(v.string()),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_operationId', ['operationId']),

  billingProviderEvents: defineTable({
    provider: literalUnion(BillingProviderValues),
    providerEventId: v.string(),
    logicalProviderObjectKey: v.string(),
    operationId: v.optional(v.string()),
    businessId: v.optional(v.id('businesses')),
    status: literalUnion(BillingProviderEventStatusValues),
    eventType: v.string(),
    providerCustomerId: v.optional(v.string()),
    providerSubscriptionId: v.optional(v.string()),
    providerSessionId: v.optional(v.string()),
    signatureStatus: v.union(v.literal('verified'), v.literal('unverified')),
    normalizedFieldsJson: v.string(),
    payloadHash: v.string(),
    redactedPayloadJson: v.string(),
    retrievalStatus: literalUnion(BillingProviderEventRetrievalStatusValues),
    correlationId: v.string(),
    receivedAt: v.number(),
    reason: v.optional(v.string()),
  })
    .index('by_provider_event', ['provider', 'providerEventId'])
    .index('by_operation', ['operationId']),

  billingReceipts: defineTable({
    receiptId: v.string(),
    operationId: v.string(),
    businessId: v.id('businesses'),
    provider: literalUnion(BillingProviderValues),
    providerReceiptId: v.string(),
    invoiceUrl: v.optional(v.string()),
    amountSummary: v.optional(v.string()),
    status: v.union(v.literal('paid'), v.literal('refunded'), v.literal('disputed'), v.literal('chargeback')),
    payloadHash: v.string(),
    providerEvidenceRefs: v.array(v.string()),
    paidStateTransition: v.string(),
    refundReversalDisputeRefs: v.array(v.string()),
    correlationId: v.string(),
    issuedAt: v.number(),
    recordedAt: v.number(),
  })
    .index('by_operation', ['operationId'])
    .index('by_business_recordedAt', ['businessId', 'recordedAt']),

  billingReconciliations: defineTable({
    reconciliationId: v.string(),
    operationId: v.optional(v.string()),
    businessId: v.id('businesses'),
    status: literalUnion(BillingReconciliationStatusValues),
    provider: literalUnion(BillingProviderValues),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    actorRef: v.optional(v.string()),
    reason: v.optional(v.string()),
    providerRefs: v.array(providerRefValidator),
    evidenceRefs: v.array(v.string()),
    operatorNextAction: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_operation', ['operationId']),

  capabilityLaunchSupportRecords: defineTable({
    supportRecordId: v.string(),
    operationId: v.optional(v.string()),
    businessId: v.id('businesses'),
    capability: v.optional(literalUnion(BillingSupportCapabilityValues)),
    status: literalUnion(BillingSupportStatusValues),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    primaryOwnerRef: v.optional(v.string()),
    primaryAdminOperatorRef: v.optional(v.string()),
    backupOwnerRef: v.optional(v.string()),
    backupAdminOperatorRef: v.optional(v.string()),
    supportedStage: v.optional(v.union(v.literal('internal_alpha'), v.literal('manual_support'), v.literal('public_alpha'))),
    supportedChannels: v.optional(v.array(v.string())),
    capacityThresholdJson: v.optional(v.string()),
    backlogAgeThresholdMs: v.optional(v.number()),
    phaseIncidentCountsJson: v.optional(v.string()),
    supportEscalationPath: v.optional(v.string()),
    claimDisablePath: v.optional(v.string()),
    perChannelKillRulesJson: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    lastReviewedAt: v.optional(v.number()),
    operatorNextAction: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_operation', ['operationId']),
} as const
