import { describeActionForAgent, listActions, type AnyAction } from '@/modules/actions'
import { z } from 'zod'


import {
  MAX_ACTIONS_PER_TURN,
  MAX_MODEL_CALLS_PER_TURN,
  TURN_COST_CEILING_USD,
  WORST_CASE_MODEL_CALL_RESERVE_USD,
} from './internal/budgets'
import { flattenProposalForTransport, foldModelProposal, modelProposalSchema, proposalSchema, type Proposal } from './internal/contract'
import { buildCandidateMenu } from './internal/menu'
import {
  ProposalTransportError,
  requestProposalModel,
  type ProposalModelResponse,
} from './internal/model-transport'
import {
  authorPlanEnvelope,
  goalPredicateSchema,
  PLAN_EXPIRY_MS,
  planContractSchema,
  planStepSchema,
  stepCriterionSchema,
  type GoalPredicate,
  type PlanContract,
  type PlanEnvelope,
  type PlanFailureReason,
  type PlanStepStatus,
  type PlanStatus,
} from './internal/plan-contract'
import {
  derivePlanMetrics,
  evaluateGoalPredicate,
  type PlanEvent,
  type PlanEventKind,
  type PlanMetrics,
} from './internal/metrics'

export async function runProposalSegment(input: Readonly<{
  query: string
  threadContext: string
  activePlan?: Readonly<{ contract: PlanContract; stepStatuses: Record<string, PlanStepStatus> }>
  evidence: readonly { stepId?: string; actionId: string; resultJson: string }[]
  allowedSlugs?: readonly string[]
  spentUsd: number
  actionsUsed?: number
  planRevisionUsed?: boolean
  segmentIndex: number
}>): Promise<
  | { kind: 'proposal'; proposal: Proposal; model: ProposalModelResponse }
  | { kind: 'budget_exhausted' | 'transport_failed'; reason: string; model?: ProposalModelResponse }
> {
  const actionsUsed = input.actionsUsed ?? input.evidence.length
  if (input.segmentIndex >= MAX_MODEL_CALLS_PER_TURN
    || input.spentUsd + WORST_CASE_MODEL_CALL_RESERVE_USD > TURN_COST_CEILING_USD
    || actionsUsed > MAX_ACTIONS_PER_TURN) {
    return { kind: 'budget_exhausted', reason: 'turn_budget_exhausted' }
  }
  if (input.activePlan !== undefined
    && Object.values(input.activePlan.stepStatuses).filter((status) => status === 'in_progress').length > 1) {
    return { kind: 'transport_failed', reason: 'multiple_steps_in_progress' }
  }

  const stage = input.activePlan === undefined && input.evidence.length === 0 ? 'discover' : 'compare'
  const menu = buildCandidateMenu(stage, listActions())
  const proposalId = crypto.randomUUID()

  try {
    const response = await requestProposalModel({
      role: 'proposal',
      schema: modelProposalSchema,
      system: [
        'Return one typed proposal. Never execute actions.',
        'Echo the supplied proposalId exactly; never invent a new one.',
        'goalPredicateKind must be one of quotes_received, options_compared, recommendation_delivered.',
        'Each step successCriterionKind must be one of action_completed, result_kind, nonempty_results.',
        'Each step input carries only the fields the action inputJsonSchema names (example: {"query":"wedding photographer","limit":3}); omit or null every field that does not apply — never invent placeholder values.',
        'Each step actionId must come from candidateMenu.',
      ].join(' '),
      prompt: JSON.stringify({
        proposalId,
        requirement: input.activePlan === undefined
          ? 'Author a plan_revision before proposing an action.'
          : actionsUsed >= MAX_ACTIONS_PER_TURN
            ? 'Return one terminal clarifying_question or recommendation; no more actions are available.'
            : 'Propose one frontier action, a plan revision, one clarifying question, or a recommendation.',
        query: input.query,
        stepInputRules: 'Every step input must satisfy the action inputJsonSchema, including all required fields.',
        exampleSearchStep: {
          id: 'search',
          title: 'Search current listings',
          actionId: 'registry.search',
          input: { query: input.query, limit: 3 },
          dependsOn: [],
          successCriterion: { kind: 'nonempty_results' },
        },
        threadContext: input.threadContext,
        activePlan: input.activePlan ?? null,
        evidence: input.evidence,
        candidateMenu: menu.map(describeActionForAgent),
      }),
    })
    if (response.costUsd === undefined
      || !Number.isFinite(response.costUsd)
      || response.costUsd < 0) {
      return { kind: 'budget_exhausted', reason: 'provider_cost_unavailable', model: response }
    }
    if (input.spentUsd + response.costUsd > TURN_COST_CEILING_USD) {
      return { kind: 'budget_exhausted', reason: 'turn_cost_ceiling_exceeded', model: response }
    }

    const folded = foldModelProposal(modelProposalSchema.parse(response.object))
    if (folded === undefined) {
      return { kind: 'transport_failed', reason: 'invalid_response', model: response }
    }
    const proposal = proposalSchema.parse(folded)
    const reason = validateProposalAgainstKernel(
      proposal,
      proposalId,
      menu,
      input.activePlan,
      input.evidence,
      input.allowedSlugs,
      actionsUsed,
      input.planRevisionUsed ?? false,
    )
    return reason === undefined
      ? { kind: 'proposal', proposal, model: response }
      : { kind: 'transport_failed', reason, model: response }
  } catch (error) {
    return {
      kind: 'transport_failed',
      reason: error instanceof ProposalTransportError ? error.code : 'invalid_response',
    }
  }
}

