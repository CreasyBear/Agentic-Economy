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
  'customerRequests',
  'customerRequestRevisions',
  'customerRequestCompilationCommands',
  'customerRequestPlanRevisions',
  'customerRequestPreparationCommands',
  'customerRequestPreparedActions',
  'serviceCapabilities',
  'claims',
  'operationKeys',
  'sourceWriteNonces',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'registrySearchDocuments',
  'registrySearchSyncAttempts',
  'indexStatus',
  'demandSignals',
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
  'ownerNotificationPreferences',
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
  'answerThreads',
  'answerTurns',
  'answerToolCalls',
  'harnessSessions',
  'harnessSessionEntries',
  'routingKernelAdmissionMeters',
  'routingKernelAdmissionLeases',
  'routingKernelAdmissionDecisions',
  'routingKernelProviderTelemetry',
  'routingKernelQuotes',
  'routingKernelIncidentScopeControls',
  'routingKernelIncidentFreezeOrders',
  'routingKernelIncidentResumeOrders',
  'routingKernelIncidentResumeApprovals',
  'routingKernelIncidentRefinementApprovals',
  'routingKernelIncidentRefinementFacts',
  'routingKernelIncidentRecoveryGrantApprovals',
  'routingKernelIncidentRecoveryGrants',
  'routingKernelIncidentRecoveryUses',
  'routingKernelIncidentEvidenceQuarantines',
  'routingKernelIncidentReconstructionCheckpoints',
  'routingKernelIncidentReconformanceFacts',
  'routingKernelIncidentCanaryRunFacts',
  'routingKernelIncidentDrainSweeps',
  'routingKernelIncidentDrainFacts',
  'routingKernelAgentGrants',
  'routingKernelBindingEvidenceSnapshots',
  'routingKernelBindings',
  'routingKernelQuoteGraphs',
  'routingKernelQuoteGraphSteps',
  'routingKernelAuthorizations',
  'routingKernelBudgetAuthorities',
  'routingKernelSpendReservations',
  'routingKernelDataAuthorizationBudgets',
  'routingKernelDataAllocations',
  'routingKernelDisclosureAttempts',
  'routingKernelProviderCancellations',
  'routingKernelExecutionClaims',
  'routingKernelStepReleases',
  'routingKernelRootRuns',
  'routingKernelLeafRuns',
  'routingKernelProtocolRecords',
] as const

