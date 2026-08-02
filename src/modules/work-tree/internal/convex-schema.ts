import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

export const WORK_TREE_EVENT_KIND_VALUES = ['created', 'claimed', 'elaborated', 'study_started', 'decision_proposed'] as const

/**
 * Work-tree state is one bounded canonical JSON snapshot. The owning module
 * validates the tree; Convex stores the version fence and append-only journal.
 */
export const workTreeTables = {
  workTrees: defineTable({
    projectId: v.string(),
    treeId: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    lineageJson: v.string(),
    lineageDigest: v.string(),
    createIdempotencyKey: v.string(),
    createPayloadDigest: v.string(),
    creationOperationKey: v.string(),
    claimIdempotencyKey: v.optional(v.string()),
    claimPayloadDigest: v.optional(v.string()),
    claimOperationKey: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    generation: v.number(),
    revision: v.number(),
    snapshotJson: v.string(),
    snapshotDigest: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_projectId', ['projectId'])
    .index('by_treeId', ['treeId'])
    .index('by_principalId_and_lineageDigest', ['principalId', 'lineageDigest'])
    .index('by_principalId_and_createIdempotencyKey', ['principalId', 'createIdempotencyKey'])
    .index('by_projectId_and_generation', ['projectId', 'generation']),

  workTreeEvents: defineTable({
    projectId: v.string(),
    treeId: v.string(),
    generation: v.number(),
    revision: v.number(),
    seq: v.number(),
    kind: literalUnion(WORK_TREE_EVENT_KIND_VALUES),
    operationKey: v.string(),
    payloadJson: v.string(),
    payloadDigest: v.string(),
    principalId: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    credentialId: v.optional(v.string()),
    actorSource: v.optional(v.union(
      v.literal('human_source'),
      v.literal('browser_guest'),
      v.literal('customer_request_agent'),
    )),
    at: v.number(),
  })
    .index('by_projectId_and_operationKey', ['projectId', 'operationKey'])
    .index('by_treeId_and_seq', ['treeId', 'seq'])
    .index('by_projectId_and_seq', ['projectId', 'seq'])
    .index('by_projectId_and_generation_and_seq', ['projectId', 'generation', 'seq']),

  workTreeDecisionReceipts: defineTable({
    projectId: v.string(),
    treeId: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.optional(v.string()),
    actorSource: v.optional(v.union(
      v.literal('human_source'),
      v.literal('browser_guest'),
      v.literal('customer_request_agent'),
    )),
    nodeId: v.string(),
    decision: v.union(v.literal('lock'), v.literal('adjust'), v.literal('park')),
    expectedGeneration: v.number(),
    expectedRevision: v.number(),
    proposalDigest: v.string(),
    idempotencyKey: v.string(),
    commandDigest: v.string(),
    receiptId: v.string(),
    permissionRef: v.optional(v.string()),
    generation: v.number(),
    revision: v.number(),
    disposition: v.union(
      v.literal('locked'),
      v.literal('queued'),
      v.literal('adjusted'),
      v.literal('unchanged'),
    ),
    refusalCode: v.optional(v.union(
      v.literal('stale_fence'),
      v.literal('forbidden'),
      v.literal('not_found'),
      v.literal('digest_mismatch'),
      v.literal('step_up_required'),
      v.literal('live_money_gate_open'),
      v.literal('stripe_setup_required'),
      v.literal('approval_not_found'),
      v.literal('approval_owner_mismatch'),
      v.literal('approval_credential_mismatch'),
      v.literal('approval_project_mismatch'),
      v.literal('approval_node_mismatch'),
      v.literal('approval_proposal_mismatch'),
      v.literal('approval_authority_mismatch'),
      v.literal('approval_amount_mismatch'),
      v.literal('approval_expired'),
      v.literal('approval_used'),
      v.literal('approval_conflict'),
    )),
    /** Source-derived, secret-free authority posture for operator/readback evidence. */
    authorityJson: v.optional(v.string()),
    occurredAt: v.number(),
    readbackProjectId: v.string(),
    readbackRevision: v.number(),
  })
    .index('by_projectId_and_idempotencyKey', ['projectId', 'idempotencyKey'])
    .index('by_projectId_and_nodeId_and_revision', ['projectId', 'nodeId', 'revision'])
    .index('by_projectId_and_occurredAt', ['projectId', 'occurredAt'])
    .index('by_receiptId', ['receiptId']),

  workTreeRepeatPermissions: defineTable({
    permissionRef: v.string(),
    permissionDigest: v.string(),
    projectId: v.string(),
    treeId: v.string(),
    ownerId: v.string(),
    principalId: v.string(),
    nodeId: v.string(),
    generation: v.number(),
    revision: v.number(),
    proposalDigest: v.string(),
    delegatedCredentialId: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
    perUseSpendCurrency: v.string(),
    perUseSpendMinor: v.number(),
    cumulativeSpendCurrency: v.string(),
    cumulativeSpendMinor: v.number(),
    occurrenceLimit: v.number(),
    reservedOccurrences: v.number(),
    perUseDataAllocations: v.number(),
    cumulativeDataAllocations: v.number(),
    reservedDataAllocations: v.number(),
    settledDataAllocations: v.number(),
    settledOccurrences: v.number(),
    reservedSpendMinor: v.number(),
    settledSpendMinor: v.number(),
    status: v.union(v.literal('active'), v.literal('withdrawn')),
    revokedAt: v.optional(v.number()),
    issuedAt: v.number(),
    sourceReceiptId: v.string(),
  })
    .index('by_permissionRef', ['permissionRef'])
    .index('by_projectId_and_permissionRef', ['projectId', 'permissionRef'])
    .index('by_projectId_and_proposalDigest', ['projectId', 'proposalDigest']),

  workTreeRepeatUses: defineTable({
    useRef: v.string(),
    permissionRef: v.string(),
    projectId: v.string(),
    treeId: v.string(),
    ownerId: v.string(),
    principalId: v.string(),
    nodeId: v.string(),
    generation: v.number(),
    revision: v.number(),
    proposalDigest: v.string(),
    delegatedCredentialId: v.string(),
    operationKey: v.string(),
    reservationCommandDigest: v.string(),
    requestedOccurrences: v.number(),
    reservedOccurrences: v.number(),
    requestedSpendCurrency: v.string(),
    requestedSpendMinor: v.number(),
    requestedDataAllocations: v.number(),
    reservedDataAllocations: v.number(),
    reservedSpendMinor: v.number(),
    state: v.union(
      v.literal('reserved'),
      v.literal('unknown'),
      v.literal('settled'),
      v.literal('not_settled'),
    ),
    actualOccurrences: v.optional(v.number()),
    actualSpendCurrency: v.optional(v.string()),
    actualSpendMinor: v.optional(v.number()),
    actualDataAllocations: v.optional(v.number()),
    releasedOccurrences: v.number(),
    releasedSpendMinor: v.number(),
    releasedDataAllocations: v.number(),
    /** T49 final-receipt slots are required on every new use; reserve initializes them to null. */
    finalizeOperationKey: v.union(v.string(), v.null()),
    finalizeCommandDigest: v.union(v.string(), v.null()),
    finalizeReceiptState: v.union(
      v.literal('unknown'),
      v.literal('settled'),
      v.literal('not_settled'),
      v.null(),
    ),
    finalizeReleasedOccurrences: v.union(v.number(), v.null()),
    finalizeReleasedSpendMinor: v.union(v.number(), v.null()),
    finalizeReleasedDataAllocations: v.union(v.number(), v.null()),
    finalizeHeldSpendMinor: v.union(v.number(), v.null()),
    finalizeHeldDataAllocations: v.union(v.number(), v.null()),
    reconcileOperationKey: v.optional(v.string()),
    reconcileCommandDigest: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_useRef', ['useRef'])
    .index('by_operationKey', ['operationKey'])
    .index('by_permissionRef_and_operationKey', ['permissionRef', 'operationKey'])
    .index('by_permissionRef_and_state', ['permissionRef', 'state'])
    .index('by_projectId_and_createdAt', ['projectId', 'createdAt']),
  workTreeApprovals: defineTable({
    approvalRef: v.string(),
    approvalDigest: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    projectId: v.string(),
    nodeId: v.string(),
    proposalDigest: v.string(),
    authorityKind: v.literal('per_item'),
    authorityAmountCurrency: v.optional(v.string()),
    authorityAmountMinor: v.optional(v.number()),
    expectedGeneration: v.number(),
    expectedRevision: v.number(),
    issuedAt: v.number(),
    expiresAt: v.number(),
    status: v.union(v.literal('unused'), v.literal('consumed')),
    idempotencyKey: v.string(),
    consumedAt: v.optional(v.number()),
    consumedReceiptId: v.optional(v.string()),
  })
    .index('by_approvalRef', ['approvalRef'])
    .index('by_ownerId_and_idempotencyKey', ['ownerId', 'idempotencyKey']),
} as const
