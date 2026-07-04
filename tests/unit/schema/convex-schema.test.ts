import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import schema from '../../../convex/schema'

const IndexSchema = z.object({
  indexDescriptor: z.string(),
  fields: z.array(z.string()),
})

const SearchIndexSchema = z.object({
  indexDescriptor: z.string(),
  searchField: z.string(),
  filterFields: z.array(z.string()),
})

const TableSchema = z.object({
  tableName: z.string(),
  indexes: z.array(IndexSchema),
  searchIndexes: z.array(SearchIndexSchema).optional(),
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
  'sourceWriteNonces',
  'businessCapabilities',
  'capabilityCheckAttempts',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'registrySearchDocuments',
  'registrySearchSyncAttempts',
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
  'protectedActionNoRepairRecords',
  'protectedActionSupportRecords',
  'agentPrincipals',
  'clearanceMandates',
  'handshakeRecords',
  'handshakeIdempotencyLedger',
  'handshakeStreamEvents',
  'handshakeGatewayChecks',
  'handshakeIsolationStates',
  'billingOffers',
  'billingOperations',
  'billingProviderEvents',
  'billingReceipts',
  'billingReconciliations',
  'capabilityLaunchSupportRecords',
  'businessActionCards',
  'businessActionBuyerMandates',
  'businessActionCapabilityRequests',
  'businessActionAuthorizationCheckpoints',
  'businessActionGuardrailDecisionEvidence',
  'businessActionExternalEvidenceEvents',
  'businessActionResultArtifacts',
  'businessActionReceipts',
  'businessActionPrivateEvidenceRefs',
  'businessActionSupportRecords',
  'businessActionNoRepairRecords',
  'answerThreads',
  'answerTurns',
  'answerToolCalls',
  'harnessSessions',
  'harnessSessionEntries',
] as const

const requiredIndexes = {
  owners: ['by_clerkUserId'],
  businesses: ['by_slug', 'by_publicStatus_slug'],
  businessServices: ['by_business_status', 'by_slug_serviceSlug'],
  serviceCapabilities: ['by_business_service_status', 'by_business_service_kind'],
  claims: ['by_owner_status', 'by_business_status'],
  operationKeys: ['by_actor_operation_key'],
  registryProjectionItems: ['by_business', 'by_service'],
  registryProjectionAttempts: ['by_business_status', 'by_logicalKey'],
  registrySearchDocuments: ['by_documentId', 'by_business', 'by_service', 'by_publicStatus_updatedAt'],
  registrySearchSyncAttempts: [
    'by_attemptId',
    'by_document_status',
    'by_business_status',
    'by_taskUid',
    'by_status_startedAt',
  ],
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
  inquiryPrivacyTombstones: ['by_thread_status', 'by_thread_operationKey', 'by_business_createdAt'],
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
  protectedActionNoRepairRecords: ['by_noRepairId', 'by_proposal', 'by_idempotencyKey'],
  protectedActionSupportRecords: ['by_supportRecordId', 'by_selectedActionSlug', 'by_business'],
  agentPrincipals: ['by_principalId', 'by_signatureAgent_keyid', 'by_status'],
  clearanceMandates: ['by_mandateId', 'by_principalId_and_actionClass_and_actionRef', 'by_status'],
  handshakeRecords: [
    'by_recordId',
    'by_principalId_and_actionClass_and_actionRef',
    'by_status',
    'by_idempotencyKey',
  ],
  handshakeIdempotencyLedger: [
    'by_ledgerKey',
    'by_principalId_and_actionClass_and_actionRef',
    'by_idempotencyKey',
  ],
  handshakeStreamEvents: ['by_streamId_and_sequence', 'by_recordId'],
  handshakeGatewayChecks: ['by_checkId', 'by_principalId_and_actionClass_and_actionRef', 'by_status'],
  handshakeIsolationStates: ['by_isolationId', 'by_principalId', 'by_status'],
  billingOffers: ['by_business_status', 'by_offerId'],
  billingOperations: ['by_business_status', 'by_idempotencyKey', 'by_operationId'],
  billingProviderEvents: ['by_provider_event', 'by_operation'],
  billingReceipts: ['by_operation', 'by_business_recordedAt'],
  billingReconciliations: ['by_business_status', 'by_operation'],
  capabilityLaunchSupportRecords: ['by_business_status', 'by_operation', 'by_supportRecordId'],
  businessActionCards: ['by_cardId', 'by_owner_status', 'by_service_status'],
  businessActionBuyerMandates: ['by_mandateId', 'by_business_status', 'by_idempotencyKey'],
  businessActionCapabilityRequests: [
    'by_requestId',
    'by_card',
    'by_status',
    'by_business_status',
    'by_owner_status',
    'by_idempotencyKey',
  ],
  businessActionAuthorizationCheckpoints: [
    'by_checkpointId',
    'by_request',
    'by_request_decision',
    'by_idempotencyKey',
  ],
  businessActionGuardrailDecisionEvidence: ['by_evidenceId', 'by_request', 'by_decisionHash', 'by_idempotencyKey'],
  businessActionExternalEvidenceEvents: [
    'by_evidenceId',
    'by_request',
    'by_checkpoint',
    'by_provider_ref',
    'by_idempotencyKey',
  ],
  businessActionResultArtifacts: ['by_artifactId', 'by_request', 'by_checkpoint', 'by_idempotencyKey'],
  businessActionReceipts: ['by_receiptId', 'by_request', 'by_idempotencyKey'],
  businessActionPrivateEvidenceRefs: ['by_privateEvidenceRefId', 'by_request', 'by_ttlExpiresAt'],
  businessActionSupportRecords: ['by_supportRecordId', 'by_business_status', 'by_action_status'],
  businessActionNoRepairRecords: ['by_noRepairId', 'by_request', 'by_idempotencyKey'],
  answerThreads: ['by_threadId', 'by_session_updatedAt'],
  answerTurns: ['by_turnId', 'by_thread_createdAt'],
  answerToolCalls: ['by_toolCallId', 'by_turn_seq'],
  harnessSessions: ['by_sessionId', 'by_ownerKey_updatedAt', 'by_lastRunId'],
  harnessSessionEntries: [
    'by_entryId',
    'by_sessionId_seq',
    'by_sessionId_entryId',
    'by_sessionId_idempotencyKey',
    'by_sessionId_parentEntryId',
    'by_idempotencyKey',
    'by_ownerKey_createdAt',
    'by_runId_seq',
    'by_turnId_seq',
  ],
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

  it('defines the public registry search-document index used by Convex search', () => {
    const registrySearchDocuments = exported.tables.find(
      (table) => table.tableName === 'registrySearchDocuments',
    )

    expect(registrySearchDocuments?.searchIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexDescriptor: 'search_searchText_by_publicStatus',
          searchField: 'searchText',
          filterFields: ['publicStatus'],
        }),
      ]),
    )
  })
})
