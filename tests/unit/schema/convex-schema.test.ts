/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
} from '@/modules/action-invocation'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import schema from '../../../convex/schema'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

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
  'businessOfferings',
  'businessOfferingRevisions',
  'offeringAccessPaths',
  'moneyAccounts',
  'moneyLedgerEntries',
  'moneyTransactions',
  'moneyUsageEvents',
  'moneyCredentialUsageSummaries',
  'moneyFreeTierCounters',
  'moneyTopupCommands',
  'moneyStripeEvents',
  'moneyPayoutAccounts',
  'moneyPayouts',
  'businessSupplyProjectionSnapshots',
  'capabilityLaunchSupportRecords',
  'capabilityContractDocuments',
  'capabilityOfferings',
  'capabilityPublications',
  'capabilityTransportBindings',
  'capabilityCallEvents',
  'registeredOperationMappings',
  'customerRequestAgentPrincipals',
  'customerRequestAgentOAuthClients',
  'customerRequestAgentOAuthGrants',
  'customerRequestCapabilityContracts',
  'customerRequestHeads',
  'customerRequestSnapshots',
  'customerRequestCommands',
  'customerRequestEvaluations',
  'customerRequestEvaluationCandidates',
  'customerRequestEvaluationPreparations',
  'customerRequests',
  'customerRequestRevisions',
  'projectSpine',
  'projectSpineEvents',
  'projectSpineQuotes',
  'customerRequestCompilationCommands',
  'customerRequestPlanRevisions',
  'customerRequestRouteMandateIssues',
  'customerRequestRouteMandateHeads',
  'customerRequestRouteMandateCommands',
  'customerRequestRouteMandateRevocations',
  'customerRequestRouteMandateRevocationCommands',
  'customerRequestRouteStepReservations',
  'customerRequestRouteDataReservations',
  'customerRequestRouteStepAdmissionCommands',
  'customerRequestRouteRuns',
  'customerRequestRouteRunHeads',
  'customerRequestRouteRunCommands',
  'customerRequestRouteCancellationCommands',
  'customerRequestRouteProblemReports',
  'customerRequestRouteProblemUpdates',
  'customerRequestRouteStepAttempts',
  'customerRequestRouteDispatchOutbox',
  'customerRequestX402PaymentAttempts',
  'customerRequestV2Heads',
  'customerRequestV2Revisions',
  'customerRequestV2RoutePlanGenerations',
  'customerRequestV2RoutePlanHeads',
  'customerRequestV2Commands',
  'customerRequestV2RoutePlanGenerationCommands',
  'customerRequestV2ActionPreparations',
  'customerRequestV2PreparationCommands',
  'customerRequestV2PreparationDisclosureReviews',
  'customerRequestV2PreparationApprovalEvidence',
  'customerRequestV2PreparationAuthorityReservations',
  'customerRequestV2PreparationEgressConsumption',
  'customerRequestV2PreparationEgressCommands',
  'customerRequestV2PreparationEgressOperations',
  'customerRequestV2PreparationDisclosureAllocations',
  'customerRequestV2PreparationReconciliationObservations',
  'customerRequestV2PreparedActions',
  'customerRequestV2PreparedActionRecoveries',
  'customerRequestV2PreparedActionCommands',
  'customerRequestV2ApprovalGrants',
  'customerRequestV2ApprovalGrantCommands',
  'customerRequestV2ActionAttempts',
  'customerRequestV2ActionAuthorityBudgets',
  'customerRequestV2ApprovalGrantConsumptions',
  'customerRequestV2ActionAttemptIdempotencyClaims',
  'customerRequestV2ActionAttemptSpendReservations',
  'customerRequestV2ActionAttemptDataReservations',
  'customerRequestV2ProviderReleaseGrants',
  'customerRequestV2ActionDisclosureGrants',
  'customerRequestV2ActionAttemptReleases',
  'customerRequestV2ProviderOutcomes',
  'customerRequestV2ProviderRootRuns',
  'customerRequestV2ProviderLeafRuns',
  'customerRequestV2ProviderProtocolEvidence',
  'customerRequestV2ProviderReconciliationObservations',
  'customerRequestV2ActionAttemptResolutions',
  'customerRequestV2ProviderReconciliationCommands',
  'customerRequestV2ActionAttemptAdmissionCommands',
  'customerRequestPreparationCommands',
  'customerRequestPreparedActions',
  'customerRequestPreparationAuthorities',
  'customerRequestPreparationDisclosureAllocations',
  'customerRequestPreparationDisclosureRecipients',
  'customerRequestPreparationAuthorityUses',
  'customerRequestPreparationDisclosureExposures',
  'claims',
  'operationKeys',
  'sourceWriteNonces',
  'studies',
  'studyEvents',
  'registryProjectionItems',
  'registryProjectionAttempts',
  'registrySearchDocuments',
  'indexStatus',
  'demandSignals',
  'searchGapRecords',
  'searchGapBusinessRecords',
  'discoveryManifests',
  'discoveryManifestAttempts',
  'auditEvents',
  'operatorControls',
  'disputes',
  'suppressionRules',
  'adminMemberships',
  'adminMembershipAuditEvents',
  'claimFingerprints',
  'funnelEvents',
  'ownerNotificationPreferences',
  'ownerActivationState',
  'inquiryThreads',
  'inquiryCustomerAccessGrants',
  'inquiryMessages',
  'inquiryNotifications',
  'inquiryReadStates',
  'inquiryAbuseBuckets',
  'inquiryPrivacyTombstones',
  'governedSendReceipts',
  'governedSendIntegrityCommitments',
  'governedSendReceiptKeys',
  'governedSendErasureLineage',
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
  'routingKernelPreparationCandidateSets',
  'routingKernelPreparationCandidates',
  'routingKernelPreparationQuoteAttempts',
  'routingKernelPreparationQuoteAttemptFields',
  'routingKernelProviderOffers',
  'routingKernelProviderOfferExecutionFields',
  'routingKernelProviderOfferMaterialTerms',
  'actionInvocationControls',
  'actionInvocationAttempts',
  'actionInvocationHistory',
  'customerRequestRouteCancellationAttempts',
  'customerRequestRouteProblemBusinessReports',
  'customerRequestStandingRoutePolicyIssues',
  'customerRequestStandingRoutePolicyCommands',
  'customerRequestStandingRoutePolicyRevocations',
  'customerRequestStandingRoutePolicyRevocationCommands',
  'customerRequestStandingRouteAuthorityUses',
  'customerRequestStandingRouteAuthorityUseCommands',
  'customerRequestV2SubmissionShells',
  'workTreeApprovals',
  'workTreeDecisionReceipts',
  'workTreeEvents',
  'workTreeRepeatPermissions',
  'workTreeRepeatUses',
  'workTrees',
  'externalRunEvidence',
  'externalRunManifests',
  'externalRunStarts',
  'externalRunGateDecisions',
] as const

