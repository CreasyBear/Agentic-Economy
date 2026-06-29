import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

import {
  ContactFollowUpActionSlug,
  ContactFollowUpAttemptOutcomeValues,
  ContactFollowUpDecisionValues,
  ContactFollowUpPolicyKindValues,
} from './contact-follow-up'

export const protectedActionTables = {
  protectedActionProposals: defineTable({
    proposalId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    businessId: v.id('businesses'),
    ownerId: v.id('owners'),
    serviceId: v.optional(v.id('businessServices')),
    actorRef: v.string(),
    sourceEvidenceRef: v.string(),
    allowedParametersJson: v.string(),
    policyHintsJson: v.optional(v.string()),
    canonicalContractHash: v.string(),
    proposalHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    deadlineAt: v.number(),
    reversibility: v.string(),
    proofExpectation: v.string(),
    status: v.union(v.literal('proposed'), v.literal('approved'), v.literal('rejected'), v.literal('attempted')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_proposalId', ['proposalId'])
    .index('by_owner_status', ['ownerId', 'status'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  protectedActionPolicyDecisions: defineTable({
    policyId: v.string(),
    proposalId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    kind: literalUnion(ContactFollowUpPolicyKindValues),
    reason: v.string(),
    proposalHash: v.string(),
    policyHash: v.string(),
    correlationId: v.string(),
    evaluatedAt: v.number(),
  })
    .index('by_proposal', ['proposalId'])
    .index('by_policyHash', ['policyHash']),

  protectedActionOwnerDecisions: defineTable({
    decisionId: v.string(),
    proposalId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    ownerId: v.id('owners'),
    decision: literalUnion(ContactFollowUpDecisionValues),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    proposalHash: v.string(),
    policyHash: v.string(),
    decisionHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    decidedAt: v.number(),
  })
    .index('by_proposal', ['proposalId'])
    .index('by_owner_decidedAt', ['ownerId', 'decidedAt'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  protectedActionGatewayAdmissions: defineTable({
    gatewayAdmissionId: v.string(),
    proposalId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    proposalHash: v.string(),
    policyHash: v.string(),
    contractHash: v.string(),
    ownerDecisionHash: v.string(),
    admissionHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    status: v.union(v.literal('admitted'), v.literal('consumed'), v.literal('expired'), v.literal('replay_rejected')),
    expiresAt: v.number(),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index('by_gatewayAdmissionId', ['gatewayAdmissionId'])
    .index('by_proposal_status', ['proposalId', 'status'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  protectedActionAttempts: defineTable({
    attemptId: v.string(),
    proposalId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    businessId: v.id('businesses'),
    ownerId: v.id('owners'),
    decisionId: v.string(),
    gatewayAdmissionId: v.string(),
    outcome: literalUnion(ContactFollowUpAttemptOutcomeValues),
    attemptHash: v.string(),
    receiptId: v.optional(v.string()),
    reason: v.optional(v.string()),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    attemptedAt: v.number(),
  })
    .index('by_attemptId', ['attemptId'])
    .index('by_proposal', ['proposalId'])
    .index('by_business_outcome', ['businessId', 'outcome'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  protectedActionReceipts: defineTable({
    receiptId: v.string(),
    proposalId: v.string(),
    attemptId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    kind: v.union(v.literal('receipt'), v.literal('proof_gap')),
    providerBoundary: v.literal('source_owned_follow_up_outbox'),
    payloadHash: v.string(),
    redactedReadbackJson: v.string(),
    recordedAt: v.number(),
  })
    .index('by_receiptId', ['receiptId'])
    .index('by_attempt', ['attemptId'])
    .index('by_proposal', ['proposalId']),

  protectedActionPrivateEvidenceRefs: defineTable({
    privateEvidenceRefId: v.string(),
    proposalId: v.string(),
    attemptId: v.optional(v.string()),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    retentionClass: v.literal('protected_action_private_evidence'),
    accessPolicy: v.literal('owner_admin_operator_only'),
    payloadHash: v.string(),
    privatePayloadRef: v.optional(v.string()),
    ttlExpiresAt: v.number(),
    redactedAt: v.optional(v.number()),
  })
    .index('by_privateEvidenceRefId', ['privateEvidenceRefId'])
    .index('by_proposal', ['proposalId'])
    .index('by_ttlExpiresAt', ['ttlExpiresAt']),

  protectedActionNoRepairRecords: defineTable({
    noRepairId: v.string(),
    proposalId: v.string(),
    attemptId: v.optional(v.string()),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    reason: v.string(),
    evidenceRefs: v.array(v.string()),
    noRepairHash: v.string(),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    markedBy: v.string(),
    markedAt: v.number(),
  })
    .index('by_noRepairId', ['noRepairId'])
    .index('by_proposal', ['proposalId'])
    .index('by_idempotencyKey', ['idempotencyKey']),

  protectedActionSupportRecords: defineTable({
    supportRecordId: v.string(),
    selectedActionSlug: v.literal(ContactFollowUpActionSlug),
    businessId: v.optional(v.id('businesses')),
    primaryOwnerRef: v.string(),
    backupOwnerRef: v.string(),
    primaryAdminOperatorRef: v.string(),
    supportedChannels: v.array(v.string()),
    launchStage: v.literal('internal_alpha'),
    capacityThreshold: v.number(),
    backlogAgeThresholdMs: v.number(),
    phaseIncidentsBlocking: v.array(v.string()),
    claimDisablePath: v.literal('protected_actions_enabled'),
    perChannelKillRules: v.array(v.string()),
    sourceHash: v.string(),
    nextReviewAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_supportRecordId', ['supportRecordId'])
    .index('by_selectedActionSlug', ['selectedActionSlug'])
    .index('by_business', ['businessId']),
} as const
