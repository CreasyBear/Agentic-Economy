import type { CompileCustomerRequestResult } from './compiler'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { PreparedRouteCandidateSet } from './preparation'
import { projectCustomerOptionSet } from './customer-option-set'
import type {
  CustomerOption, CustomerOptionSet, CustomerPreparedAction, CustomerRequestView, CustomerRouteConfirmation,
  CustomerRoutePlanDecision,
} from './agent-contract'

export type CustomerRequestState =
  | 'needs_information'
  | 'ready_to_compare'
  | 'routes_ready'
  | 'route_confirmed'
  | 'in_progress'
  | 'preparing_options'
  | 'options_ready'
  | 'no_options'
  | 'needs_authorization'
  | 'unsupported'
  | 'needs_attention'
  | 'outcome_unknown'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type CustomerRequestNextAction =
  | 'provide_information'
  | 'prepare_options'
  | 'inspect_routes'
  | 'inspect_confirmation'
  | 'wait'
  | 'inspect_options'
  | 'revise_request'
  | 'review_disclosure'
  | 'retry'
  | 'none'

export type {
  CustomerOption, CustomerOptionSet, CustomerPreparedAction, CustomerRequestView,
} from './agent-contract'
export type CustomerCriterion = Readonly<{
  label: string
  value: JsonValue
  basis: 'customer_provided' | 'extracted_from_request'
  impact: 'eligibility_and_comparison'
}>

export function projectCustomerCriteria(
  criteria: readonly Readonly<{
    label: string
    value: JsonValue
    basis: 'customer_provided' | 'extracted_from_request'
  }>[],
): readonly CustomerCriterion[] {
  return Object.freeze(criteria.map(({ label, value, basis }) => Object.freeze({
    label,
    value: structuredClone(value),
    basis,
    impact: 'eligibility_and_comparison' as const,
  })))
}

export type CustomerRequestProjection =
  | CustomerRequestView
  | Readonly<{
      kind: 'conflict'; requestRef: string
      reason: 'revision_changed' | 'options_changed' | 'identity_changed' | 'idempotency_key_reused'
    }>

/** @deprecated Use CustomerRequestView. Kept as a source-compatible migration alias. */
export type CustomerOptionsProjection =
  | CustomerRequestView
  | Readonly<{ kind: 'conflict'; requestRef: string; reason: 'revision_changed' | 'request_not_ready' }>
  | Readonly<{ kind: 'refused'; reason: 'authentication_required' }>

type RequestEvaluationProjectionInput = Readonly<{
  criteria: readonly Readonly<{
    label: string
    value: JsonValue
    basis: 'customer_provided' | 'extracted_from_request'
  }>[]
  posture: 'needs_information' | 'progress_available' | 'unsupported'
  nextRequirement?: Readonly<
    | { kind: 'intent_direction'; prompt: string }
    | { kind: 'contract_fact'; requirementKey: string; customerLabel: string; customerPrompt?: string }
  >
  preparationDisclosure?: Readonly<{
    maximumRecipients: number
    purposes: readonly string[]
    categories: readonly Readonly<{
      label: string
      classification: 'personal' | 'sensitive' | 'credential'
    }>[]
  }>
}>

export function projectCustomerRequest(result: CompileCustomerRequestResult): CustomerRequestProjection {
  if (result.kind === 'refused') return requestView({
    requestRef: 'request:uncommitted', revision: 0, state: 'needs_attention',
    summary: result.reason === 'capability_graph_invalid'
      ? 'The registered options changed and need to be checked again.'
      : 'This request could not be interpreted safely.',
    nextAction: 'retry',
  })
  return projectRequestEvaluation({
    snapshot: result.aggregate.snapshot,
    evaluation: result.aggregate.evaluation,
    outcome: result.aggregate.outcome,
    actionCount: result.aggregate.plan.actions.length,
    ...(result.routeGeneration === undefined
      ? {}
      : { routeGenerationRef: result.routeGeneration.generationRef }),
  })
}

