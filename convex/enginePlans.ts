import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  PLAN_EXPIRY_MS,
  planContractSchema,
  type PlanStepStatus,
} from '../src/modules/plan-proposal/internal/plan-contract'
import { literalUnion } from '../src/modules/common/convex-literals'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'

const PlanEventKindValues = [
  'step_started', 'step_completed', 'step_failed', 'goal_evaluated', 'outcome_recorded',
] as const
const MAX_EVENT_PAYLOAD_BYTES = 16_384
const MAX_PLAN_EVENTS = 128
const encoder = new TextEncoder()

const planMetricsSchema = z.strictObject({
  stepsCompleted: z.number().int().min(0),
  stepsTotal: z.number().int().min(0),
  optionsCompared: z.number().int().min(0),
  quotesReceived: z.number().int().min(0),
  recommendationDelivered: z.boolean(),
  costUsd: z.number().min(0),
  wallMs: z.number().min(0),
  actionsUsed: z.number().int().min(0),
})
const planOutcomeSchema = z.strictObject({
  success: z.boolean(),
  failureReason: z.enum([
    'limit_exceeded', 'expired', 'transport_failed', 'escalated_to_person', 'no_supply', 'predicate_unmet',
  ]).optional(),
  metrics: planMetricsSchema,
  evaluatedAt: z.number(),
}).superRefine((value, ctx) => {
  if (!value.success && value.failureReason === undefined) {
    ctx.addIssue({ code: 'custom', path: ['failureReason'], message: 'failure_reason_required' })
  }
})

type OperationResult = { planId: string; revision: number; seq: number }
type EventResult = { planId: string; seq: number; status?: 'expired' }

export const recordPlanRevision = mutationGeneric({
  args: {
    planId: v.string(),
    threadId: v.string(),
    revision: v.number(),
    revisionOf: v.optional(v.number()),
    contractJson: v.string(),
    planDigest: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    costUsd: v.optional(v.number()),
    operationKey: v.string(),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args): Promise<OperationResult> => {
    await requirePlanSourceWrite(ctx, args)
    if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error('plan_revision_invalid')
    if (args.expiresAt !== args.createdAt + PLAN_EXPIRY_MS) throw new Error('plan_expiry_invalid')
    const contract = planContractSchema.parse(JSON.parse(args.contractJson))
    if (canonicalDigest(contract as unknown as StableHashValue) !== args.planDigest) {
      throw new Error('plan_digest_invalid')
    }
    const payloadDigest = canonicalDigest({
      planId: args.planId,
      threadId: args.threadId,
      revision: args.revision,
      ...(args.revisionOf === undefined ? {} : { revisionOf: args.revisionOf }),
      contractJson: args.contractJson,
      planDigest: args.planDigest,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
      ...(args.costUsd === undefined ? {} : { costUsd: args.costUsd }),
    } as unknown as StableHashValue)
    const operation = await ctx.db.query('enginePlans')
      .withIndex('by_operationKey', (query) => query.eq('operationKey', args.operationKey))
      .first()
    if (operation !== null) {
      if (operation.payloadDigest !== payloadDigest) throw new Error('operation_key_conflict')
      const event = await ctx.db.query('enginePlanEvents')
        .withIndex('by_operationKey', (query) => query.eq('operationKey', args.operationKey))
        .first()
      if (event === null) throw new Error('operation_result_missing')
      return { planId: operation.planId, revision: operation.revision, seq: event.seq }
    }

    const previous = await ctx.db.query('enginePlans')
      .withIndex('by_planId_and_revision', (query) => query.eq('planId', args.planId))
      .order('desc')
      .first()
    if (previous === null) {
      if (args.revision !== 1 || args.revisionOf !== undefined) throw new Error('plan_lineage_invalid')
    } else {
      if (previous.threadId !== args.threadId
        || args.revision !== previous.revision + 1
        || args.revisionOf !== previous.revision) throw new Error('plan_lineage_invalid')
      const previousStatuses = JSON.parse(previous.stepStatusesJson) as Record<string, PlanStepStatus>
      if (previous.status === 'active' && Object.values(previousStatuses).includes('in_progress')) {
        throw new Error('plan_revision_in_progress')
      }
      await ctx.db.patch(previous._id, { status: 'superseded' })
    }

    const stepStatuses = Object.fromEntries(contract.steps.map(({ id }) => [id, 'pending'])) as Record<string, PlanStepStatus>
    await ctx.db.insert('enginePlans', {
      planId: args.planId,
      threadId: args.threadId,
      revision: args.revision,
      ...(args.revisionOf === undefined ? {} : { revisionOf: args.revisionOf }),
      contractJson: JSON.stringify(contract),
      planDigest: args.planDigest,
      status: 'active',
      stepStatusesJson: JSON.stringify(stepStatuses),
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
      operationKey: args.operationKey,
      payloadDigest,
    })
    const lastEvent = await ctx.db.query('enginePlanEvents')
      .withIndex('by_planId_and_seq', (query) => query.eq('planId', args.planId))
      .order('desc')
      .first()
    const seq = (lastEvent?.seq ?? 0) + 1
    if (seq > MAX_PLAN_EVENTS) throw new Error('plan_event_limit')
    await ctx.db.insert('enginePlanEvents', {
      planId: args.planId,
      revision: args.revision,
      seq,
      kind: previous === null ? 'plan_authored' : 'plan_revised',
      payloadJson: JSON.stringify({ revision: args.revision, stepsTotal: contract.steps.length, planDigest: args.planDigest }),
      at: args.createdAt,
      ...(args.costUsd === undefined ? {} : { costUsd: args.costUsd }),
      operationKey: args.operationKey,
      payloadDigest,
    })
    return { planId: args.planId, revision: args.revision, seq }
  },
})

