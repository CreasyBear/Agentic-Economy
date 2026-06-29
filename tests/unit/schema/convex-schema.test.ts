import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import schema from '../../../convex/schema'

const IndexSchema = z.object({
  indexDescriptor: z.string(),
  fields: z.array(z.string()),
})

const TableSchema = z.object({
  tableName: z.string(),
  indexes: z.array(IndexSchema),
})

const SchemaExport = z.object({
  tables: z.array(TableSchema),
})

const durableTables = [
  'owners',
  'businesses',
  'businessContexts',
  'businessServices',
  'serviceCapabilities',
  'claims',
  'operationKeys',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'indexStatus',
  'discoveryManifests',
  'discoveryManifestAttempts',
  'auditEvents',
  'operatorControls',
  'disputes',
  'suppressionRules',
  'adminMemberships',
  'adminMembershipAuditEvents',
  'abuseRateLimitBuckets',
  'claimFingerprints',
  'funnelEvents',
  'ownerActivationState',
  'inquiryThreads',
  'inquiryMessages',
  'inquiryNotifications',
  'inquiryReadStates',
  'inquiryAbuseBuckets',
  'inquiryPrivacyTombstones',
  'notificationDispatches',
  'notificationDispatchAttempts',
  'notificationWebhookEvents',
  'protectedActionProposals',
  'protectedActionPolicyDecisions',
  'protectedActionOwnerDecisions',
  'protectedActionGatewayAdmissions',
  'protectedActionAttempts',
  'protectedActionReceipts',
  'protectedActionPrivateEvidenceRefs',
  'protectedActionSupportRecords',
  'billingOffers',
  'billingOperations',
  'billingProviderEvents',
  'billingReceipts',
  'billingReconciliations',
  'capabilityLaunchSupportRecords',
] as const

const requiredIndexes = {
  owners: ['by_clerkUserId'],
  businesses: ['by_slug', 'by_publicStatus_slug'],
  businessServices: ['by_business_status', 'by_slug_serviceSlug'],
  serviceCapabilities: ['by_business_service_status'],
  claims: ['by_owner_status', 'by_business_status'],
  operationKeys: ['by_actor_operation_key'],
  registryProjectionItems: ['by_business', 'by_service'],
  registryProjectionAttempts: ['by_business_status', 'by_logicalKey'],
  indexStatus: ['by_target_status', 'by_status_lastAttempt'],
  discoveryManifests: ['by_business_version'],
  discoveryManifestAttempts: ['by_business_status'],
  auditEvents: ['by_business_createdAt', 'by_correlationId'],
  suppressionRules: ['by_target_status'],
  disputes: ['by_business_status'],
  adminMemberships: ['by_clerkUserId_state'],
  operatorControls: ['by_key'],
  abuseRateLimitBuckets: ['by_scope_key_window'],
  claimFingerprints: ['by_fingerprint_status'],
  funnelEvents: ['by_session_createdAt', 'by_business_createdAt', 'by_source_stage'],
  ownerActivationState: ['by_business_stage'],
  inquiryThreads: ['by_threadId', 'by_business_status', 'by_owner_updatedAt', 'by_service_status'],
  inquiryMessages: ['by_messageId', 'by_thread_createdAt'],
  inquiryNotifications: ['by_notificationId', 'by_thread_status', 'by_message_recipient'],
  inquiryReadStates: ['by_owner_thread'],
  inquiryAbuseBuckets: ['by_key_window', 'by_state_resetAt'],
  inquiryPrivacyTombstones: ['by_thread_status', 'by_business_createdAt'],
  notificationDispatches: ['by_dispatchId', 'by_business_status', 'by_inquiry_thread', 'by_provider_status'],
  notificationDispatchAttempts: ['by_dispatch_startedAt', 'by_provider_status'],
  notificationWebhookEvents: ['by_provider_event', 'by_dispatch', 'by_status_receivedAt'],
  protectedActionProposals: ['by_proposalId', 'by_owner_status', 'by_business_status', 'by_idempotencyKey'],
  protectedActionPolicyDecisions: ['by_proposal', 'by_policyHash'],
  protectedActionOwnerDecisions: ['by_proposal', 'by_owner_decidedAt', 'by_idempotencyKey'],
  protectedActionGatewayAdmissions: ['by_gatewayAdmissionId', 'by_proposal_status', 'by_idempotencyKey'],
  protectedActionAttempts: ['by_attemptId', 'by_proposal', 'by_business_outcome', 'by_idempotencyKey'],
  protectedActionReceipts: ['by_receiptId', 'by_attempt', 'by_proposal'],
  protectedActionPrivateEvidenceRefs: ['by_privateEvidenceRefId', 'by_proposal', 'by_ttlExpiresAt'],
  protectedActionSupportRecords: ['by_supportRecordId', 'by_selectedActionSlug', 'by_business'],
  billingOffers: ['by_business_status', 'by_offerId'],
  billingOperations: ['by_business_status', 'by_idempotencyKey', 'by_operationId'],
  billingProviderEvents: ['by_provider_event', 'by_operation'],
  billingReceipts: ['by_operation', 'by_business_recordedAt'],
  billingReconciliations: ['by_business_status', 'by_operation'],
  capabilityLaunchSupportRecords: ['by_business_status', 'by_operation'],
} satisfies Record<string, readonly string[]>

describe('Convex schema', () => {
  const exportSchema = Reflect.get(schema, 'export')
  if (typeof exportSchema !== 'function') {
    throw new Error('Convex schema export function is unavailable')
  }
  const exported = SchemaExport.parse(JSON.parse(String(exportSchema.call(schema))))

  it('contains exactly the source-owned durable tables', () => {
    expect(exported.tables.map((table) => table.tableName).sort()).toEqual([...durableTables].sort())
  })

  it('defines every required source-owned index', () => {
    const tableIndexes = Object.fromEntries(
      exported.tables.map((table) => [table.tableName, table.indexes.map((index) => index.indexDescriptor)])
    )

    for (const [tableName, indexes] of Object.entries(requiredIndexes)) {
      expect(tableIndexes[tableName]).toEqual(expect.arrayContaining(indexes))
    }
  })
})