export function projectRequestEvaluation(input: Readonly<{
  snapshot: Readonly<{ requestId: string; revision: number; intent: string }>
  evaluation: RequestEvaluationProjectionInput
  outcome?: 'plan_ready' | 'needs_information' | 'unsupported'
  actionCount?: number
  routeGenerationRef?: string
}>): CustomerRequestView {
  const criteria = projectCustomerCriteria(input.evaluation.criteria)
  const routeGeneration = input.routeGenerationRef === undefined
    ? {}
    : { routeGenerationRef: input.routeGenerationRef }
  if (input.evaluation.posture === 'unsupported' && input.actionCount === 0) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'AE cannot perform the requested operation.',
    nextAction: 'revise_request',
    criteria,
  })
  if (input.evaluation.posture === 'unsupported') return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'No business on AE can support this request right now.',
    nextAction: 'revise_request',
    criteria,
  })
  if (input.evaluation.nextRequirement !== undefined) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'needs_information',
    summary: input.snapshot.intent,
    nextAction: 'provide_information',
    missingFields: input.evaluation.nextRequirement.kind === 'contract_fact' ? [{
      field: input.evaluation.nextRequirement.requirementKey,
      label: input.evaluation.nextRequirement.customerLabel,
      explanation: 'This answer changes which options can be considered now.',
    }] : [],
    clarification: input.evaluation.nextRequirement.kind === 'intent_direction'
      ? { kind: 'intent_direction', prompt: input.evaluation.nextRequirement.prompt, answerKind: 'natural_language' }
      : {
          kind: 'contract_fact', requirementKey: input.evaluation.nextRequirement.requirementKey,
          prompt: input.evaluation.nextRequirement.customerPrompt
            ?? 'What else should AE know to find the right options?',
          answerKind: 'typed_value',
        },
    criteria,
  })
  if (input.evaluation.preparationDisclosure !== undefined) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'needs_authorization',
    summary: input.snapshot.intent,
    nextAction: 'review_disclosure',
    criteria,
    disclosureReview: {
      purpose: customerPurposeLabel(input.evaluation.preparationDisclosure.purposes[0] ?? 'compare_options'),
      maximumRecipients: input.evaluation.preparationDisclosure.maximumRecipients,
      categories: input.evaluation.preparationDisclosure.categories.map(({ label, classification }) => ({ label, classification })),
    },
  })
  if (input.outcome === 'unsupported' && input.actionCount !== 1) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'No business on AE can support this request right now.',
    nextAction: 'revise_request',
    criteria,
  })
  return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'ready_to_compare',
    summary: input.snapshot.intent,
    nextAction: 'prepare_options',
    criteria,
  })
}

function customerPurposeLabel(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim()
  if (words.length === 0) return 'Compare available options'
  return `${words.at(0)?.toUpperCase() ?? ''}${words.slice(1)}`
}

export function projectPreparingOptions(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
  criteria?: readonly CustomerCriterion[]
  disclosureReview?: CustomerRequestView['disclosureReview']
  preparationRef?: string
}>): CustomerRequestView {
  return requestView({ ...input, state: 'preparing_options', nextAction: 'wait' })
}

export function projectOptionsReady(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
  criteria?: readonly CustomerCriterion[]
  candidateSet: PreparedRouteCandidateSet
}>): CustomerRequestView {
  const optionSet = projectCustomerOptionSet(input.candidateSet)
  if (optionSet.optionCount === 0 && (optionSet.coverage.pending > 0 || optionSet.coverage.uncertain > 0)) return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    state: 'needs_attention',
    summary: input.summary,
    nextAction: 'retry',
    optionSet,
  })
  if (optionSet.optionCount === 0) return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    state: 'no_options',
    summary: input.summary,
    nextAction: 'revise_request',
    optionSet,
  })
  return requestView({
    ...input,
    state: 'options_ready',
    nextAction: 'inspect_options',
    optionSet,
    options: optionSet.options,
  })
}

export function projectNeedsAttention(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
  criteria?: readonly CustomerCriterion[]
}>): CustomerRequestView {
  return requestView({ ...input, state: 'needs_attention', nextAction: 'retry' })
}

export function projectRoutePlansReady(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
  decision: CustomerRoutePlanDecision
  criteria?: readonly CustomerCriterion[]
}>): CustomerRequestView {
  return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    routeGenerationRef: input.decision.generationRef,
    state: input.decision.outcome.kind === 'routes_expired' ? 'needs_attention' : 'routes_ready',
    summary: input.summary,
    nextAction: input.decision.outcome.kind === 'routes_expired' ? 'retry' : 'inspect_routes',
    decision: input.decision,
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  })
}

