import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

const executionState = literalUnion(['pending', 'completed'] as const)
const runState = literalUnion(['running', 'completed', 'outcome_unknown', 'failed', 'cancelled', 'incident_frozen'] as const)
const leafState = literalUnion(['pending', 'released', 'completed', 'outcome_unknown', 'failed', 'cancelled', 'incident_frozen'] as const)
const attemptDisposition = literalUnion(['not_released', 'released', 'dispatched', 'indeterminate'] as const)
const effectState = literalUnion(['not_started', 'released', 'committed', 'unknown', 'not_committed'] as const)
const executionMode = literalUnion(['simulation', 'live'] as const)
const incidentActionClass = literalUnion(['route', 'authorize', 'root_admission', 'provider_release', 'data_release', 'reconcile', 'cancel'] as const)
const recordType = literalUnion([
  'root_run_admitted',
  'step_grant_consumed',
  'disclosure_grant_consumed',
  'provider_attempt_released',
  'provider_outcome_reported',
  'provider_outcome_unknown',
  'provider_effect_not_committed',
  'fallback_released',
  'fallback_release_refused',
  'root_run_completed',
  'root_run_outcome_unknown',
  'root_run_failed',
  'provider_reconciliation_observed',
  'root_run_reconciled',
  'cancellation_requested',
  'root_run_cancelled',
  'provider_cancellation_requested',
  'provider_cancellation_accepted',
  'provider_cancellation_rejected',
  'provider_cancellation_unknown',
  'incident_freeze_observed',
  'incident_epoch_stale_observed',
  'incident_canary_recovery_consumed',
] as const)
const bindingEvidence = v.object({
  bindingId: v.string(), disposition: literalUnion(['current', 'missing', 'legacy_unbound', 'expired', 'version_mismatch', 'ineligible_evidence'] as const),
  snapshotDigest: v.optional(v.string()),
  healthState: literalUnion(['healthy', 'degraded', 'unavailable', 'frozen', 'unknown'] as const),
  healthEvidenceStanding: v.optional(literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const)),
  incidentRoutingEffect: literalUnion(['none', 'deprioritize', 'exclude_new_routes', 'freeze'] as const),
  incidentEvidenceStanding: v.optional(literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const)),
  activeIncidentIds: v.optional(v.array(v.string())),
  executionReliabilityStatus: literalUnion(['sufficient', 'insufficient_evidence'] as const),
  standingEvidenceStanding: v.optional(literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const)),
  executionReliabilityLowerBoundPermille: v.optional(v.number()),
})
const routingSnapshotV1 = v.object({
  compilerVersion: v.literal('routing-compiler:v1'), optimizerVersion: v.literal('organic-cost-latency:v1'),
  networkPolicyVersion: v.literal('network-policy:eligible-bindings:v1'), networkId: v.string(),
  caller: v.object({ agentId: v.string(), principalId: v.string() }), normalizedQuery: v.string(),
  constraints: v.object({ currency: v.string(), maximumSpendMinor: v.number(), optimizeFor: literalUnion(['cost', 'latency'] as const) }),
  eligibleBindingIds: v.array(v.string()), relevantBindingIds: v.array(v.string()),
})
const routingSnapshotV2 = v.object({
  compilerVersion: v.literal('routing-compiler:v2'), optimizerVersion: v.literal('organic-cost-latency-evidence:v2'),
  networkPolicyVersion: v.literal('network-policy:binding-evidence:v2'), networkId: v.string(),
  caller: v.object({ agentId: v.string(), principalId: v.string() }), normalizedQuery: v.string(),
  constraints: v.object({ currency: v.string(), maximumSpendMinor: v.number(), optimizeFor: literalUnion(['cost', 'latency'] as const) }),
  eligibleBindingIds: v.array(v.string()), relevantBindingIds: v.array(v.string()), bindingEvidence: v.array(bindingEvidence),
})
const organicDecisionV1 = v.object({
  optimizerVersion: v.literal('organic-cost-latency:v1'), optimizeFor: literalUnion(['cost', 'latency'] as const),
  selectedBindingId: v.optional(v.string()),
  factors: v.array(v.object({
    bindingId: v.string(), feasible: v.boolean(), expectedCostMinor: v.optional(v.number()), maximumCostMinor: v.optional(v.number()),
    expectedLatencyMs: v.optional(v.number()), refusalReason: v.optional(literalUnion(['quote_refused', 'currency_mismatch', 'maximum_spend_exceeded'] as const)),
  })),
})
const organicDecisionV2 = v.object({
  optimizerVersion: v.literal('organic-cost-latency-evidence:v2'), optimizeFor: literalUnion(['cost', 'latency'] as const),
  selectedBindingId: v.optional(v.string()),
  factors: v.array(v.object({
    bindingId: v.string(), feasible: v.boolean(), expectedCostMinor: v.optional(v.number()), maximumCostMinor: v.optional(v.number()),
    expectedLatencyMs: v.optional(v.number()), evidence: bindingEvidence,
    refusalReason: v.optional(literalUnion(['quote_refused', 'currency_mismatch', 'maximum_spend_exceeded', 'health_unavailable', 'incident_excluded'] as const)),
  })),
})

