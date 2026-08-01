import { z } from 'zod'
import {
  decisionMapDraftSchema,
  type DecisionMapDraft,
} from '@/modules/decision-map/public'

import { planContractSchema } from './plan-contract'

export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plan_revision'),
    proposalId: z.string().min(8),
    plan: planContractSchema,
  }),
  z.object({
    kind: z.literal('decision_map_revision'),
    proposalId: z.string().min(8),
    decisionMap: decisionMapDraftSchema,
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
const transportIdSchema = z.string().min(1).max(80)

/**
 * The kernel requires 3-7 childless top-level areas with decisions hanging off
 * exactly one of them, and that shape is not expressible in JSON Schema. Every
 * model asked for a flat node list distributed one decision per area instead,
 * repair attempts included. So the transport shape names the single branch area
 * and nests its decisions: the invalid arrangement no longer exists to emit.
 */
const transportDecisionSchema = z.object({
  id: transportIdSchema,
  label: z.string().min(1).max(240),
  summary: z.string().min(1).max(500).nullable(),
  ready: z.boolean(),
  dependsOn: z.array(transportIdSchema).max(10),
  constraintRefs: z.array(transportIdSchema).max(5),
  options: z.array(z.object({
    id: transportIdSchema,
    label: z.string().min(1).max(240),
    summary: z.string().min(1).max(500),
  })).min(2).max(4),
  recommendedOptionId: transportIdSchema,
  reason: z.string().min(1).max(500),
  unlocks: z.array(transportIdSchema).max(10),
  parkTrigger: z.string().min(1).max(500),
})
const transportDecisionMapSchema = z.object({
  version: z.literal('decisionMap_v1'),
  goalText: z.string().min(1).max(500),
  summary: z.string().min(1).max(500),
  assumptions: z.array(z.object({
    id: transportIdSchema,
    label: z.string().min(1).max(240),
    value: z.string().min(1).max(500),
    source: z.enum(['inferred', 'default']),
  })).min(1).max(5),
  /** The one area whose decisions are open now. Listed first in the map. */
  branchArea: z.object({
    id: transportIdSchema,
    label: z.string().min(1).max(240),
    summary: z.string().min(1).max(500).nullable(),
    decisions: z.array(transportDecisionSchema).min(2).max(3),
  }),
  /** The remaining parts of the job, still unopened. */
  otherAreas: z.array(z.object({
    id: transportIdSchema,
    label: z.string().min(1).max(240),
    summary: z.string().min(1).max(500).nullable(),
  })).min(2).max(6),
})

export const modelProposalSchema = z.object({
  kind: z.enum(['plan_revision', 'decision_map_revision', 'next_action', 'clarifying_question', 'recommendation']),
  proposalId: z.string().min(8),
  plan: transportPlanSchema.nullable(),
  decisionMap: transportDecisionMapSchema.nullable(),
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
function foldTransportDecisionMap(map: z.infer<typeof transportDecisionMapSchema>): unknown {
  const { branchArea, otherAreas, ...rest } = map
  // The kernel wants exactly one ready decision; the transport lets the model
  // flag readiness per decision, so the first flagged one wins and the rest
  // queue behind it. A map with none flagged opens its first decision.
  const readyIndex = Math.max(0, branchArea.decisions.findIndex((decision) => decision.ready))
  return {
    ...rest,
    nodes: [
      {
        id: branchArea.id,
        kind: 'area',
        label: branchArea.label,
        ...(branchArea.summary === null ? {} : { summary: branchArea.summary }),
        status: 'queued',
        dependsOn: [],
        constraintRefs: [],
      },
      ...otherAreas.map((area) => ({
        id: area.id,
        kind: 'area',
        label: area.label,
        ...(area.summary === null ? {} : { summary: area.summary }),
        status: 'fog',
        dependsOn: [],
        constraintRefs: [],
      })),
      ...branchArea.decisions.map((decision, index) => ({
        id: decision.id,
        kind: 'decision',
        label: decision.label,
        ...(decision.summary === null ? {} : { summary: decision.summary }),
        status: index === readyIndex ? 'ready' : 'queued',
        parentId: branchArea.id,
        // A ready decision may not depend on an unlocked decision, so the
        // opening decision starts clear of the dependencies the model wrote.
        dependsOn: index === readyIndex ? [] : decision.dependsOn,
        constraintRefs: decision.constraintRefs,
        options: decision.options,
        recommendedOptionId: decision.recommendedOptionId,
        reason: decision.reason,
        unlocks: decision.unlocks,
        parkTrigger: decision.parkTrigger,
      })),
    ],
  }
}

/**
 * A rejected transport payload must say why: the reason is fed back to the
 * model as repair instructions, so a bare `undefined` costs the engine its
 * only chance to correct a fixable mistake.
 */
export type FoldedModelProposal =
  | { proposal: Proposal; issue?: never }
  | { proposal?: never; issue: string }

function foldIssue(kind: string, error: z.ZodError): FoldedModelProposal {
  const fields = error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join('.')} ${issue.message}`)
    .join('; ')
  return { issue: `${kind}_shape_invalid: ${fields}` }
}

export function foldModelProposal(flat: z.infer<typeof modelProposalSchema>): FoldedModelProposal {
  switch (flat.kind) {
    case 'plan_revision': {
      if (flat.plan == null) return { issue: 'plan_revision_requires_plan' }
      const parsed = planContractSchema.safeParse(foldTransportPlan(flat.plan))
      return parsed.success
        ? { proposal: { kind: 'plan_revision', proposalId: flat.proposalId, plan: parsed.data } }
        : foldIssue('plan', parsed.error)
    }
    case 'decision_map_revision': {
      if (flat.decisionMap == null) return { issue: 'decision_map_revision_requires_decision_map' }
      const parsed = decisionMapDraftSchema.safeParse(foldTransportDecisionMap(flat.decisionMap))
      return parsed.success
        ? { proposal: { kind: 'decision_map_revision', proposalId: flat.proposalId, decisionMap: parsed.data } }
        : foldIssue('decision_map', parsed.error)
    }
    case 'next_action':
      return flat.stepId == null
        ? { issue: 'next_action_requires_step_id' }
        : {
            proposal: {
              kind: 'next_action',
              proposalId: flat.proposalId,
              stepId: flat.stepId,
              rationale: flat.rationale ?? '',
            },
          }
    case 'clarifying_question':
      return flat.question == null
        ? { issue: 'clarifying_question_requires_question' }
        : {
            proposal: {
              kind: 'clarifying_question',
              proposalId: flat.proposalId,
              question: flat.question,
              blockedOn: flat.blockedOn ?? '',
            },
          }
    case 'recommendation':
      return flat.summary == null || flat.nextStep == null
        ? { issue: 'recommendation_requires_summary_and_next_step' }
        : {
            proposal: {
              kind: 'recommendation',
              proposalId: flat.proposalId,
              summary: flat.summary,
              ...(flat.recommendedSlug == null || flat.recommendedSlug === ''
                ? {}
                : { recommendedSlug: flat.recommendedSlug }),
              nextStep: flat.nextStep,
            },
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
        decisionMap: null,
        stepId: null,
        rationale: null,
        question: null,
        blockedOn: null,
        summary: null,
        recommendedSlug: null,
        nextStep: null,
      }
    case 'decision_map_revision':
      return {
        kind: 'decision_map_revision',
        proposalId: proposal.proposalId,
        plan: null,
        decisionMap: toTransportDecisionMap(proposal.decisionMap),
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
        decisionMap: null,
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
        decisionMap: null,
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
        decisionMap: null,
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

function toTransportDecisionMap(map: DecisionMapDraft): z.infer<typeof transportDecisionMapSchema> {
  const { nodes, ...rest } = map
  const decisions = nodes.filter((node) => node.kind === 'decision')
  const branchAreaId = decisions[0]?.parentId
  const areas = nodes.filter((node) => node.kind === 'area')
  const branch = areas.find((area) => area.id === branchAreaId) ?? areas[0]
  return {
    ...rest,
    branchArea: {
      id: branch?.id ?? '',
      label: branch?.label ?? '',
      summary: branch?.summary ?? null,
      decisions: decisions.map((decision) => ({
        id: decision.id,
        label: decision.label,
        summary: decision.summary ?? null,
        ready: decision.status === 'ready',
        dependsOn: decision.dependsOn,
        constraintRefs: decision.constraintRefs,
        options: decision.options,
        recommendedOptionId: decision.recommendedOptionId,
        reason: decision.reason,
        unlocks: decision.unlocks,
        parkTrigger: decision.parkTrigger,
      })),
    },
    otherAreas: areas
      .filter((area) => area.id !== branch?.id)
      .map((area) => ({ id: area.id, label: area.label, summary: area.summary ?? null })),
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