export function projectRouteConfirmed(input: Readonly<{
  requestRef: string
  revision: number
  confirmation: CustomerRouteConfirmation
  criteria?: readonly CustomerCriterion[]
}>): CustomerRequestView {
  return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    routeGenerationRef: input.confirmation.generationRef,
    state: 'route_confirmed',
    summary: 'Your choice is confirmed. Nothing has started yet.',
    nextAction: 'inspect_confirmation',
    confirmation: input.confirmation,
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  })
}

export function projectRouteProgress(input: Readonly<{
  requestRef: string
  revision: number
  generationRef: string
  completed: number
  total: number
  current: Readonly<{
    step: number
    state: 'queued' | 'contacting' | 'awaiting_result' | 'validating_result' | 'needs_attention'
  }>
  updatedAt: number
  cancellationAvailable: boolean
  criteria?: readonly CustomerCriterion[]
}>): CustomerRequestView {
  return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    routeGenerationRef: input.generationRef,
    state: 'in_progress',
    summary: input.current.state === 'queued'
      ? 'Your request is queued to begin.'
      : 'Your request is in progress.',
    nextAction: 'wait',
    progress: {
      completed: input.completed,
      total: input.total,
      current: { ...input.current },
    },
    activity: {
      actor: 'ae_for_customer', certainty: 'pending', updatedAt: input.updatedAt,
      nextCheckAt: input.updatedAt + 30_000, retry: 'not_needed',
      cancellation: input.cancellationAvailable ? 'available_before_next_step' : 'too_late_or_unsupported',
      safeNextAction: 'check_progress',
    },
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  })
}

export function projectRouteCancelled(input: Readonly<{
  requestRef: string
  revision: number
  criteria?: readonly CustomerCriterion[]
  updatedAt?: number
}>): CustomerRequestView {
  return requestView({
    ...input,
    state: 'cancelled',
    summary: 'This request was stopped before the next business step began.',
    nextAction: 'revise_request',
    activity: {
      actor: 'ae_for_customer', certainty: 'cancelled', updatedAt: input.updatedAt ?? 0,
      retry: 'not_needed', cancellation: 'complete', safeNextAction: 'revise_request',
    },
  })
}

export function projectCustomerActionStatus(input: Readonly<{
  requestRef: string
  revision: number
  criteria?: readonly CustomerCriterion[]
  routeProgress?: Readonly<{ completed: number; total: number; currentStep: number }>
  status:
    | Readonly<{ kind: 'unknown'; reason: string; observedAt: number; automaticRetry: false }>
    | Readonly<{
        kind: 'completed'; resolution: 'provider_result' | 'reconciled'; result: JsonValue
        resolvedAt: number; automaticRetry: false
      }>
    | Readonly<{
        kind: 'failed'; resolution: 'reconciled' | 'not_sent'; result: JsonValue
        resolvedAt: number; automaticRetry: false
      }>
}>): CustomerRequestView {
  const hasCompletedRouteSteps = (input.routeProgress?.completed ?? 0) > 0
  if (input.status.kind === 'unknown') return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'outcome_unknown', nextAction: 'wait',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    summary: 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.',
    action: {
      state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false,
      observedAt: input.status.observedAt,
    },
    ...(input.routeProgress === undefined ? {} : { progress: terminalRouteProgress(input.routeProgress) }),
    activity: {
      actor: 'ae_for_customer', certainty: 'unknown', updatedAt: input.status.observedAt,
      nextCheckAt: input.status.observedAt + 30_000, retry: 'blocked_until_reconciled',
      cancellation: 'too_late_or_unsupported', safeNextAction: 'wait_for_evidence',
    },
  })
  if (input.status.kind === 'completed') return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'completed', nextAction: 'none',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    summary: input.status.resolution === 'reconciled'
      ? 'The business has now confirmed the result.'
      : 'The business confirmed the result.',
    action: {
      state: 'completed', resolution: input.status.resolution, automaticRetry: false,
      result: structuredClone(input.status.result), observedAt: input.status.resolvedAt,
    },
    activity: {
      actor: 'ae_for_customer', certainty: 'confirmed', updatedAt: input.status.resolvedAt,
      retry: 'not_needed', cancellation: 'complete', safeNextAction: 'review_result',
    },
  })
  return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'failed', nextAction: 'revise_request',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    summary: input.status.resolution === 'not_sent'
      ? hasCompletedRouteSteps
        ? 'AE could not safely continue. The next business step was not sent.'
        : 'AE could not safely contact the business. Nothing was sent.'
      : 'The business confirmed that it could not complete this action. AE did not try it again.',
    action: {
      state: 'failed', resolution: input.status.resolution, automaticRetry: false,
      result: structuredClone(input.status.result), observedAt: input.status.resolvedAt,
    },
    ...(input.routeProgress === undefined ? {} : { progress: terminalRouteProgress(input.routeProgress) }),
    activity: {
      actor: 'ae_for_customer', certainty: 'failed', updatedAt: input.status.resolvedAt,
      retry: 'manual_after_failure', cancellation: 'complete', safeNextAction: 'revise_request',
    },
  })
}