export const recordPlanEvent = mutationGeneric({
  args: {
    planId: v.string(),
    expectedRevision: v.optional(v.number()),
    expectedPlanDigest: v.optional(v.string()),
    kind: literalUnion(PlanEventKindValues),
    stepId: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    payloadJson: v.string(),
    costUsd: v.optional(v.number()),
    at: v.number(),
    outcomeJson: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args): Promise<EventResult> => {
    await requirePlanSourceWrite(ctx, args)
    if (encoder.encode(args.payloadJson).byteLength > MAX_EVENT_PAYLOAD_BYTES) throw new Error('plan_event_payload_too_large')
    if (args.costUsd !== undefined && (!Number.isFinite(args.costUsd) || args.costUsd < 0)) throw new Error('plan_event_cost_invalid')
    const payloadDigest = canonicalDigest({
      planId: args.planId,
      ...(args.expectedRevision === undefined ? {} : { expectedRevision: args.expectedRevision }),
      ...(args.expectedPlanDigest === undefined ? {} : { expectedPlanDigest: args.expectedPlanDigest }),
      kind: args.kind,
      ...(args.stepId === undefined ? {} : { stepId: args.stepId }),
      ...(args.toolCallId === undefined ? {} : { toolCallId: args.toolCallId }),
      payloadJson: args.payloadJson,
      ...(args.costUsd === undefined ? {} : { costUsd: args.costUsd }),
      at: args.at,
      ...(args.outcomeJson === undefined ? {} : { outcomeJson: args.outcomeJson }),
    } as unknown as StableHashValue)
    const operation = await ctx.db.query('enginePlanEvents')
      .withIndex('by_operationKey', (query) => query.eq('operationKey', args.operationKey))
      .first()
    if (operation !== null) {
      if (operation.payloadDigest !== payloadDigest) throw new Error('operation_key_conflict')
      return { planId: operation.planId, seq: operation.seq }
    }

    const plan = await ctx.db.query('enginePlans')
      .withIndex('by_planId_and_revision', (query) => query.eq('planId', args.planId))
      .order('desc')
      .first()
    if (plan === null) throw new Error('plan_not_found')
    if (args.expectedRevision !== undefined && args.expectedRevision !== plan.revision) throw new Error('plan_revision_fence_mismatch')
    if (args.expectedPlanDigest !== undefined && args.expectedPlanDigest !== plan.planDigest) throw new Error('plan_digest_fence_mismatch')
    if (plan.status !== 'active') throw new Error('plan_not_active')
    if (args.at >= plan.expiresAt && args.kind === 'step_started') {
      await ctx.db.patch(plan._id, {
        status: 'expired',
        outcomeJson: JSON.stringify({
          success: false,
          failureReason: 'expired',
          metrics: emptyMetrics(),
          evaluatedAt: args.at,
        }),
      })
      return { planId: args.planId, seq: 0, status: 'expired' }
    }

    const contract = planContractSchema.parse(JSON.parse(plan.contractJson))
    const statuses = JSON.parse(plan.stepStatusesJson) as Record<string, PlanStepStatus>
    const step = args.stepId === undefined ? undefined : contract.steps.find(({ id }) => id === args.stepId)
    if (args.kind === 'step_started') {
      if (step === undefined || statuses[step.id] !== 'pending') throw new Error('plan_step_not_pending')
      if (Object.values(statuses).includes('in_progress')) throw new Error('plan_step_already_in_progress')
      if (!step.dependsOn.every((dependency) => statuses[dependency] === 'completed')) throw new Error('plan_step_not_frontier')
      statuses[step.id] = 'in_progress'
    } else if (args.kind === 'step_completed' || args.kind === 'step_failed') {
      if (step === undefined || statuses[step.id] !== 'in_progress') throw new Error('plan_step_not_in_progress')
      statuses[step.id] = args.kind === 'step_completed' ? 'completed' : 'failed'
    } else if (args.stepId !== undefined) {
      throw new Error('plan_event_step_unexpected')
    }
    if (Object.values(statuses).filter((status) => status === 'in_progress').length > 1) throw new Error('plan_multiple_steps_in_progress')
    const outcome = args.kind === 'outcome_recorded' ? planOutcomeSchema.parse(JSON.parse(args.outcomeJson ?? 'null')) : undefined
    if (args.kind !== 'outcome_recorded' && args.outcomeJson !== undefined) throw new Error('plan_outcome_unexpected')
    const lastEvent = await ctx.db.query('enginePlanEvents')
      .withIndex('by_planId_and_seq', (query) => query.eq('planId', args.planId))
      .order('desc')
      .first()
    const seq = (lastEvent?.seq ?? 0) + 1
    if (seq > MAX_PLAN_EVENTS) throw new Error('plan_event_limit')
    await ctx.db.insert('enginePlanEvents', {
      planId: args.planId,
      revision: plan.revision,
      seq,
      kind: args.kind,
      ...(args.stepId === undefined ? {} : { stepId: args.stepId }),
      ...(args.toolCallId === undefined ? {} : { toolCallId: args.toolCallId }),
      payloadJson: args.payloadJson,
      ...(args.costUsd === undefined ? {} : { costUsd: args.costUsd }),
      at: args.at,
      operationKey: args.operationKey,
      payloadDigest,
    })
    await ctx.db.patch(plan._id, {
      stepStatusesJson: JSON.stringify(statuses),
      ...(outcome === undefined ? {} : {
        outcomeJson: JSON.stringify(outcome),
        status: outcome.success ? 'completed' as const : outcome.failureReason === 'expired' ? 'expired' as const : 'failed' as const,
      }),
    })
    return { planId: args.planId, seq }
  },
})