export const routingKernelTables = {
  routingKernelIncidentScopeControls: defineTable({
    scopeKey: v.string(),
    networkId: v.optional(v.string()),
    principalId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    bindingId: v.optional(v.string()),
    capabilityContractId: v.optional(v.string()),
    specificity: v.number(),
    epoch: v.number(),
    activeFreezeOrderIds: v.array(v.string()),
    blockedActions: v.array(incidentActionClass),
    updatedAt: v.number(),
  }).index('by_scopeKey', ['scopeKey']),

  routingKernelIncidentFreezeOrders: defineTable({
    schemaVersion: v.literal('incident-freeze-order:v1'),
    freezeOrderId: v.string(),
    incidentId: v.string(),
    issuerId: v.string(),
    reason: v.string(),
    scopeKey: v.string(),
    networkId: v.optional(v.string()),
    principalId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    bindingId: v.optional(v.string()),
    capabilityContractId: v.optional(v.string()),
    blockedActions: v.array(incidentActionClass),
    epoch: v.number(),
    issuedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_freezeOrderId', ['freezeOrderId'])
    .index('by_scopeKey', ['scopeKey']),

  routingKernelIncidentResumeApprovals: defineTable({
    resumeOrderId: v.string(),
    freezeOrderId: v.string(),
    approverId: v.string(),
    evidenceRefs: v.array(v.string()),
    proposalDigest: v.string(),
    approvalFactDigest: v.string(),
    signingKeyId: v.string(), signingPublicKey: v.string(), factSignature: v.string(),
    approvedAt: v.number(),
  })
    .index('by_resumeOrderId_approverId', ['resumeOrderId', 'approverId'])
    .index('by_resumeOrderId', ['resumeOrderId']),

  routingKernelIncidentRefinementApprovals: defineTable({
    refinementOrderId: v.string(),
    sourceFreezeOrderId: v.string(),
    replacementFreezeOrderId: v.string(),
    reconstructionCheckpointId: v.string(),
    approverId: v.string(),
    proposalDigest: v.string(),
    approvalFactDigest: v.string(),
    signingKeyId: v.string(), signingPublicKey: v.string(), factSignature: v.string(),
    approvedAt: v.number(),
  })
    .index('by_refinementOrderId_approverId', ['refinementOrderId', 'approverId'])
    .index('by_refinementOrderId', ['refinementOrderId']),

  routingKernelIncidentRefinementFacts: defineTable({
    schemaVersion: v.literal('incident-refinement-fact:v1'),
    refinementOrderId: v.string(), sourceFreezeOrderId: v.string(), replacementFreezeOrderId: v.string(),
    sourceFreezeFactDigest: v.string(), replacementFreezeFactDigest: v.string(), sourceResumeFactDigest: v.string(),
    reconstructionFactDigest: v.string(), sourceDrainCompletedAt: v.number(), scopeKey: v.string(),
    retainedActions: v.array(incidentActionClass), droppedActions: v.array(incidentActionClass),
    approvedActiveFreezeOrderIds: v.array(v.string()), approvedControlEpoch: v.number(),
    replacementEpoch: v.number(), resumeEpoch: v.number(), approverIds: v.array(v.string()), recordedAt: v.number(),
    factDigest: v.string(), signingKeyId: v.string(), signingPublicKey: v.string(), factSignature: v.string(),
  })
    .index('by_refinementOrderId', ['refinementOrderId'])
    .index('by_sourceFreezeOrderId', ['sourceFreezeOrderId'])
    .index('by_replacementFreezeOrderId', ['replacementFreezeOrderId']),

  routingKernelIncidentResumeOrders: defineTable({
    schemaVersion: v.literal('incident-resume-order:v1'),
    resumeOrderId: v.string(),
    freezeOrderId: v.string(),
    approverIds: v.array(v.string()),
    evidenceRefs: v.array(v.string()),
    epoch: v.number(),
    issuedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_resumeOrderId', ['resumeOrderId'])
    .index('by_freezeOrderId', ['freezeOrderId']),

  routingKernelIncidentRecoveryGrantApprovals: defineTable({
    recoveryGrantId: v.string(),
    approverId: v.string(),
    proposalDigest: v.string(),
    approvalFactDigest: v.string(),
    signingKeyId: v.string(), signingPublicKey: v.string(), factSignature: v.string(),
    approvedAt: v.number(),
  })
    .index('by_recoveryGrantId_approverId', ['recoveryGrantId', 'approverId'])
    .index('by_recoveryGrantId', ['recoveryGrantId']),

  routingKernelIncidentRecoveryGrants: defineTable({
    schemaVersion: v.literal('incident-recovery-grant:v1'),
    recoveryGrantId: v.string(),
    freezeOrderIds: v.array(v.string()),
    lane: literalUnion(['reconcile', 'canary'] as const),
    scopeKey: v.string(),
    networkId: v.optional(v.string()),
    principalId: v.optional(v.string()),
    agentId: v.optional(v.string()),
    bindingId: v.optional(v.string()),
    capabilityContractId: v.optional(v.string()),
    maximumUses: v.number(),
    expiresAt: v.number(),
    approverIds: v.array(v.string()),
    evidenceRefs: v.array(v.string()),
    canaryPlan: v.optional(v.object({
      quoteId: v.string(), quoteDigest: v.string(), authorizationRef: v.string(), requestDigest: v.string(),
      bindingId: v.string(), capabilityContractId: v.string(), maximumSpendMinor: v.number(),
      currency: v.string(), allowedDataFields: v.array(v.string()),
    })),
    issuedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  }).index('by_recoveryGrantId', ['recoveryGrantId']),

  routingKernelIncidentRecoveryUses: defineTable({
    recoveryGrantId: v.string(),
    operationRef: v.string(),
    lane: literalUnion(['reconcile', 'canary'] as const),
    usedAt: v.number(),
    canaryExecutionDigest: v.optional(v.string()),
  })
    .index('by_recoveryGrantId_operationRef', ['recoveryGrantId', 'operationRef'])
    .index('by_recoveryGrantId', ['recoveryGrantId']),

  routingKernelIncidentEvidenceQuarantines: defineTable({
    schemaVersion: v.literal('incident-evidence-quarantine:v1'),
    quarantineId: v.string(),
    freezeOrderId: v.string(),
    evidenceRef: v.string(),
    reason: v.string(),
    scopeKey: v.string(),
    issuedBy: v.string(),
    issuedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_quarantineId', ['quarantineId'])
    .index('by_evidenceRef', ['evidenceRef']),

  routingKernelIncidentReconstructionCheckpoints: defineTable({
    schemaVersion: v.literal('incident-reconstruction-checkpoint:v1'),
    checkpointId: v.string(),
    scopeKey: v.string(),
    reconstructedEpoch: v.number(),
    activeFreezeOrderIds: v.array(v.string()),
    blockedActions: v.array(incidentActionClass),
    sourceFactDigests: v.array(v.string()),
    projectionDigest: v.string(),
    projectionMatches: v.boolean(),
    recordedBy: v.string(),
    recordedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_checkpointId', ['checkpointId'])
    .index('by_scopeKey_recordedAt', ['scopeKey', 'recordedAt']),

  routingKernelIncidentReconformanceFacts: defineTable({
    schemaVersion: v.literal('incident-reconformance-fact:v1'),
    reconformanceFactId: v.string(),
    freezeOrderId: v.string(),
    canaryRunFactId: v.optional(v.string()),
    scopeKey: v.string(),
    evidenceSnapshotDigest: v.string(),
    networkId: v.string(),
    bindingId: v.string(),
    evidenceObservedAt: v.number(),
    evidenceExpiresAt: v.number(),
    recordedBy: v.string(),
    recordedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_reconformanceFactId', ['reconformanceFactId'])
    .index('by_freezeOrderId_recordedAt', ['freezeOrderId', 'recordedAt']),

  routingKernelIncidentCanaryRunFacts: defineTable({
    schemaVersion: v.literal('incident-canary-run-fact:v1'),
    canaryRunFactId: v.string(),
    recoveryGrantId: v.string(),
    freezeOrderIds: v.array(v.string()),
    scopeKey: v.string(),
    rootRunId: v.string(),
    quoteId: v.string(),
    quoteDigest: v.string(),
    authorizationRef: v.string(),
    requestDigest: v.string(),
    bindingId: v.string(),
    capabilityContractId: v.string(),
    terminalState: v.literal('completed'),
    effectState: v.literal('committed'),
    recordSetDigest: v.string(),
    outcomeDigest: v.string(),
    recordedBy: v.string(),
    recordedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_canaryRunFactId', ['canaryRunFactId'])
    .index('by_rootRunId', ['rootRunId'])
    .index('by_recoveryGrantId', ['recoveryGrantId']),

  routingKernelIncidentDrainSweeps: defineTable({
    freezeOrderId: v.string(),
    scopeKey: v.string(),
    freezeIssuedAt: v.number(),
    cursor: v.optional(v.string()),
    status: literalUnion(['pending', 'complete'] as const),
    rootsExamined: v.number(),
    factsRecorded: v.number(),
    updatedAt: v.number(),
  }).index('by_freezeOrderId', ['freezeOrderId']),

  routingKernelIncidentDrainFacts: defineTable({
    schemaVersion: v.literal('incident-drain-fact:v1'),
    drainFactId: v.string(),
    freezeOrderId: v.string(),
    rootRunId: v.string(),
    leafRunId: v.string(),
    bindingId: v.string(),
    egressKind: literalUnion(['provider_execution', 'provider_cancellation'] as const),
    disposition: literalUnion(['pre_release_contained', 'in_flight_indeterminate', 'cancellation_in_flight_indeterminate'] as const),
    observedAt: v.number(),
    factDigest: v.string(),
    signingKeyId: v.string(),
    signingPublicKey: v.string(),
    factSignature: v.string(),
  })
    .index('by_drainFactId', ['drainFactId'])
    .index('by_freezeOrderId', ['freezeOrderId'])
    .index('by_rootRunId', ['rootRunId']),

  routingKernelAgentGrants: defineTable({
    grantId: v.string(),
    agentId: v.string(),
    principalId: v.string(),
    networkIds: v.array(v.string()),
    maximumSpendMinor: v.number(),
    currency: v.string(),
    allowedDataFields: v.array(v.string()),
    protectedFieldSetId: v.optional(v.string()),
    maximumDisclosureAttempts: v.optional(v.number()),
    maximumDisclosureExposures: v.optional(v.number()),
    allowedRecipientBindingIds: v.optional(v.array(v.string())),
    allowedDisclosurePurposes: v.optional(v.array(v.string())),
    expiresAt: v.number(),
    status: literalUnion(['active', 'revoked'] as const),
    evidenceRefs: v.array(v.string()),
    grantHash: v.string(),
    issuedAt: v.number(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_grantId', ['grantId'])
    .index('by_agentId_status', ['agentId', 'status']),

  routingKernelBudgetAuthorities: defineTable({
    budgetContract: literalUnion(['cumulative_v1', 'legacy_quarantined'] as const),
    budgetAuthorityRef: v.string(),
    sourceGrantId: v.string(),
    agentId: v.string(),
    principalId: v.string(),
    networkId: v.string(),
    railProfileId: v.literal('provider-cost-v1'),
    currency: v.string(),
    maximumGrossMinor: v.number(),
    reservedGrossMinor: v.number(),
    committedGrossMinor: v.number(),
    expiresAt: v.number(),
    status: literalUnion(['active', 'revoked'] as const),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_budgetAuthorityRef', ['budgetAuthorityRef'])
    .index('by_sourceGrantId_networkId', ['sourceGrantId', 'networkId']),

  routingKernelSpendReservations: defineTable({
    budgetAuthorityRef: v.string(),
    rootRunId: v.string(),
    amountMinor: v.number(),
    currency: v.string(),
    state: literalUnion(['reserved', 'committed', 'released'] as const),
    reservedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_rootRunId', ['rootRunId'])
    .index('by_budgetAuthorityRef_state', ['budgetAuthorityRef', 'state']),

  routingKernelDataAuthorizationBudgets: defineTable({
    dataContract: literalUnion(['cumulative_v1', 'legacy_quarantined'] as const),
    dataAuthorizationBudgetRef: v.string(),
    sourceGrantId: v.string(),
    agentId: v.string(),
    principalId: v.string(),
    networkId: v.string(),
    protectedFieldSetId: v.string(),
    permittedFields: v.array(v.string()),
    permittedRecipientBindingIds: v.array(v.string()),
    permittedPurposes: v.array(v.string()),
    maximumAttempts: v.number(),
    maximumExposures: v.number(),
    reservedAttempts: v.optional(v.number()),
    reservedExposures: v.optional(v.number()),
    consumedAttempts: v.number(),
    consumedExposures: v.number(),
    expiresAt: v.number(),
    status: literalUnion(['active', 'revoked'] as const),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_dataAuthorizationBudgetRef', ['dataAuthorizationBudgetRef'])
    .index('by_sourceGrantId_networkId', ['sourceGrantId', 'networkId']),

  routingKernelDataAllocations: defineTable({
    dataAuthorizationBudgetRef: v.string(),
    rootRunId: v.string(),
    allocatedAttempts: v.number(),
    allocatedExposures: v.number(),
    remainingAttempts: v.number(),
    remainingExposures: v.number(),
    state: literalUnion(['active', 'released'] as const),
    createdAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index('by_rootRunId', ['rootRunId'])
    .index('by_dataAuthorizationBudgetRef_state', ['dataAuthorizationBudgetRef', 'state']),

  routingKernelProviderCancellations: defineTable({
    cancellationRequestId: v.string(), rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(),
    bindingId: v.string(), idempotencyKey: v.string(),
    disposition: literalUnion(['pending', 'accepted', 'rejected', 'indeterminate'] as const),
    requestedAt: v.number(), resolvedAt: v.optional(v.number()), providerReference: v.optional(v.string()), reason: v.optional(v.string()),
  })
    .index('by_rootRunId', ['rootRunId'])
    .index('by_cancellationRequestId', ['cancellationRequestId']),

  routingKernelBindingEvidenceSnapshots: defineTable({
    contractVersion: v.literal('routing-evidence:v1'), snapshotDigest: v.string(),
    networkId: v.string(), bindingId: v.string(), bindingRegistrationHash: v.string(), environment: v.string(),
    networkPolicyVersion: v.literal('network-policy:binding-evidence:v2'), estimatorVersion: v.literal('execution-reliability-lcb:v1'),
    sourceCommitment: v.string(), observedAt: v.number(), expiresAt: v.number(),
    health: v.object({ state: literalUnion(['healthy', 'degraded', 'unavailable', 'frozen', 'unknown'] as const), evidenceStanding: literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const) }),
    incident: v.object({ routingEffect: literalUnion(['none', 'deprioritize', 'exclude_new_routes', 'freeze'] as const), activeIncidentIds: v.array(v.string()), evidenceStanding: literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const) }),
    standing: v.object({ evidenceStanding: literalUnion(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated', 'visible_unbound', 'ineligible_domain', 'ineligible_scope', 'held', 'retracted_or_removed'] as const), executionReliability: v.object({ status: literalUnion(['sufficient', 'insufficient_evidence'] as const), sampleSize: v.number(), lowerConfidenceBoundPermille: v.optional(v.number()) }) }),
    admittedAt: v.number(),
  })
    .index('by_snapshotDigest', ['snapshotDigest'])
    .index('by_networkId_observedAt', ['networkId', 'observedAt'])
    .index('by_bindingId_observedAt', ['bindingId', 'observedAt']),

  routingKernelDisclosureAttempts: defineTable({
    incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
    dataAuthorizationBudgetRef: v.string(),
    disclosureGrantId: v.string(),
    disclosureGrantDigest: v.string(),
    rootRunId: v.string(),
    leafRunId: v.string(),
    stepGrantId: v.string(),
    quoteId: v.string(),
    quoteDigest: v.string(),
    requestDigest: v.string(),
    attempt: v.number(),
    recipientBindingId: v.string(),
    purpose: v.string(),
    fields: v.array(v.string()),
    projectionDigest: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    enforcementPoint: v.literal('data_release'),
    incidentEpochDigest: v.optional(v.string()),
    disposition: literalUnion(['not_released', 'released', 'indeterminate'] as const),
    consumedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('by_disclosureGrantId', ['disclosureGrantId'])
    .index('by_rootRunId_leafRunId', ['rootRunId', 'leafRunId'])
    .index('by_dataAuthorizationBudgetRef', ['dataAuthorizationBudgetRef']),

  routingKernelBindings: defineTable({
    bindingId: v.string(),
    businessId: v.id('businesses'),
    nodeId: v.string(),
    networkId: v.string(),
    capabilityContractId: v.string(),
    operation: v.string(),
    admission: literalUnion(['admitted', 'not_admitted'] as const),
    conformance: literalUnion(['conformant', 'not_conformant'] as const),
    admissionEvidenceRefs: v.array(v.string()),
    conformanceEvidenceRefs: v.array(v.string()),
    queryTerms: v.array(v.string()),
    adapterFeatures: v.optional(v.object({ requestCancellation: literalUnion(['supported', 'unsupported'] as const) })),
    adapterFeatureEvidenceRefs: v.optional(v.array(v.string())),
    endpointUrl: v.string(),
    credentialRef: v.string(),
    registrationHash: v.string(),
    registeredAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_bindingId', ['bindingId'])
    .index('by_networkId_admission_conformance', ['networkId', 'admission', 'conformance'])
    .index('by_businessId', ['businessId']),

  routingKernelQuotes: defineTable({
    incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
    quoteId: v.string(),
    quoteDigest: v.string(),
    routingRequestId: v.string(),
    networkId: v.string(),
    executionMode,
    agentId: v.string(),
    principalId: v.string(),
    query: v.string(),
    routingSnapshot: v.optional(v.union(routingSnapshotV1, routingSnapshotV2)),
    organicDecision: v.optional(v.union(organicDecisionV1, organicDecisionV2)),
    createdAt: v.number(),
    expiresAt: v.number(),
    selectedBindingId: v.string(),
    effects: v.array(v.string()),
    disclosures: v.array(v.string()),
    enforcement: v.literal('required'),
    incidentEpochDigest: v.optional(v.string()),
  })
    .index('by_quoteId', ['quoteId'])
    .index('by_routingRequestId', ['routingRequestId']),

  routingKernelQuoteGraphs: defineTable({
    quoteId: v.string(),
    rank: v.number(),
    bindingId: v.string(),
    nodeId: v.string(),
    capabilityContractId: v.string(),
    expectedCurrency: v.string(),
    expectedAmountMinor: v.number(),
    maximumCurrency: v.string(),
    maximumAmountMinor: v.number(),
    expectedLatencyMs: v.number(),
    dataFields: v.array(v.string()),
    disclosures: v.array(v.string()),
  })
    .index('by_quoteId_rank', ['quoteId', 'rank'])
    .index('by_quoteId_bindingId', ['quoteId', 'bindingId']),

  routingKernelQuoteGraphSteps: defineTable({
    quoteId: v.string(),
    graphRank: v.number(),
    stepRank: v.number(),
    role: literalUnion(['primary', 'fallback'] as const),
    trigger: v.optional(v.literal('on_effect_not_committed')),
    bindingId: v.string(),
    nodeId: v.string(),
    capabilityContractId: v.string(),
    expectedCurrency: v.string(),
    expectedAmountMinor: v.number(),
    maximumCurrency: v.string(),
    maximumAmountMinor: v.number(),
    expectedLatencyMs: v.number(),
    providerQuoteRef: v.optional(v.string()),
    providerQuoteExpiresAt: v.optional(v.number()),
    incidentEpochDigest: v.optional(v.string()),
    dataFields: v.array(v.string()),
    disclosures: v.array(v.string()),
  })
    .index('by_quoteId_graphRank_stepRank', ['quoteId', 'graphRank', 'stepRank'])
    .index('by_quoteId_bindingId', ['quoteId', 'bindingId']),

  routingKernelAuthorizations: defineTable({
    incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
    authorizationRef: v.string(),
    budgetAuthorityRef: v.optional(v.string()),
    budgetMaximumGrossMinor: v.optional(v.number()),
    dataAuthorizationBudgetRef: v.optional(v.string()),
    protectedFieldSetId: v.optional(v.string()),
    dataBudgetMaximumAttempts: v.optional(v.number()),
    dataBudgetMaximumExposures: v.optional(v.number()),
    allowedRecipientBindingIds: v.optional(v.array(v.string())),
    allowedDisclosurePurposes: v.optional(v.array(v.string())),
    maximumDisclosureAttempts: v.optional(v.number()),
    maximumDisclosureExposures: v.optional(v.number()),
    quoteId: v.string(),
    quoteDigest: v.string(),
    principalId: v.string(),
    agentId: v.string(),
    maximumSpendMinor: v.number(),
    currency: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    allowedDataFields: v.array(v.string()),
    incidentEpochDigest: v.optional(v.string()),
  })
    .index('by_authorizationRef', ['authorizationRef'])
    .index('by_quoteId', ['quoteId']),

  routingKernelExecutionClaims: defineTable({
    executionScope: v.string(),
    rootRunId: v.string(),
    authorizationRef: v.string(),
    agentId: v.string(),
    principalId: v.string(),
    requestDigest: v.string(),
    state: executionState,
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    cancellationRequestedAt: v.optional(v.number()),
  })
    .index('by_executionScope', ['executionScope'])
    .index('by_rootRunId', ['rootRunId']),

  routingKernelStepReleases: defineTable(v.union(
    v.object({
      incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
      grantContract: v.literal('legacy_opaque'),
      rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(), bindingId: v.string(), releasedAt: v.number(),
    }),
    v.object({
      incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
      grantContract: literalUnion(['exact_v1', 'exact_v2_sha256'] as const),
      rootRunId: v.string(), leafRunId: v.string(), stepGrantId: v.string(),
      quoteId: v.string(), quoteDigest: v.string(), requestDigest: v.string(), bindingId: v.string(),
      nodeId: v.string(), capabilityContractId: v.string(), maximumCostCurrency: v.string(), maximumCostAmountMinor: v.number(),
      disclosedDataFields: v.array(v.string()), attempt: v.number(), issuedAt: v.number(), expiresAt: v.number(),
      enforcementPoint: v.literal('provider_release'), incidentEpochDigest: v.optional(v.string()), grantDigest: v.string(), releasedAt: v.number(),
    }),
  ))
    .index('by_stepGrantId', ['stepGrantId'])
    .index('by_rootRunId_leafRunId', ['rootRunId', 'leafRunId']),

  routingKernelRootRuns: defineTable({
    incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
    costContract: v.literal('attributed_v2'),
    rootRunId: v.string(),
    quoteId: v.string(),
    quoteDigest: v.string(),
    incidentEpochDigest: v.optional(v.string()),
    networkId: v.string(),
    executionMode,
    agentId: v.string(),
    principalId: v.string(),
    state: runState,
    enforcement: v.literal('enforced'),
    effectState,
    authorizedCurrency: v.string(),
    authorizedAmountMinor: v.number(),
    quotedMaximumCurrency: v.string(),
    quotedMaximumAmountMinor: v.number(),
    reservedCurrency: v.optional(v.string()),
    reservedAmountMinor: v.optional(v.number()),
    providerReportedCurrency: v.optional(v.string()),
    providerReportedAmountMinor: v.optional(v.number()),
    settledCurrency: v.optional(v.string()),
    settledAmountMinor: v.optional(v.number()),
    legacyCommittedEstimateDiscardedAt: v.optional(v.number()),
    committedCurrency: v.optional(v.string()),
    committedAmountMinor: v.optional(v.number()),
    heldCurrency: v.optional(v.string()),
    heldAmountMinor: v.optional(v.number()),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_rootRunId', ['rootRunId'])
    .index('by_quoteId', ['quoteId']),

  routingKernelLeafRuns: defineTable({
    rootRunId: v.string(),
    leafRunId: v.string(),
    stepGrantId: v.string(),
    bindingId: v.string(),
    nodeId: v.string(),
    capabilityContractId: v.string(),
    state: leafState,
    attemptDisposition,
    effectState,
    enforcement: v.literal('enforced'),
    providerReference: v.optional(v.string()),
    outcome: v.optional(v.record(v.string(), v.string())),
    failureReason: v.optional(v.string()),
  })
    .index('by_rootRunId_leafRunId', ['rootRunId', 'leafRunId'])
    .index('by_rootRunId_bindingId', ['rootRunId', 'bindingId']),

  routingKernelProtocolRecords: defineTable({
    incidentContract: literalUnion(['epoch_v1', 'legacy_quarantined'] as const),
    recordId: v.string(),
    rootRunId: v.string(),
    sequence: v.number(),
    type: recordType,
    leafRunId: v.optional(v.string()),
    bindingId: v.optional(v.string()),
    providerReference: v.optional(v.string()),
    evidenceSource: v.optional(v.string()),
    disclosedDataFields: v.optional(v.array(v.string())),
    reportedCost: v.optional(v.object({ currency: v.string(), amountMinor: v.number() })),
    financialObservation: v.optional(v.literal('provider_reported')),
    budgetAuthorityRef: v.optional(v.string()),
    budgetMaximumGrossMinor: v.optional(v.number()),
    spendReservationMinor: v.optional(v.number()),
    budgetCurrency: v.optional(v.string()),
    dataAuthorizationBudgetRef: v.optional(v.string()),
    disclosureGrantId: v.optional(v.string()),
    disclosureGrantDigest: v.optional(v.string()),
    disclosureRecipientBindingId: v.optional(v.string()),
    disclosurePurpose: v.optional(v.string()),
    disclosureDisposition: v.optional(v.literal('indeterminate')),
    cancellationRequestId: v.optional(v.string()),
    cancellationDisposition: v.optional(literalUnion(['accepted', 'rejected', 'indeterminate'] as const)),
    cancellationReason: v.optional(v.string()),
    incidentId: v.optional(v.string()),
    freezeOrderId: v.optional(v.string()),
    recoveryGrantId: v.optional(v.string()),
    incidentEpochDigest: v.optional(v.string()),
    stepGrantDigest: v.optional(v.string()),
    maximumCost: v.optional(v.object({ currency: v.string(), amountMinor: v.number() })),
    attempt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    enforcementPoint: v.optional(literalUnion(['provider_release', 'data_release'] as const)),
    occurredAt: v.number(),
  })
    .index('by_rootRunId_sequence', ['rootRunId', 'sequence'])
    .index('by_recordId', ['recordId']),
} as const