export function validateProposalAgainstKernel(
  proposal: Proposal,
  expectedProposalId: string,
  menu: readonly AnyAction[],
  activePlan: Readonly<{ contract: PlanContract; stepStatuses: Record<string, PlanStepStatus> }> | undefined,
  evidence: readonly unknown[] = [],
  allowedSlugs: readonly string[] = [],
  actionsUsed = 0,
  planRevisionUsed = false,
): string | undefined {
  if (proposal.proposalId !== expectedProposalId) return 'proposal_nonce_mismatch'
  if (activePlan === undefined && proposal.kind !== 'plan_revision') {
    return 'active_plan_required'
  }
  if (proposal.kind === 'plan_revision') {
    if (planRevisionUsed) return 'plan_revision_budget_exhausted'
    if (activePlan !== undefined && Object.values(activePlan.stepStatuses).includes('in_progress')) {
      return 'plan_revision_in_progress'
    }
    return validatePlan(proposal.plan, menu)
  }
  if (proposal.kind === 'recommendation') {
    if (activePlan === undefined) return 'active_plan_required'
    if (evidence.length === 0) return 'recommendation_evidence_required'
    if (activePlan.contract.steps.some(({ id }) => activePlan.stepStatuses[id] !== 'completed')) {
      return 'recommendation_steps_incomplete'
    }
    if (proposal.recommendedSlug !== undefined && !allowedSlugs.includes(proposal.recommendedSlug)) {
      return 'recommendation_slug_not_allowed'
    }
    return undefined
  }
  if (proposal.kind !== 'next_action') return undefined
  if (activePlan === undefined) return 'active_plan_required'
  if (actionsUsed >= MAX_ACTIONS_PER_TURN) return 'action_budget_exhausted'
  if (Object.values(activePlan.stepStatuses).includes('in_progress')) return 'step_already_in_progress'
  const step = activePlan.contract.steps.find(({ id }) => id === proposal.stepId)
  if (step === undefined) return 'step_not_found'
  if ((activePlan.stepStatuses[step.id] ?? 'pending') !== 'pending') return 'step_not_pending'
  if (!step.dependsOn.every((id) => activePlan.stepStatuses[id] === 'completed')) {
    return 'step_not_frontier'
  }
  return undefined
}

function declaredInputKeys(schema: z.ZodType): ReadonlySet<string> | undefined {
  return schema instanceof z.ZodObject ? new Set(Object.keys(schema.shape)) : undefined
}

function validatePlan(plan: PlanContract, menu: readonly AnyAction[]): string | undefined {
  const stepsById = new Map(plan.steps.map((step) => [step.id, step]))
  if (stepsById.size !== plan.steps.length) return 'duplicate_step_id'
  const actionsById = new Map(menu.map((action) => [action.id, action]))
  for (const step of plan.steps) {
    const action = actionsById.get(step.actionId)
    if (step.actionId === 'web.discover'
      && !step.dependsOn.some((dependency) => stepsById.get(dependency)?.actionId === 'registry.search')) {
      return 'web_discovery_requires_registry_search'
    }
    if (action === undefined) return 'proposal_action_not_in_menu'
    if (action.effect.class !== 'observation' && action.effect.class !== 'comparison_quote') {
      return 'proposal_effect_not_allowed'
    }
    if (step.input === null || step.input === undefined) step.input = {}
    if (typeof step.input === 'string') {
      try {
        const parsed: unknown = JSON.parse(step.input)
        if (parsed !== null && typeof parsed === 'object') step.input = parsed
      } catch {
        // leave as-is; schema validation below refuses it
      }
    }
    if (typeof step.input === 'object' && step.input !== null) {
      // Strict structured-output grammars force every declared property, so
      // models fill inapplicable fields with '', null, or invented placeholders.
      // Keep only meaningful values for keys the action actually declares.
      const declaredKeys = declaredInputKeys(action.schema)
      step.input = Object.fromEntries(
        Object.entries(step.input).filter(([key, value]) => value !== '' && value !== null && value !== undefined
          && (declaredKeys === undefined || declaredKeys.has(key))),
      )
    }
    if (!action.schema.safeParse(step.input).success) return 'proposal_action_input_invalid'
    if (step.dependsOn.some((dependency) => !stepsById.has(dependency) || dependency === step.id)) {
      return 'proposal_dependency_invalid'
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cyclic = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    const step = stepsById.get(id)
    if (step?.dependsOn.some(cyclic) === true) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return plan.steps.some(({ id }) => cyclic(id)) ? 'proposal_plan_cyclic' : undefined
}

export {
  activePlanFromStored,
  persistEnginePlanEvent,
  persistEnginePlanRevision,
  readStoredEnginePlan,
  setEnginePlanStorePortForTests,
  type RecordEnginePlanEventInput,
  type StoredEnginePlan,
  type StoredEnginePlanWithEvents,
} from './internal/plan-store'

export type { ProposalModelResponse } from './internal/model-transport'

export {
  MAX_ACTIONS_PER_TURN,
  MAX_MODEL_CALLS_PER_TURN,
  TURN_COST_CEILING_USD,
} from './internal/budgets'

export {
  authorPlanEnvelope,
  buildCandidateMenu,
  derivePlanMetrics,
  evaluateGoalPredicate,
  goalPredicateSchema,
  flattenProposalForTransport,
  modelProposalSchema,
  PLAN_EXPIRY_MS,
  planContractSchema,
  planStepSchema,
  proposalSchema,
  stepCriterionSchema,
  type GoalPredicate,
  type PlanContract,
  type PlanEnvelope,
  type PlanEvent,
  type PlanEventKind,
  type PlanFailureReason,
  type PlanMetrics,
  type PlanStatus,
  type PlanStepStatus,
  type Proposal,
}