const requiredIndexes = {
  owners: ['by_clerkUserId'],
  ownerNotificationPreferences: ['by_ownerId'],
  businesses: ['by_slug', 'by_owner_updatedAt', 'by_publicStatus_slug'],
  businessServices: ['by_business_status', 'by_slug_serviceSlug'],
  customerRequests: ['by_requestId'],
  customerRequestRevisions: ['by_requestId_and_revision'],
  customerRequestCompilationCommands: ['by_compilationKey', 'by_requestId_and_requestRevision'],
  customerRequestPlanRevisions: ['by_planRevisionId', 'by_requestId_and_requestRevision'],
  customerRequestPreparationCommands: ['by_preparationScope', 'by_preparationKey', 'by_requestId_and_status', 'by_status_and_leaseExpiresAt'],
  customerRequestPreparedActions: ['by_preparedActionId', 'by_preparationScope', 'by_requestId_and_requestRevision', 'by_quoteId'],
  serviceCapabilities: ['by_business_service_status', 'by_business_service_kind'],
  claims: ['by_owner_status', 'by_business_status'],
  operationKeys: ['by_actor_operation_key', 'by_scope_key'],
  registryProjectionItems: ['by_business', 'by_service'],
  registryProjectionAttempts: ['by_business_status', 'by_business_startedAt', 'by_logicalKey'],
  registrySearchDocuments: ['by_documentId', 'by_business', 'by_service', 'by_publicStatus_updatedAt'],
  demandSignals: ['by_sourceSurface_createdAt', 'by_service_suburb_createdAt'],
  registrySearchSyncAttempts: [
    'by_attemptId',
    'by_document_status',
    'by_business_status',
    'by_taskUid',
    'by_status_startedAt',
  ],
  indexStatus: ['by_target', 'by_target_status', 'by_status_lastAttempt'],
  discoveryManifests: ['by_business_generatedAt', 'by_business_version'],
  discoveryManifestAttempts: ['by_attemptId', 'by_business_startedAt', 'by_business_status'],
  auditEvents: ['by_business_createdAt', 'by_correlationId', 'by_eventId'],
  suppressionRules: ['by_target_status'],
  disputes: ['by_business_status'],
  adminMemberships: ['by_clerkUserId_state'],
  operatorControls: ['by_key'],
  abuseRateLimitBuckets: ['by_scope_key_window'],
  claimFingerprints: ['by_fingerprint_status'],
  funnelEvents: [
    'by_session_createdAt',
    'by_business_createdAt',
    'by_eventType_business_correlation_createdAt',
    'by_source_stage',
  ],
  ownerActivationState: ['by_business_stage'],
  inquiryThreads: ['by_threadId', 'by_business_status', 'by_owner_updatedAt', 'by_service_status'],
  inquiryMessages: ['by_messageId', 'by_thread_createdAt'],
  inquiryNotifications: ['by_notificationId', 'by_thread_status', 'by_message_recipient'],
  inquiryReadStates: ['by_owner_thread'],
  inquiryAbuseBuckets: ['by_key_window', 'by_state_resetAt'],
  inquiryPrivacyTombstones: ['by_thread_status', 'by_thread_operationKey', 'by_business_createdAt'],
  notificationDispatches: ['by_dispatchId', 'by_business_status', 'by_inquiry_thread', 'by_provider_status'],
  notificationDispatchAttempts: ['by_attemptId', 'by_dispatch_startedAt', 'by_provider_status'],
  notificationWebhookEvents: ['by_webhookEventId', 'by_provider_event', 'by_dispatch', 'by_status_receivedAt'],
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
  routingKernelAdmissionMeters: ['by_meterKey_and_admittedAt', 'by_admittedAt'],
  routingKernelAdmissionLeases: ['by_requestId', 'by_status_and_expiresAt', 'by_agentId_and_status_and_expiresAt', 'by_expiresAt'],
  routingKernelAdmissionDecisions: ['by_requestId', 'by_disposition_and_decidedAt', 'by_decidedAt'],
  routingKernelProviderTelemetry: ['by_telemetryId', 'by_requestId', 'by_bindingId_and_observedAt', 'by_expiresAt'],
  routingKernelQuotes: ['by_quoteId', 'by_routingRequestId'],
  routingKernelIncidentScopeControls: ['by_scopeKey'],
  routingKernelIncidentFreezeOrders: ['by_freezeOrderId', 'by_scopeKey'],
  routingKernelIncidentResumeOrders: ['by_resumeOrderId', 'by_freezeOrderId'],
  routingKernelIncidentResumeApprovals: ['by_resumeOrderId_approverId', 'by_resumeOrderId'],
  routingKernelIncidentRefinementApprovals: ['by_refinementOrderId_approverId', 'by_refinementOrderId'],
  routingKernelIncidentRefinementFacts: ['by_refinementOrderId', 'by_sourceFreezeOrderId', 'by_replacementFreezeOrderId'],
  routingKernelIncidentRecoveryGrantApprovals: ['by_recoveryGrantId_approverId', 'by_recoveryGrantId'],
  routingKernelIncidentRecoveryGrants: ['by_recoveryGrantId'],
  routingKernelIncidentRecoveryUses: ['by_recoveryGrantId_operationRef', 'by_recoveryGrantId'],
  routingKernelIncidentEvidenceQuarantines: ['by_quarantineId', 'by_evidenceRef'],
  routingKernelIncidentReconstructionCheckpoints: ['by_checkpointId', 'by_scopeKey_recordedAt'],
  routingKernelIncidentReconformanceFacts: ['by_reconformanceFactId', 'by_freezeOrderId_recordedAt'],
  routingKernelIncidentCanaryRunFacts: ['by_canaryRunFactId', 'by_rootRunId', 'by_recoveryGrantId'],
  routingKernelIncidentDrainSweeps: ['by_freezeOrderId'],
  routingKernelIncidentDrainFacts: ['by_drainFactId', 'by_freezeOrderId', 'by_rootRunId'],
  routingKernelAgentGrants: ['by_grantId', 'by_agentId_status'],
  routingKernelBindingEvidenceSnapshots: ['by_snapshotDigest', 'by_networkId_observedAt', 'by_bindingId_observedAt'],
  routingKernelBindings: ['by_bindingId', 'by_networkId_admission_conformance', 'by_businessId'],
  routingKernelQuoteGraphs: ['by_quoteId_rank', 'by_quoteId_bindingId'],
  routingKernelQuoteGraphSteps: ['by_quoteId_graphRank_stepRank', 'by_quoteId_bindingId'],
  routingKernelAuthorizations: ['by_authorizationRef', 'by_quoteId'],
  routingKernelBudgetAuthorities: ['by_budgetAuthorityRef', 'by_sourceGrantId_networkId'],
  routingKernelSpendReservations: ['by_rootRunId', 'by_budgetAuthorityRef_state'],
  routingKernelDataAuthorizationBudgets: ['by_dataAuthorizationBudgetRef', 'by_sourceGrantId_networkId'],
  routingKernelDataAllocations: ['by_rootRunId', 'by_dataAuthorizationBudgetRef_state'],
  routingKernelDisclosureAttempts: ['by_disclosureGrantId', 'by_rootRunId_leafRunId', 'by_dataAuthorizationBudgetRef'],
  routingKernelProviderCancellations: ['by_rootRunId', 'by_cancellationRequestId'],
  routingKernelExecutionClaims: ['by_executionScope', 'by_rootRunId'],
  routingKernelStepReleases: ['by_stepGrantId', 'by_rootRunId_leafRunId'],
  routingKernelRootRuns: ['by_rootRunId', 'by_quoteId'],
  routingKernelLeafRuns: ['by_rootRunId_leafRunId', 'by_rootRunId_bindingId'],
  routingKernelProtocolRecords: ['by_rootRunId_sequence', 'by_recordId'],
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
