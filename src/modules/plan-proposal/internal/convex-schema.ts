import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

const PlanStatusValues = ['active', 'completed', 'failed', 'expired', 'superseded'] as const
const PlanEventKindValues = [
  'plan_authored',
  'plan_revised',
  'step_started',
  'step_completed',
  'step_failed',
  'goal_evaluated',
  'outcome_recorded',
] as const

export const enginePlanTables = {
  enginePlans: defineTable({
    planId: v.string(),
    threadId: v.string(),
    revision: v.number(),
    revisionOf: v.optional(v.number()),
    contractJson: v.string(),
    planDigest: v.string(),
    status: literalUnion(PlanStatusValues),
    stepStatusesJson: v.string(),
    outcomeJson: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    operationKey: v.string(),
    payloadDigest: v.string(),
  })
    .index('by_planId_and_revision', ['planId', 'revision'])
    .index('by_threadId', ['threadId'])
    .index('by_operationKey', ['operationKey']),

  enginePlanEvents: defineTable({
    planId: v.string(),
    revision: v.number(),
    seq: v.number(),
    kind: literalUnion(PlanEventKindValues),
    stepId: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    payloadJson: v.string(),
    costUsd: v.optional(v.number()),
    at: v.number(),
    operationKey: v.string(),
    payloadDigest: v.string(),
  }).index('by_planId_and_revision_and_seq', ['planId', 'revision', 'seq'])
    .index('by_planId_and_seq', ['planId', 'seq'])
    .index('by_operationKey', ['operationKey']),
} as const
