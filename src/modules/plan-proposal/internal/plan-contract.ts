import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { MAX_ACTIONS_PER_TURN, TURN_COST_CEILING_USD } from './budgets'

export const goalPredicateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quotes_received'), minCount: z.number().int().min(1).max(5) }),
  z.object({ kind: z.literal('options_compared'), minCount: z.number().int().min(1).max(7) }),
  z.object({ kind: z.literal('recommendation_delivered') }),
])

export const stepCriterionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('action_completed') }),
  z.object({ kind: z.literal('result_kind'), expected: z.string() }),
  z.object({ kind: z.literal('nonempty_results') }),
])

export const planStepSchema = z.object({
  id: z.string().min(1).max(24),
  title: z.string().max(120),
  actionId: z.string(),
  // Declared superset of the Phase-1 candidate-menu action inputs: strict
  // structured-output grammars only let the model fill DECLARED properties,
  // so a free-form record degenerates to {}. The kernel still validates each
  // step against the real action schema before dispatch.
  input: z.object({
    query: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(10).optional(),
    slug: z.string().max(120).optional(),
  }),
  dependsOn: z.array(z.string()).max(4),
  successCriterion: stepCriterionSchema,
})

export const planContractSchema = z.object({
  goalText: z.string().max(300),
  goalPredicate: goalPredicateSchema,
  steps: z.array(planStepSchema).min(1).max(6),
  rationale: z.string().max(400),
})

export type GoalPredicate = z.infer<typeof goalPredicateSchema>
export type PlanContract = z.infer<typeof planContractSchema>
export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
export type PlanStatus = 'active' | 'completed' | 'failed' | 'expired' | 'superseded'
export type PlanFailureReason =
  | 'limit_exceeded'
  | 'expired'
  | 'transport_failed'
  | 'escalated_to_person'
  | 'no_supply'
  | 'predicate_unmet'
export type PlanBounds = Readonly<{
  allowedEffectClasses: readonly ['observation', 'comparison_quote']
  maxActions: number
  maxCostUsd: number
  expiresAt: number
}>

export type PlanEnvelope = Readonly<{
  planId: string
  threadId: string
  revision: number
  revisionOf?: number
  planDigest: string
  bounds: PlanBounds
  issuer: 'ae_engine:plan:v1'
  contract: PlanContract
}>

export const PLAN_EXPIRY_MS = 15 * 60 * 1_000

export function authorPlanEnvelope(input: Readonly<{
  planId: string
  threadId: string
  revision: number
  revisionOf?: number
  authoredAt: number
  contract: PlanContract
}>): PlanEnvelope {
  const contract = planContractSchema.parse(input.contract)
  return {
    planId: input.planId,
    threadId: input.threadId,
    revision: input.revision,
    ...(input.revisionOf === undefined ? {} : { revisionOf: input.revisionOf }),
    planDigest: canonicalDigest(contract as unknown as StableHashValue),
    bounds: {
      allowedEffectClasses: ['observation', 'comparison_quote'],
      maxActions: MAX_ACTIONS_PER_TURN,
      maxCostUsd: TURN_COST_CEILING_USD,
      expiresAt: input.authoredAt + PLAN_EXPIRY_MS,
    },
    issuer: 'ae_engine:plan:v1',
    contract,
  }
}