export const readPlanWithEvents = queryGeneric({
  args: { threadId: v.string(), pseudonymousSessionId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const thread = await ctx.db.query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (thread !== null && thread.pseudonymousSessionId !== args.pseudonymousSessionId) throw new Error('thread_forbidden')
    const plans = await ctx.db.query('enginePlans')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .order('desc')
      .take(20)
    const latest = plans[0]
    if (latest === undefined) return null
    const plan = await ctx.db.query('enginePlans')
      .withIndex('by_planId_and_revision', (query) => query.eq('planId', latest.planId))
      .filter((query) => query.eq(query.field('revision'), latest.revision))
      .unique()
    if (plan === null) return null
    const events = await ctx.db.query('enginePlanEvents')
      .withIndex('by_planId_and_seq', (query) => query.eq('planId', plan.planId))
      .order('asc')
      .take(MAX_PLAN_EVENTS)
    return { plan, events }
  },
})

async function requirePlanSourceWrite(ctx: { db: unknown }, args: SourceWriteArgs): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') throw new Error(`engine_plan_source_write_rejected:${sourceWrite.reason}`)
}

function emptyMetrics() {
  return {
    stepsCompleted: 0,
    stepsTotal: 0,
    optionsCompared: 0,
    quotesReceived: 0,
    recommendationDelivered: false,
    costUsd: 0,
    wallMs: 0,
    actionsUsed: 0,
  }
}