function terminalRouteProgress(progress: Readonly<{ completed: number; total: number; currentStep: number }>) {
  return {
    completed: progress.completed,
    total: progress.total,
    current: { step: progress.currentStep, state: 'needs_attention' as const },
  }
}

function requestView(input: Readonly<{
  requestRef: string
  revision: number
  routeGenerationRef?: string
  state: CustomerRequestState
  summary: string
  nextAction: CustomerRequestNextAction
  missingFields?: readonly Readonly<{ field: string; label: string; explanation: string }>[]
  clarification?: CustomerRequestView['clarification']
  criteria?: readonly CustomerCriterion[]
  disclosureReview?: CustomerRequestView['disclosureReview']
  preparationRef?: string
  options?: readonly CustomerOption[]
  optionSet?: CustomerOptionSet
  preparedAction?: CustomerPreparedAction
  action?: CustomerRequestView['action']
  progress?: CustomerRequestView['progress']
  activity?: CustomerRequestView['activity']
  decision?: CustomerRoutePlanDecision
  confirmation?: CustomerRouteConfirmation
}>): CustomerRequestView {
  return Object.freeze({
    kind: 'request',
    requestRef: input.requestRef,
    revision: input.revision,
    ...(input.routeGenerationRef === undefined ? {} : { routeGenerationRef: input.routeGenerationRef }),
    state: input.state,
    summary: input.summary,
    nextAction: input.nextAction,
    missingFields: Object.freeze((input.missingFields ?? []).map((field) => Object.freeze({ ...field }))),
    criteria: Object.freeze((input.criteria ?? []).map((criterion) => Object.freeze({ ...criterion }))),
    ...(input.disclosureReview === undefined ? {} : { disclosureReview: Object.freeze({
      ...input.disclosureReview,
      categories: Object.freeze(input.disclosureReview.categories.map((category) => Object.freeze({ ...category }))),
    }) }),
    ...(input.preparationRef === undefined ? {} : { preparationRef: input.preparationRef }),
    ...(input.clarification === undefined ? {} : { clarification: Object.freeze({ ...input.clarification }) }),
    ...(input.optionSet === undefined ? {} : { optionSet: input.optionSet }),
    ...(input.preparedAction === undefined ? {} : { preparedAction: Object.freeze({ ...input.preparedAction }) }),
    ...(input.action === undefined ? {} : { action: Object.freeze({
      ...input.action,
      ...(input.action.result === undefined ? {} : { result: structuredClone(input.action.result) }),
    }) }),
    ...(input.progress === undefined ? {} : { progress: Object.freeze({
      ...input.progress,
      current: Object.freeze({ ...input.progress.current }),
    }) }),
    ...(input.activity === undefined ? {} : { activity: Object.freeze({ ...input.activity }) }),
    ...(input.decision === undefined ? {} : { decision: input.decision }),
    ...(input.confirmation === undefined ? {} : { confirmation: input.confirmation }),
    options: Object.freeze((input.options ?? []).map((option) => Object.freeze({ ...option }))),
  })
}