const requiredIndexes = {
  moneyAccounts: ['by_accountRef', 'by_principalId_and_currency', 'by_businessId_and_currency'],
  moneyTransactions: ['by_idempotencyKey', 'by_transactionRef', 'by_principalId_and_createdAt', 'by_externalRef', 'by_reversalOf'],
  moneyUsageEvents: ['by_principalId_and_credentialId_and_currency_and_observedAt', 'by_businessId_and_observedAt', 'by_invocationRef', 'by_usageRef'],
  moneyCredentialUsageSummaries: ['by_principalId_and_credentialId_and_currency'],
  moneyFreeTierCounters: ['by_principalId_and_offeringRef_and_windowStart', 'by_offeringRef_and_windowStart'],
  moneyTopupCommands: ['by_commandRef', 'by_idempotencyKey', 'by_externalRef'],
  moneyStripeEvents: ['by_stripeEventId'],
  moneyPayoutAccounts: ['by_businessId_and_currency'],
  moneyPayouts: ['by_businessId_and_currency_and_state', 'by_periodStart_and_state', 'by_stripeTransferId', 'by_payoutRef', 'by_businessId_and_currency_and_updatedAt'],
  owners: ['by_clerkUserId'],
  ownerNotificationPreferences: ['by_ownerId'],
  businesses: ['by_slug', 'by_owner_updatedAt', 'by_publicStatus_slug'],
  businessOfferings: ['by_offeringRef', 'by_businessId_and_status'],
  businessOfferingRevisions: ['by_offeringRef_and_revision', 'by_businessId_and_createdAt'],
  offeringAccessPaths: [
    'by_accessPathRef',
    'by_offeringRef_and_status',
    'by_offeringRef_and_offeringRevision',
    'by_businessId_and_status',
  ],
  businessSupplyProjectionSnapshots: ['by_businessId'],
  customerRequestHeads: ['by_requestId'],
  customerRequestRouteMandateIssues: ['by_mandateRef', 'by_requestId_and_recordedAt'],
  customerRequestRouteMandateHeads: ['by_requestId'],
  customerRequestRouteMandateCommands: ['by_commandKey'],
  customerRequestRouteMandateRevocations: [
    'by_revocationRef', 'by_mandateRef', 'by_requestId_and_recordedAt',
  ],
  customerRequestRouteMandateRevocationCommands: ['by_commandKey'],
  customerRequestRouteStepReservations: [
    'by_reservationRef', 'by_mandateRef_and_actionId', 'by_mandateRef_and_recordedAt',
  ],
  customerRequestRouteDataReservations: [
    'by_allocationRef', 'by_reservationRef', 'by_mandateRef_and_recordedAt',
  ],
  customerRequestRouteStepAdmissionCommands: ['by_commandKey'],
  customerRequestRouteRuns: ['by_runRef', 'by_requestId', 'by_mandateRef'],
  customerRequestRouteRunHeads: ['by_requestId'],
  customerRequestRouteRunCommands: ['by_commandKey'],
  customerRequestRouteCancellationCommands: ['by_commandKey'],
  customerRequestRouteProblemReports: ['by_commandKey', 'by_reportRef', 'by_requestId'],
  customerRequestRouteProblemUpdates: ['by_commandKey', 'by_reportRef_and_version'],
  customerRequestRouteStepAttempts: [
    'by_attemptRef', 'by_runRef_and_position', 'by_mandateRef_and_actionId',
  ],
  customerRequestRouteDispatchOutbox: [
    'by_dispatchRef', 'by_attemptRef', 'by_state_and_availableAt',
  ],
  customerRequestV2Heads: ['by_requestId'],
  customerRequestV2Revisions: ['by_requestId_and_requestRevision'],
  customerRequestV2RoutePlanGenerations: [
    'by_generationRef', 'by_requestId_and_generation', 'by_requestId_and_generationRef',
  ],
  customerRequestV2RoutePlanHeads: ['by_requestId'],
  customerRequestV2Commands: ['by_commandKey', 'by_requestId_and_resultingRevision'],
  customerRequestV2RoutePlanGenerationCommands: [
    'by_commandKey', 'by_requestId_and_resultingGeneration',
  ],
  customerRequestV2ActionPreparations: ['by_preparationRef', 'by_requestId_and_requestRevision_and_actionId'],
  customerRequestV2PreparationCommands: ['by_commandKey'],
  customerRequestV2PreparationDisclosureReviews: ['by_reviewRef'],
  customerRequestV2PreparationApprovalEvidence: ['by_approvalRef', 'by_preparationRef'],
  customerRequestV2PreparationAuthorityReservations: ['by_reservationRef', 'by_authorityReference'],
  customerRequestV2PreparationEgressConsumption: ['by_authorityReference'],
  customerRequestV2PreparationEgressCommands: ['by_commandKey'],
  customerRequestV2PreparationEgressOperations: [
    'by_operationRef', 'by_preparationRef', 'by_requestId_and_principalId', 'by_authorityReference',
  ],
  customerRequestV2PreparationDisclosureAllocations: [
    'by_allocationRef', 'by_operationRef', 'by_authorityReference',
  ],
  customerRequestV2PreparationReconciliationObservations: ['by_observationRef', 'by_operationRef'],
  customerRequestV2PreparedActions: [
    'by_preparedActionRef', 'by_preparationRef', 'by_requestId_and_requestRevision_and_actionId',
  ],
  customerRequestV2PreparedActionRecoveries: ['by_recoveryRef', 'by_preparationRef'],
  customerRequestV2PreparedActionCommands: ['by_commandKey'],
  customerRequestV2ApprovalGrants: [
    'by_approvalGrantRef', 'by_preparedActionRef', 'by_requestId_and_requestRevision_and_actionId',
  ],
  customerRequestV2ApprovalGrantCommands: ['by_commandKey'],
  customerRequestV2ActionAttempts: [
    'by_actionAttemptRef', 'by_approvalGrantRef', 'by_requestId_and_requestRevision_and_actionId',
  ],
  customerRequestV2ActionAuthorityBudgets: [
    'by_authorityBudgetRef', 'by_requestId_and_requestRevision_and_actionId',
  ],
  customerRequestV2ApprovalGrantConsumptions: ['by_consumptionRef', 'by_approvalGrantRef'],
  customerRequestV2ActionAttemptIdempotencyClaims: ['by_idempotencyClaimRef', 'by_admissionKeyDigest'],
  customerRequestV2ActionAttemptSpendReservations: ['by_spendReservationRef', 'by_actionAttemptRef'],
  customerRequestV2ActionAttemptDataReservations: ['by_dataReservationRef', 'by_actionAttemptRef'],
  customerRequestV2ProviderReleaseGrants: ['by_providerReleaseGrantRef', 'by_actionAttemptRef'],
  customerRequestV2ActionDisclosureGrants: ['by_disclosureGrantRef', 'by_actionAttemptRef'],
  customerRequestV2ActionAttemptReleases: [
    'by_commandKey', 'by_actionAttemptRef', 'by_providerReleaseGrantRef',
    'by_disclosureGrantRef', 'by_envelopeRef',
  ],
  customerRequestV2ProviderOutcomes: ['by_commandKey', 'by_actionAttemptRef', 'by_outcomeRef'],
  customerRequestV2ProviderRootRuns: ['by_rootRunRef', 'by_outcomeRef'],
  customerRequestV2ProviderLeafRuns: ['by_leafRunRef', 'by_outcomeRef'],
  customerRequestV2ProviderProtocolEvidence: ['by_protocolEvidenceRef', 'by_outcomeRef'],
  customerRequestV2ProviderReconciliationObservations: [
    'by_observationRef', 'by_providerEvidenceIdentityDigest',
    'by_actionAttemptRef_and_recordedAt',
  ],
  customerRequestV2ActionAttemptResolutions: [
    'by_resolutionRef', 'by_actionAttemptRef', 'by_requestId_and_requestRevision_and_actionId',
  ],
  customerRequestV2ProviderReconciliationCommands: ['by_commandKey'],
  customerRequestV2ActionAttemptAdmissionCommands: ['by_commandKey', 'by_resultRef'],
  customerRequestSnapshots: ['by_requestId_and_revision'],
  customerRequestCommands: ['by_commandKey', 'by_requestId_and_resultingRevision'],
  customerRequestEvaluations: ['by_evaluationId', 'by_requestId_and_requestRevision'],
  customerRequestEvaluationCandidates: ['by_evaluationId', 'by_candidateRef'],
  customerRequestEvaluationPreparations: ['by_preparationKey', 'by_requestId_and_requestRevision'],
  customerRequests: ['by_requestId'],
  customerRequestRevisions: ['by_requestId_and_revision'],
  customerRequestCompilationCommands: ['by_compilationKey', 'by_requestId_and_requestRevision'],
  customerRequestPlanRevisions: ['by_planRevisionId', 'by_requestId_and_requestRevision'],
  customerRequestPreparationCommands: ['by_preparationScope', 'by_preparationKey', 'by_requestId_and_status', 'by_status_and_leaseExpiresAt'],
  customerRequestPreparedActions: ['by_preparedActionId', 'by_preparationScope', 'by_requestId_and_requestRevision', 'by_quoteId'],
  customerRequestPreparationAuthorities: ['by_authorityId', 'by_requestId_and_status', 'by_status_and_expiresAt'],
  customerRequestPreparationDisclosureAllocations: [
    'by_allocationId', 'by_operationKey', 'by_authorityId_and_allocatedAt', 'by_requestId_and_requestRevision',
  ],
  customerRequestPreparationDisclosureRecipients: ['by_authorityId_and_recipientBindingId'],
  customerRequestPreparationAuthorityUses: ['by_authorityId_and_authorityUseKey'],
  customerRequestPreparationDisclosureExposures: [
    'by_authorityId_and_recipientBindingId_and_purpose_and_field', 'by_authorityId_and_firstAllocatedAt',
  ],
  claims: ['by_owner_status', 'by_business_status'],
  operationKeys: ['by_actor_operation_key', 'by_scope_key'],
  registryProjectionItems: ['by_business', 'by_offering'],
  registryProjectionAttempts: ['by_business_status', 'by_business_startedAt', 'by_logicalKey'],
  registrySearchDocuments: ['by_documentId', 'by_business', 'by_offering', 'by_publicStatus_updatedAt'],
  demandSignals: ['by_sourceSurface_createdAt', 'by_service_suburb_createdAt'],
  indexStatus: ['by_target', 'by_target_status', 'by_status_lastAttempt'],
  discoveryManifests: ['by_business_generatedAt', 'by_business_version'],
  discoveryManifestAttempts: ['by_attemptId', 'by_business_startedAt', 'by_business_status'],
  auditEvents: ['by_business_createdAt', 'by_correlationId', 'by_eventId'],
  suppressionRules: ['by_target_status'],
  disputes: ['by_business_status'],
  adminMemberships: ['by_clerkUserId_state'],
  operatorControls: ['by_key'],
  claimFingerprints: ['by_fingerprint_status'],
  funnelEvents: [
    'by_session_createdAt',
    'by_business_createdAt',
    'by_eventType_business_correlation_createdAt',
    'by_source_stage',
  ],
  ownerActivationState: ['by_business_stage'],
  inquiryThreads: ['by_threadId', 'by_business_status', 'by_owner_updatedAt', 'by_offering_status'],
  inquiryCustomerAccessGrants: ['by_accessId', 'by_thread_status'],
  inquiryMessages: ['by_messageId', 'by_thread_createdAt'],
  inquiryNotifications: ['by_notificationId', 'by_thread_status', 'by_message_recipient'],
  inquiryReadStates: ['by_owner_thread'],
  inquiryPrivacyTombstones: ['by_thread_status', 'by_thread_operationKey', 'by_business_createdAt'],
  governedSendReceipts: ['by_operationKey', 'by_threadId_and_createdAt'],
  governedSendIntegrityCommitments: ['by_operationKey', 'by_threadId', 'by_receiptRef'],
  governedSendReceiptKeys: ['by_keyRef', 'by_receiptOperationKey'],
  governedSendErasureLineage: ['by_erasureEventId', 'by_receiptOperationKey', 'by_thread_destroyedAt'],
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
  customerRequestAgentPrincipals: ['by_principalId', 'by_credentialId'],
  customerRequestCapabilityContracts: ['by_capabilityContractId', 'by_status_and_capabilityContractId'],
  capabilityLaunchSupportRecords: ['by_supportRecordId'],
  capabilityContractDocuments: ['by_capabilityId_and_version', 'by_status_and_capabilityId_and_version'],
  capabilityPublications: [
    'by_publicationRef_and_revision',
    'by_networkId_and_disposition',
    'by_businessId_and_disposition',
    'by_bindingId_and_disposition',
  ],
  capabilityOfferings: [
    'by_offeringId',
    'by_businessId_and_status',
    'by_networkId_status_capabilityId_version_contractDigest',
  ],
  capabilityTransportBindings: [
    'by_bindingId',
    'by_offeringId_and_admission_and_conformance',
    'by_networkId_admission_conformance',
  ],
  capabilityCallEvents: ['by_businessId_and_observedAt', 'by_taskDigest_and_observedAt', 'by_eventRef'],
  registeredOperationMappings: ['by_networkId_and_mappingRef'],
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
  routingKernelPreparationCandidateSets: [
    'by_preparationRequestId', 'by_candidateSetDigest', 'by_customerRequestId_planRevisionId_actionId_generation',
    'by_customerRequestId_sourceKind_sourceRef_generation',
  ],
  routingKernelPreparationCandidates: ['by_preparationRequestId_and_position', 'by_candidateSetDigest_and_bindingId'],
  routingKernelPreparationQuoteAttempts: ['by_quoteAttemptId', 'by_commandDigest', 'by_candidateSetDigest_and_recipientBindingId'],
  routingKernelPreparationQuoteAttemptFields: ['by_quoteAttemptId_and_position'],
  routingKernelProviderOffers: ['by_providerOfferId', 'by_quoteAttemptId', 'by_candidateSetDigest_and_issuerBindingId'],
  routingKernelProviderOfferExecutionFields: ['by_providerOfferId_and_position'],
  routingKernelProviderOfferMaterialTerms: ['by_providerOfferId_and_position'],
  externalRunGateDecisions: ['by_runId'],
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
  it('rejects the exact historical aggregate registry search document shape after narrow', async () => {
    const backend = convexTest(schema, convexModules)
    const observedAt = 1_784_764_800_000
    const businessId = await backend.run(async (ctx) => {
      const ownerId = await ctx.db.insert('owners', {
        clerkUserId: 'user_registry_schema_compatibility',
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      return ctx.db.insert('businesses', {
        ownerId,
        slug: 'sandbox-phase5-web-starter',
        name: 'Phase 5 Demo Website Starter',
        normalizedName: 'phase 5 demo website starter',
        category: 'Website development',
        suburb: 'Perth',
        stateTerritory: 'WA',
        publicStatus: 'published',
        trustTier: 'listed',
        claimStatus: 'published',
        sourceHash: 'hash:business',
        createdAt: observedAt,
        updatedAt: observedAt,
      })
    })
    const historicalAggregateDocument = {
      businessCategory: 'Website development',
      businessId,
      businessName: 'Phase 5 Demo Website Starter',
      businessSlug: 'sandbox-phase5-web-starter',
      documentId: 'offering-v2__mx70wew6em0t0jwp35zsv4thd58b2fj4',
      generatedHash: 'hash:6643888a',
      observedAt,
      offerings: [{
        category: 'Website development',
        comparison: {
          schemaVersion: 'offering-comparison:v1',
          profile: {
            priceBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: {
                amountMinor: 85_000,
                currency: 'AUD',
                description: 'Labelled demo fixed scope',
                unit: 'total',
              },
            },
            profileId: 'professional_service:v1',
            scopeBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'Five-page website, contact form, and launch handover',
            },
            serviceArea: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'Perth and remote',
            },
            timingBasis: {
              kind: 'known',
              observedAt,
              source: { kind: 'business_supplied' },
              value: 'About three weeks after content is ready',
            },
          },
        },
        name: 'Labelled demo website starter',
        offeringRef: 'offering:phase5-demo:website-starter:v1',
        revision: 1,
        summary: 'A labelled demonstration of a small-business website delivery option.',
      }],
      placeKeys: ['perth', 'perth and remote', 'perth wa', 'wa'],
      publicStatus: 'published',
      schemaVersion: 'registry-search-document:v2',
      searchText: 'phase 5 demo website starter',
      sourceDigest: 'hash:7ce338ec',
      sourceRevision: observedAt + 500,
      stateTerritory: 'WA',
      suburb: 'Perth',
      updatedAt: observedAt,
    } as const

    await expect(backend.run(async (ctx) => (
      ctx.db.insert('registrySearchDocuments', historicalAggregateDocument as never)
    ))).rejects.toThrow()
  })


  it('validates current and legacy action invocation attempts', async () => {
    const backend = convexTest(schema, convexModules)
    const currentAttempt = {
      invocationRef: 'invocation:schema-regression',
      attemptRef: 'attempt:current',
      attemptNumber: 1,
      effectGeneration: 1,
      actor: { callerRef: 'caller:schema-regression', principalRef: 'principal:schema-regression' },
      idempotency: {
        operationKey: 'operation:schema-regression',
        materialInputDigest: 'digest:schema-regression',
        effectIdentity: 'effect:schema-regression',
      },
      lease: { owner: 'worker:schema-regression', expiresAt: '2026-08-02T00:00:00.000Z' },
      release: { state: 'not_released' },
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        errorDigest: 'digest:schema-regression',
        reconciliationRequiredAt: '2026-08-02T00:00:00.000Z',
      },
      recordedAt: '2026-08-02T00:00:00.000Z',
    } as const
    const legacyUncertainAttempt = {
      ...currentAttempt,
      attemptNumber: 2,
      attemptRef: 'attempt:legacy-uncertain',
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        message: 'legacy uncertain attempt message',
        reconciliationRequiredAt: '2026-08-02T00:00:00.000Z',
      },
    } as const
    const legacyFailedAttempt = {
      ...currentAttempt,
      attemptNumber: 3,
      attemptRef: 'attempt:legacy-failed',
      outcome: {
        state: 'failed',
        retry: 'safe_before_release',
        message: 'legacy failed attempt message',
      },
    } as const
    const malformedLegacyAttempt = {
      ...legacyUncertainAttempt,
      attemptNumber: 4,
      attemptRef: 'attempt:legacy-malformed',
      outcome: {
        ...legacyUncertainAttempt.outcome,
        message: 42,
      },
    } as const

    await backend.run(async (ctx) => {
      await ctx.db.insert('actionInvocationAttempts', currentAttempt)
      await ctx.db.insert('actionInvocationAttempts', legacyUncertainAttempt)
      await ctx.db.insert('actionInvocationAttempts', legacyFailedAttempt)
    })
    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationAttempts', malformedLegacyAttempt as never)
    ))).rejects.toThrow(/"message":42/u)

    const rows = await backend.run(async (ctx) => (
      ctx.db.query('actionInvocationAttempts').take(10)
    ))
    const currentRow = rows.find(({ attemptRef }) => attemptRef === 'attempt:current')
    const legacyUncertainRow = rows.find(({ attemptRef }) => attemptRef === 'attempt:legacy-uncertain')
    const legacyFailedRow = rows.find(({ attemptRef }) => attemptRef === 'attempt:legacy-failed')

    expect(currentRow).toEqual(expect.objectContaining({
      outcome: {
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        errorDigest: 'digest:schema-regression',
        reconciliationRequiredAt: '2026-08-02T00:00:00.000Z',
      },
    }))
    expect(currentRow?.outcome).not.toHaveProperty('message')
    expect(legacyUncertainRow).toEqual(expect.objectContaining({
      outcome: expect.objectContaining({
        message: 'legacy uncertain attempt message',
        state: 'uncertain',
        retry: 'reconcile_before_retry',
        reconciliationRequiredAt: '2026-08-02T00:00:00.000Z',
      }),
    }))
    expect(legacyFailedRow).toEqual(expect.objectContaining({
      outcome: expect.objectContaining({
        message: 'legacy failed attempt message',
        state: 'failed',
        retry: 'safe_before_release',
      }),
    }))
  })
  it('validates current and legacy action invocation controls', async () => {
    const backend = convexTest(schema, convexModules)
    const legacyAcceptedAuthority = {
      kind: 'standing_mandate_use',
      mandateRef: 'mandate:schema-regression',
      mandateVersion: 1,
      mandateGeneration: 2,
      authorityUseRef: 'authority-use:schema-regression',
      grantEvidenceRef: 'grant-evidence:schema-regression',
    } as const
    const currentAcceptedAuthority = {
      kind: 'approve_each',
      authorityRef: 'authority:schema-regression',
    } as const
    const controlBase = {
      invocationVersion: 1,
      environment: 'MOCK/DEVELOPMENT ONLY',
      persistence: 'durable_control',
      origin: {
        kind: 'standalone',
        callerRef: 'caller:schema-regression',
        principalRef: 'principal:schema-regression',
      },
      owner: { callerRef: 'caller:schema-regression', principalRef: 'principal:schema-regression' },
      action: { id: 'schema.regression', contractVersion: '1' },
      desired: { state: 'invoke' },
      authority: {
        reference: 'authority:schema-regression',
        expiresAt: '2026-08-02T00:00:00.000Z',
      },
      freshness: { state: 'current', observedAt: '2026-08-02T00:00:00.000Z' },
      control: { state: 'authorized', decidedAt: '2026-08-02T00:00:00.000Z' },
    } as const
    const legacyControl = {
      invocationRef: 'invocation:schema-regression:legacy',
      invocationVersion: 1,
      control: {
        ...controlBase,
        invocationRef: 'invocation:schema-regression:legacy',
      },
      sourceRef: 'source:schema-regression:legacy',
      authorityReference: 'authority:schema-regression',
      authorityDecisionAt: '2026-08-02T00:00:00.000Z',
      acceptedAuthority: legacyAcceptedAuthority,
      updatedAt: '2026-08-02T00:00:00.000Z',
    } as const
    const currentControl = {
      invocationRef: 'invocation:schema-regression:current',
      invocationVersion: 1,
      control: {
        ...controlBase,
        invocationRef: 'invocation:schema-regression:current',
        acceptedAuthority: currentAcceptedAuthority,
      },
      sourceRef: 'source:schema-regression:current',
      authorityReference: 'authority:schema-regression',
      authorityDecisionAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    } as const
    const { mandateGeneration: _mandateGeneration, ...legacyAcceptedAuthorityWithoutGeneration } =
      legacyAcceptedAuthority
    const malformedLegacyControl = {
      ...legacyControl,
      invocationRef: 'invocation:schema-regression:malformed-authority',
      acceptedAuthority: legacyAcceptedAuthorityWithoutGeneration,
    } as const
    const malformedGatheringControl = {
      ...currentControl,
      invocationRef: 'invocation:schema-regression:malformed-gathering',
      control: {
        ...currentControl.control,
        control: { state: 'gathering_information', missingFields: 'convert' },
      },
    } as const

    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', malformedLegacyControl as never)
    ))).rejects.toThrow()
    await expect(backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', malformedGatheringControl as never)
    ))).rejects.toThrow()

    await backend.run(async (ctx) => {
      await ctx.db.insert('actionInvocationControls', legacyControl)
      await ctx.db.insert('actionInvocationControls', currentControl)
    })

    const rows = await backend.run(async (ctx) => (
      ctx.db.query('actionInvocationControls').take(10)
    ))
    const legacyRow = rows.find(({ invocationRef }) => invocationRef === legacyControl.invocationRef)
    const currentRow = rows.find(({ invocationRef }) => invocationRef === currentControl.invocationRef)

    expect(legacyRow).toEqual(expect.objectContaining({
      acceptedAuthority: legacyAcceptedAuthority,
      control: expect.not.objectContaining({ acceptedAuthority: expect.anything() }),
    }))
    expect(currentRow).toEqual(expect.objectContaining({
      control: expect.objectContaining({ acceptedAuthority: currentAcceptedAuthority }),
    }))
    expect(currentRow).not.toHaveProperty('acceptedAuthority')
  })
  it('validates current begin and answer gathering-information writes', async () => {
    const backend = convexTest(schema, convexModules)
    const fixture = buildDevelopmentPublishedOperationEvidence()
    const now = fixture.operation.readiness.observedAt + 1_000
    const actor = { callerRef: 'caller:schema-input', principalRef: 'principal:schema-input' }
    const adapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: createDevelopmentDynamicPublishedSource([fixture.operation]),
      runtime: {
        send: async () => { throw new Error('schema regression must not execute transport') },
        resolveCredential: () => undefined,
      },
      now: () => now,
      nextInvocationRef: () => 'invocation:schema-input',
      nextAuthorityRef: () => 'authority:schema-input',
      nextAttemptRef: () => 'attempt:schema-input',
    })
    const origin = { kind: 'standalone' as const, ...actor }

    const began = adapter.begin({ origin, actor, partial: {} })
    expect(began.state).toBe('gathering_information')
    const beginControl = adapter.exportSnapshot().controls.find(
      ({ invocationRef }) => invocationRef === began.invocationRef,
    )
    if (beginControl === undefined) throw new Error('begin control was not persisted')
    const toConvexControlRow = (row: Exclude<typeof beginControl, undefined>) => {
      const { control } = row
      if (control.persistence !== 'durable_control') {
        throw new Error('expected durable control')
      }
      const state = control.control
      if (state.state !== 'gathering_information') {
        throw new Error('expected gathering-information control')
      }
      const durablePersistence = 'durable_control' as const
      return {
        invocationRef: row.invocationRef,
        invocationVersion: row.invocationVersion,
        sourceRef: row.sourceRef,
        control: {
          invocationRef: control.invocationRef,
          invocationVersion: control.invocationVersion,
          environment: control.environment,
          persistence: durablePersistence,
          origin: control.origin,
          owner: control.owner,
          action: control.action,
          desired: control.desired,
          ...(control.authority === undefined ? {} : { authority: control.authority }),
          ...(control.acceptedAuthority === undefined ? {} : { acceptedAuthority: control.acceptedAuthority }),
          freshness: control.freshness,
          control: {
            state: 'gathering_information' as const,
            missingFields: [...state.missingFields],
          },
        },
        ...(row.sourceResultRef === undefined ? {} : { sourceResultRef: row.sourceResultRef }),
        ...(row.sourceResultDigest === undefined ? {} : { sourceResultDigest: row.sourceResultDigest }),
        ...(row.terminalBusinessOutcome === undefined ? {} : { terminalBusinessOutcome: row.terminalBusinessOutcome }),
        ...(row.terminalResultReferenceable === undefined ? {} : { terminalResultReferenceable: row.terminalResultReferenceable }),
        ...(row.preparedMaterialDigest === undefined ? {} : { preparedMaterialDigest: row.preparedMaterialDigest }),
        ...(row.preparedTargetDigest === undefined ? {} : { preparedTargetDigest: row.preparedTargetDigest }),
        ...(row.consequence === undefined ? {} : { consequence: row.consequence }),
        ...(row.dataLimitSummary === undefined ? {} : { dataLimitSummary: row.dataLimitSummary }),
        ...(row.authorityBinding === undefined ? {} : { authorityBinding: row.authorityBinding }),
        ...(row.authorityDecisionAt === undefined ? {} : { authorityDecisionAt: row.authorityDecisionAt }),
        ...(row.currentAttemptRef === undefined ? {} : { currentAttemptRef: row.currentAttemptRef }),
        ...(row.currentEffectGeneration === undefined ? {} : { currentEffectGeneration: row.currentEffectGeneration }),
        ...(row.currentLeaseOwner === undefined ? {} : { currentLeaseOwner: row.currentLeaseOwner }),
        ...(row.currentLeaseExpiresAt === undefined ? {} : { currentLeaseExpiresAt: row.currentLeaseExpiresAt }),
        updatedAt: row.updatedAt,
      }
    }
    const controlId = await backend.run(async (ctx) => (
      ctx.db.insert('actionInvocationControls', toConvexControlRow(beginControl))
    ))

    const answered = adapter.answer({
      invocationRef: began.invocationRef,
      actor,
      answers: { symbol: 'BTC' },
      freshnessMs: 30_000,
    })
    if (!('state' in answered) || answered.state !== 'gathering_information') {
      throw new Error('answer should remain in gathering state')
    }
    const answerControl = adapter.exportSnapshot().controls.find(
      ({ invocationRef }) => invocationRef === began.invocationRef,
    )
    if (answerControl === undefined) throw new Error('answer control was not persisted')
    await backend.run(async (ctx) => {
      await ctx.db.replace(controlId, toConvexControlRow(answerControl))
    })

    const persisted = await backend.run(async (ctx) => ctx.db.get(controlId))
    expect(persisted?.control.control).toEqual({
      state: 'gathering_information',
      missingFields: ['convert'],
    })
    expect(persisted?.invocationVersion).toBe(2)
  })
})
