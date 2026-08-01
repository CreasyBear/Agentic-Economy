import { z } from 'zod'

import { planContractSchema } from './plan-contract'

export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plan_revision'),
    proposalId: z.string().min(8),
    plan: planContractSchema,
  }),
  z.object({
    kind: z.literal('next_action'),
    proposalId: z.string().min(8),
    stepId: z.string(),
    rationale: z.string().max(400),
  }),
  z.object({
    kind: z.literal('clarifying_question'),
    proposalId: z.string().min(8),
    question: z.string().max(200),
    blockedOn: z.string().max(120),
  }),
  z.object({
    kind: z.literal('recommendation'),
    proposalId: z.string().min(8),
    summary: z.string().max(600),
    recommendedSlug: z.string().optional(),
    nextStep: z.string().max(200),
  }),
])

export type Proposal = z.infer<typeof proposalSchema>

/**
 * Grammar-friendly transport shape: several structured-output backends
 * (Azure OpenAI, DeepSeek) reject or mangle top-level `oneOf`, so the model
 * emits one flat object and the kernel folds it back into the typed union.
 */
const transportStepSchema = z.object({
  id: z.string().min(1).max(24),
  title: z.string().max(120),
  actionId: z.string(),
  input: z.object({
    query: z.string().max(200).nullable(),
    limit: z.number().int().min(1).max(10).nullable(),
    slug: z.string().max(120).nullable(),
  }).nullable(),
  dependsOn: z.array(z.string()).max(4),
  successCriterionKind: z.enum(['action_completed', 'result_kind', 'nonempty_results']),
  successCriterionExpected: z.string().max(60).nullable(),
})

const transportPlanSchema = z.object({
  goalText: z.string().max(240),
  goalPredicateKind: z.enum(['quotes_received', 'options_compared', 'recommendation_delivered']),
  goalPredicateMinCount: z.number().int().min(1).max(7).nullable(),
  steps: z.array(transportStepSchema).min(1).max(6),
  rationale: z.string().max(400),
})

export const modelProposalSchema = z.object({
  kind: z.enum(['plan_revision', 'next_action', 'clarifying_question', 'recommendation']),
  proposalId: z.string().min(8),
  plan: transportPlanSchema.nullable(),
  stepId: z.string().nullable(),
  rationale: z.string().max(400).nullable(),
  question: z.string().max(200).nullable(),
  blockedOn: z.string().max(120).nullable(),
  summary: z.string().max(600).nullable(),
  recommendedSlug: z.string().nullable(),
  nextStep: z.string().max(200).nullable(),
})

function foldTransportPlan(plan: z.infer<typeof transportPlanSchema>): unknown {
  return {
    goalText: plan.goalText,
    goalPredicate: plan.goalPredicateKind === 'recommendation_delivered'
      ? { kind: 'recommendation_delivered' }
      : { kind: plan.goalPredicateKind, minCount: plan.goalPredicateMinCount ?? 1 },
    steps: plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      actionId: step.actionId,
      input: Object.fromEntries(
        Object.entries(step.input ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== ''),
      ),
      dependsOn: step.dependsOn,
      successCriterion: step.successCriterionKind === 'result_kind'
        ? { kind: 'result_kind', expected: step.successCriterionExpected ?? '' }
        : { kind: step.successCriterionKind },
    })),
    rationale: plan.rationale,
  }
}

export function foldModelProposal(flat: z.infer<typeof modelProposalSchema>): Proposal | undefined {
  switch (flat.kind) {
    case 'plan_revision': {
      if (flat.plan == null) return undefined
      const parsed = planContractSchema.safeParse(foldTransportPlan(flat.plan))
      return parsed.success
        ? { kind: 'plan_revision', proposalId: flat.proposalId, plan: parsed.data }
        : undefined
    }
    case 'next_action':
      return flat.stepId == null
        ? undefined
        : { kind: 'next_action', proposalId: flat.proposalId, stepId: flat.stepId, rationale: flat.rationale ?? '' }
    case 'clarifying_question':
      return flat.question == null
        ? undefined
        : {
            kind: 'clarifying_question',
            proposalId: flat.proposalId,
            question: flat.question,
            blockedOn: flat.blockedOn ?? '',
          }
    case 'recommendation':
      return flat.summary == null || flat.nextStep == null
        ? undefined
        : {
            kind: 'recommendation',
            proposalId: flat.proposalId,
            summary: flat.summary,
            ...(flat.recommendedSlug == null || flat.recommendedSlug === '' ? {} : { recommendedSlug: flat.recommendedSlug }),
            nextStep: flat.nextStep,
          }
  }
}

/** Inverse of {@link foldModelProposal}; used by tests and eval mocks to speak the transport shape. */
export function flattenProposalForTransport(proposal: Proposal): z.infer<typeof modelProposalSchema> {
  switch (proposal.kind) {
    case 'plan_revision':
      return {
        kind: 'plan_revision',
        proposalId: proposal.proposalId,
        plan: {
          goalText: proposal.plan.goalText,
          goalPredicateKind: proposal.plan.goalPredicate.kind,
          goalPredicateMinCount: 'minCount' in proposal.plan.goalPredicate ? proposal.plan.goalPredicate.minCount : null,
          steps: proposal.plan.steps.map((step) => ({
            id: step.id,
            title: step.title,
            actionId: step.actionId,
            input: toTransportInput(step.input),
            dependsOn: step.dependsOn,
            successCriterionKind: step.successCriterion.kind,
            successCriterionExpected: step.successCriterion.kind === 'result_kind' ? step.successCriterion.expected : null,
          })),
          rationale: proposal.plan.rationale,
        },
        stepId: null,
        rationale: null,
        question: null,
        blockedOn: null,
        summary: null,
        recommendedSlug: null,
        nextStep: null,
      }
    case 'next_action':
      return {
        kind: 'next_action',
        proposalId: proposal.proposalId,
        plan: null,
        stepId: proposal.stepId,
        rationale: proposal.rationale,
        question: null,
        blockedOn: null,
        summary: null,
        recommendedSlug: null,
        nextStep: null,
      }
    case 'clarifying_question':
      return {
        kind: 'clarifying_question',
        proposalId: proposal.proposalId,
        plan: null,
        stepId: null,
        rationale: null,
        question: proposal.question,
        blockedOn: proposal.blockedOn,
        summary: null,
        recommendedSlug: null,
        nextStep: null,
      }
    case 'recommendation':
      return {
        kind: 'recommendation',
        proposalId: proposal.proposalId,
        plan: null,
        stepId: null,
        rationale: null,
        question: null,
        blockedOn: null,
        summary: proposal.summary,
        recommendedSlug: proposal.recommendedSlug ?? null,
        nextStep: proposal.nextStep,
      }
  }
}

function toTransportInput(input: unknown): z.infer<typeof transportStepSchema>['input'] {
  if (input === null || typeof input !== 'object') return { query: null, limit: null, slug: null }
  const record = input as Record<string, unknown> // structural read of a plain JSON object already type-checked above
  return {
    query: typeof record.query === 'string' ? record.query : null,
    limit: typeof record.limit === 'number' ? record.limit : null,
    slug: typeof record.slug === 'string' ? record.slug : null,
  }
}
