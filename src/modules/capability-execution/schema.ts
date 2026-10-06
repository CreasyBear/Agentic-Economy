import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { capabilityCallTables as existingCapabilityCallTables } from './internal/convex-schema'
import { callFeedbackValue } from './call-feedback'
import { planHoldBookingValue, promotionalCreditAllocationValue } from '@/modules/money/public'

export const capabilityCallTables = {
  ...existingCapabilityCallTables,
  capabilityPlans: defineTable({
    planRef: v.string(),
    principalId: v.string(),
    ownerId: v.string(),
    accountRef: v.string(),
    credentialId: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    grantDigest: v.optional(v.string()),
    commercialPolicyDigest: v.optional(v.string()),
    applicationRef: v.optional(v.string()),
    principalScopes: v.optional(v.array(v.string())),
    authorityMode: v.optional(v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only'))),
    environment: v.union(v.literal('sandbox'), v.literal('production')),
    planJson: v.string(),
    planDigest: v.string(),
    nodes: v.array(v.object({
      nodeId: v.string(),
      inputMode: v.union(v.literal('literal'), v.literal('deferred')),
      validation: v.union(v.literal('typed'), v.literal('untyped_ref')),
      toolRef: v.string(),
      toolMaterialDigest: v.string(),
      inputTemplateDigest: v.string(),
      pricingDigest: v.string(),
      providerHost: v.string(),
      priceClass: v.union(
        v.literal('fixed'),
        v.literal('cardinality_bounded'),
        v.literal('upto_bounded'),
        v.literal('unknown'),
      ),
      bounds: v.optional(v.record(v.string(), v.object({ maxItems: v.number() }))),
      ceilingAudUnits: v.string(),
      rateToleranceBps: v.optional(v.number()),
      dependsOn: v.array(v.string()),
    })),
    stages: v.array(v.array(v.string())),
    dataFlows: v.array(v.object({
      from: v.string(),
      to: v.string(),
      destinationProviderHost: v.string(),
    })),
    approvedTotalAudUnits: v.string(),
    rateEvidenceDigest: v.optional(v.string()),
    state: v.union(
      v.literal('quoted'),
      v.literal('awaiting_approval'),
      v.literal('running'),
      v.literal('succeeded'),
      v.literal('partially_succeeded'),
      v.literal('failed'),
      v.literal('cancelled'),
      v.literal('expired'),
      v.literal('reconciliation_required'),
    ),
    authority: v.optional(v.object({
      format: v.literal('plan'),
      planRef: v.string(),
      planDigest: v.string(),
      approvedTotalAudUnits: v.string(),
      nodeCeilings: v.array(v.object({
        nodeId: v.string(),
        ceilingAudUnits: v.string(),
      })),
      grantRef: v.string(),
      grantGeneration: v.number(),
      grantDigest: v.string(),
      expiresAt: v.number(),
    })),
    idempotencyKey: v.optional(v.string()),
    runCommandDigest: v.optional(v.string()),
    maximumConcurrentNodes: v.optional(v.number()),
    holdBooking: v.optional(planHoldBookingValue),
    holdRemainingCreditAllocation: v.optional(promotionalCreditAllocationValue),
    holdRemainder: v.optional(v.object({
      holdBalanceUnits: v.string(), remainingCreditAllocation: v.optional(promotionalCreditAllocationValue),
      terminalEvidenceDigest: v.string(),
    })),
    holdCreditRestored: v.optional(v.boolean()),
    holdReleaseAttempts: v.optional(v.number()),
    concludedNodeIds: v.optional(v.array(v.string())),
    workflowFinished: v.optional(v.boolean()),
    failureCode: v.optional(v.string()),
    approvalDecision: v.optional(v.object({ decision: v.union(v.literal('approved'), v.literal('denied')), actorRef: v.string(), decidedAt: v.number() })),
    chatTurnRef: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    terminationIntent: v.optional(v.union(v.literal('cancelled'), v.literal('expired'))),
    holdReservationRefs: v.optional(v.array(v.string())),
    holdReservationAttempt: v.optional(v.object({
      generation: v.number(),
      leaseUntil: v.number(),
      ambiguous: v.boolean(),
    })),
    holdReleaseRefs: v.optional(v.array(v.string())),
    holdSettlementRefs: v.optional(v.array(v.string())),
    organizationMonth: v.optional(v.string()),
    organizationMonthlyExposureUnits: v.optional(v.string()),
    nodeOutcomes: v.array(v.object({
      nodeId: v.string(),
      outcome: v.union(
        v.literal('skipped'),
        v.literal('input_invalid'),
        v.literal('ref_type_mismatch'),
        v.literal('input_exceeds_bound'),
        v.literal('price_exceeded_ceiling'),
        v.literal('cancelled'),
      ),
    })),
    expiresAt: v.number(),
    runDeadlineAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_planRef', ['planRef'])
    .index('by_ownerId_and_createdAt', ['ownerId', 'createdAt'])
    .index('by_accountRef_and_organizationMonth', ['accountRef', 'organizationMonth'])
    .index('by_principalId_and_idempotencyKey', ['principalId', 'idempotencyKey'])
    .index('by_ownerId_and_state_and_createdAt', ['ownerId', 'state', 'createdAt']),
  callUsefulnessFeedback: defineTable({
    callRef: v.string(), accountRef: v.string(), toolRef: v.string(), feedback: callFeedbackValue,
    createdAt: v.number(), updatedAt: v.number(), expiresAt: v.number(),
  })
    .index('by_accountRef_and_callRef', ['accountRef', 'callRef'])
    .index('by_updatedAt', ['updatedAt'])
    .index('by_expiresAt', ['expiresAt']),
  toolSelectionDecisions: defineTable({
    kind: v.union(
      v.literal('procure'),
      v.literal('registry_rerank'),
      v.literal('directory_rerank'),
      v.literal('chat_recommend'),
    ),
    threadId: v.optional(v.string()),
    promptMessageId: v.optional(v.string()),
    shown: v.optional(v.boolean()),
    ranToolRef: v.optional(v.string()),
    ranAt: v.optional(v.number()),
    accountRef: v.optional(v.string()),
    correlationId: v.string(),
    offered: v.array(v.object({
      toolRef: v.string(),
      rank: v.number(),
      score: v.number(),
    })),
    pickedToolRef: v.optional(v.string()),
    tier: v.string(),
    modelConfidence: v.optional(v.number()),
    fit: v.array(v.object({
      toolRef: v.string(),
      noul: v.optional(v.number()),
      score: v.optional(v.number()),
    })),
    latencyMs: v.number(),
    costAud: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_kind_and_createdAt', ['kind', 'createdAt'])
    .index('by_createdAt', ['createdAt'])
    .index('by_threadId_and_promptMessageId', ['threadId', 'promptMessageId'])
    .index('by_threadId_and_createdAt', ['threadId', 'createdAt']),
} as const
