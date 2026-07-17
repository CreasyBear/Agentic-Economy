import type { CompileCustomerRequestResult } from './compiler'
import type { JsonValue } from '@/modules/capability-contract/public'
import { stableStringify } from '@/modules/common/stable-hash'
import {
  CUSTOMER_MAXIMUM_RESPONSE_TIME_INPUT_KEY,
  CUSTOMER_PROVIDER_DATA_SHARING_INPUT_KEY,
} from './evaluation'
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
    inputKey?: string
    label: string
    value: JsonValue
    basis: 'customer_provided' | 'extracted_from_request'
  }>[],
): readonly CustomerCriterion[] {
  const seen = new Set<string>()
  return Object.freeze(criteria.flatMap(({ label, value, basis }) => {
    const identity = stableStringify({ label, value, basis })
    if (seen.has(identity)) return []
    seen.add(identity)
    return [Object.freeze({
      label,
      value: structuredClone(value),
      basis,
      impact: 'eligibility_and_comparison' as const,
    })]
  }))
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
    inputKey?: string
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

const UNSUPPORTED_REQUEST_DATA_HANDLING = Object.freeze({
  requestStorage: 'saved_for_revision' as const,
  businessSharing: 'not_shared' as const,
  explanation: 'AE saved this Request so you can revise it. No information was sent to a business.',
})

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
  const maximumTotalCost = customerMaximumTotalCost(input.evaluation.criteria)
  const maximumResponseTimeMs = customerMaximumResponseTimeMs(input.evaluation.criteria)
  const providerDataSharingProhibited = input.evaluation.criteria.some((criterion) => (
    criterion.inputKey === CUSTOMER_PROVIDER_DATA_SHARING_INPUT_KEY && criterion.value === false
  ))
  if (input.evaluation.posture === 'unsupported' && input.actionCount === 0) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'AE cannot perform the requested operation.',
    nextAction: 'revise_request',
    criteria,
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
  })
  if (input.outcome === 'unsupported' && providerDataSharingProhibited) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'Available options require sharing information with a business, which you asked AE not to do.',
    nextAction: 'revise_request',
    criteria,
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
  })
  if (input.outcome === 'unsupported' && maximumResponseTimeMs !== undefined) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: `No current option declares a response time within ${maximumResponseTimeMs} milliseconds.`,
    nextAction: 'revise_request',
    criteria,
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
  })
  if (input.outcome === 'unsupported' && maximumTotalCost !== undefined) return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: `No current option stays within your ${formatCustomerMoney(maximumTotalCost.currency, maximumTotalCost.amountMinor)} maximum.`,
    nextAction: 'revise_request',
    criteria,
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
  })
  if (input.evaluation.posture === 'unsupported') return requestView({
    ...routeGeneration,
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'No business on AE can support this request right now.',
    nextAction: 'revise_request',
    criteria,
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
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
    dataHandling: UNSUPPORTED_REQUEST_DATA_HANDLING,
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

function customerMaximumTotalCost(
  criteria: RequestEvaluationProjectionInput['criteria'],
): Readonly<{ currency: string; amountMinor: number }> | undefined {
  const value = criteria.find((criterion) => criterion.label === 'Maximum total cost')?.value
  if (!isJsonRecord(value)) return undefined
  const currency = value.currency
  const amountMinor = value.amountMinor
  return typeof currency === 'string' && currency.length === 3
    && typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor >= 0
    ? { currency, amountMinor }
    : undefined
}

function customerMaximumResponseTimeMs(
  criteria: RequestEvaluationProjectionInput['criteria'],
): number | undefined {
  const criterion = criteria.find((candidate) => candidate.inputKey === CUSTOMER_MAXIMUM_RESPONSE_TIME_INPUT_KEY)
  if (!isJsonRecord(criterion?.value)) return undefined
  const amount = criterion.value.amount
  const unit = criterion.value.unit
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && unit === 'milliseconds'
    ? amount
    : undefined
}

function isJsonRecord(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatCustomerMoney(currency: string, amountMinor: number): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`
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

export type RepeatPermissionUseRefusalReason =
  | 'authentication_required'
  | 'request_not_found'
  | 'policy_not_found'
  | 'policy_integrity_invalid'
  | 'principal_mismatch'
  | 'credential_mismatch'
  | 'policy_not_yet_valid'
  | 'policy_expired'
  | 'policy_revoked'
  | 'generation_changed'
  | 'route_not_allowed'
  | 'capability_not_allowed'
  | 'consequential_effect_requires_confirmation'
  | 'spend_limit_exceeded'
  | 'data_limit_exceeded'
  | 'occurrence_limit_exceeded'
  | 'mandate_expiry_invalid'
  | 'prior_use_invalid'

export function repeatPermissionUseRecoverySummary(
  reason: RepeatPermissionUseRefusalReason,
): string {
  if (reason === 'policy_revoked') {
    return 'Repeat permission was withdrawn. Ask for confirmation before continuing.'
  }
  if (reason === 'policy_expired' || reason === 'mandate_expiry_invalid') {
    return 'Repeat permission expired. Confirm the current choice before continuing.'
  }
  if (reason === 'policy_not_yet_valid') {
    return 'Repeat permission is not active yet. Confirm the current choice to continue now.'
  }
  if (reason === 'spend_limit_exceeded'
    || reason === 'data_limit_exceeded'
    || reason === 'occurrence_limit_exceeded') {
    return 'Repeat permission has reached its limit. Confirm the current choice before continuing.'
  }
  if (reason === 'generation_changed'
    || reason === 'route_not_allowed'
    || reason === 'capability_not_allowed'
    || reason === 'consequential_effect_requires_confirmation') {
    return 'The current choice has changed beyond this repeat permission. Review and confirm it before continuing.'
  }
  if (reason === 'credential_mismatch' || reason === 'principal_mismatch') {
    return 'The connected assistant is no longer allowed to use this repeat permission. Confirm the current choice before continuing.'
  }
  if (reason === 'policy_integrity_invalid' || reason === 'prior_use_invalid') {
    return 'AE could not verify this repeat permission safely. Confirm the current choice before continuing.'
  }
  return 'Repeat permission is unavailable for this choice. Confirm the current choice before continuing.'
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
    state: 'queued' | 'ready_to_contact' | 'contacting' | 'awaiting_result' | 'completed' | 'needs_attention'
  }>
  updatedAt: number
  cancellationAvailable: boolean
  cancellationReleaseMayStartAt?: number
  cancellationUnavailableSince?: number
  cancellationRequestedAt?: number
  cancellationAttempt?: Readonly<
    | { state: 'pending'; requestedAt: number; nextCheckAt: number }
    | { state: 'unknown'; requestedAt: number; observedAt: number; nextCheckAt: number }
    | { state: 'rejected'; requestedAt: number; observedAt: number; reason: string }
  >
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  criteria?: readonly CustomerCriterion[]
}>): CustomerRequestView {
  return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    routeGenerationRef: input.generationRef,
    state: 'in_progress',
    ...(input.businesses === undefined ? {} : { businesses: input.businesses }),
    summary: input.current.state === 'queued'
      ? 'Your request is queued to begin.'
      : input.current.state === 'ready_to_contact'
        ? 'AE is preparing to contact the first business.'
        : 'Your request is in progress.',
    nextAction: 'wait',
    progress: {
      completed: input.completed,
      total: input.total,
      current: { ...input.current },
      ...dependencyProgress(input.completed, input.total, input.current.step, input.businesses),
    },
    activity: {
      actor: input.cancellationAttempt?.state === 'unknown' ? 'ae' : progressActor(input.current.state),
      certainty: input.cancellationAttempt?.state === 'unknown'
        ? 'unknown'
        : input.cancellationAttempt?.state === 'rejected'
          || input.current.state === 'ready_to_contact'
          || input.current.state === 'completed' ? 'confirmed' : 'pending',
      updatedAt: input.updatedAt,
      nextCheckAt: input.cancellationAttempt === undefined
        || input.cancellationAttempt.state === 'rejected'
        ? input.updatedAt + 30_000
        : input.cancellationAttempt.nextCheckAt,
      retry: input.cancellationAttempt?.state === 'unknown'
        ? 'blocked_until_reconciled'
        : 'not_needed',
      cancellation: input.cancellationAttempt ?? (input.cancellationAvailable
        ? {
            state: 'available', until: 'before_next_step_release',
            releaseMayStartAt: input.cancellationReleaseMayStartAt ?? input.updatedAt,
          }
        : {
            state: 'not_available', reason: 'business_step_released',
            changedAt: input.cancellationUnavailableSince ?? input.updatedAt,
            ...(input.cancellationRequestedAt === undefined
              ? {}
              : { requestedAt: input.cancellationRequestedAt }),
          }),
      safeNextAction: input.cancellationAttempt?.state === 'unknown'
        ? 'wait_for_evidence'
        : 'check_progress',
    },
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  })
}

export function projectRouteCancelled(input: Readonly<{
  requestRef: string
  revision: number
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  routeProgress?: Readonly<{ completed: number; total: number; currentStep: number }>
  criteria?: readonly CustomerCriterion[]
  updatedAt?: number
}>): CustomerRequestView {
  return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    state: 'cancelled',
    ...(input.businesses === undefined ? {} : { businesses: input.businesses }),
    summary: input.routeProgress === undefined || input.routeProgress.completed === 0
      ? 'This request was stopped before the next business step began.'
      : `Stopped after ${input.routeProgress.completed} of ${input.routeProgress.total} business steps completed. No later step began.`,
    nextAction: 'revise_request',
    ...(input.routeProgress === undefined ? {} : {
      progress: {
        completed: input.routeProgress.completed,
        total: input.routeProgress.total,
        current: { step: input.routeProgress.currentStep, state: 'cancelled' },
        ...dependencyProgress(
          input.routeProgress.completed,
          input.routeProgress.total,
          input.routeProgress.currentStep,
          input.businesses,
        ),
      },
    }),
    activity: {
      actor: 'none', certainty: 'cancelled', updatedAt: input.updatedAt ?? 0,
      retry: 'not_needed',
      cancellation: { state: 'stopped', stoppedAt: input.updatedAt ?? 0 },
      safeNextAction: 'revise_request',
    },
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
  })
}

export function projectCustomerActionStatus(input: Readonly<{
  requestRef: string
  revision: number
  criteria?: readonly CustomerCriterion[]
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  routeProgress?: Readonly<{ completed: number; total: number; currentStep: number }>
  status:
    | Readonly<{
        kind: 'unknown'; reason: string; observedAt: number; automaticRetry: false
        partialResult?: JsonValue
      }>
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
  const multipleBusinesses = (input.businesses?.length ?? 0) > 1
  if (input.status.kind === 'unknown') return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'outcome_unknown', nextAction: 'wait',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    ...(input.businesses === undefined ? {} : { businesses: input.businesses }),
    summary: input.status.partialResult === undefined
      ? multipleBusinesses
        ? 'The businesses may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.'
        : 'The business may have acted, but AE does not yet have enough evidence to confirm the result. AE will not send it again.'
      : 'A business returned a partial result. AE has preserved it as evidence and will not claim completion or send the request again.',
    action: {
      state: 'unknown', resolution: 'awaiting_evidence', automaticRetry: false,
      ...(input.status.partialResult === undefined
        ? {}
        : { result: structuredClone(input.status.partialResult) }),
      observedAt: input.status.observedAt,
    },
    ...(input.routeProgress === undefined
      ? {}
      : { progress: terminalRouteProgress(input.routeProgress, input.businesses) }),
    activity: {
      actor: 'ae', certainty: 'unknown', updatedAt: input.status.observedAt,
      nextCheckAt: input.status.observedAt + 30_000, retry: 'blocked_until_reconciled',
      cancellation: {
        state: 'not_available', reason: 'business_step_released', changedAt: input.status.observedAt,
      },
      safeNextAction: 'wait_for_evidence',
    },
  })
  if (input.status.kind === 'completed') return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'completed', nextAction: 'none',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    ...(input.businesses === undefined ? {} : { businesses: input.businesses }),
    summary: input.status.resolution === 'reconciled'
      ? multipleBusinesses ? 'The businesses have now confirmed the result.' : 'The business has now confirmed the result.'
      : multipleBusinesses ? 'The businesses confirmed the result.' : 'The business confirmed the result.',
    action: {
      state: 'completed', resolution: input.status.resolution, automaticRetry: false,
      result: structuredClone(input.status.result), observedAt: input.status.resolvedAt,
    },
    activity: {
      actor: 'none', certainty: 'confirmed', updatedAt: input.status.resolvedAt,
      retry: 'not_needed',
      cancellation: {
        state: 'not_available', reason: 'request_finished', changedAt: input.status.resolvedAt,
      },
      safeNextAction: 'review_result',
    },
  })
  return requestView({
    requestRef: input.requestRef, revision: input.revision,
    state: 'failed', nextAction: 'revise_request',
    ...(input.criteria === undefined ? {} : { criteria: input.criteria }),
    ...(input.businesses === undefined ? {} : { businesses: input.businesses }),
    summary: input.status.resolution === 'not_sent'
      ? hasCompletedRouteSteps
        ? 'AE could not safely continue. The next business step was not sent.'
        : 'AE could not safely contact the business. Nothing was sent.'
      : multipleBusinesses
        ? 'The businesses confirmed that they could not complete this action. AE did not try it again.'
        : 'The business confirmed that it could not complete this action. AE did not try it again.',
    action: {
      state: 'failed', resolution: input.status.resolution, automaticRetry: false,
      result: structuredClone(input.status.result), observedAt: input.status.resolvedAt,
    },
    ...(input.routeProgress === undefined
      ? {}
      : { progress: terminalRouteProgress(input.routeProgress, input.businesses) }),
    activity: {
      actor: 'customer', certainty: 'failed', updatedAt: input.status.resolvedAt,
      retry: 'manual_after_failure',
      cancellation: {
        state: 'not_available', reason: 'request_finished', changedAt: input.status.resolvedAt,
      },
      safeNextAction: 'revise_request',
    },
  })
}

function progressActor(
  state: 'queued' | 'ready_to_contact' | 'contacting' | 'awaiting_result' | 'completed' | 'needs_attention',
): 'ae' | 'business' | 'customer' {
  if (state === 'awaiting_result') return 'business'
  if (state === 'needs_attention') return 'customer'
  return 'ae'
}

function terminalRouteProgress(
  progress: Readonly<{ completed: number; total: number; currentStep: number }>,
  businesses?: readonly Readonly<{ name: string }>[],
) {
  return {
    completed: progress.completed,
    total: progress.total,
    current: { step: progress.currentStep, state: 'needs_attention' as const },
    ...dependencyProgress(progress.completed, progress.total, progress.currentStep, businesses),
  }
}

function dependencyProgress(
  completed: number,
  total: number,
  currentStep: number,
  businesses?: readonly Readonly<{ name: string }>[],
): Pick<NonNullable<CustomerRequestView['progress']>, 'dependencies'> | Record<string, never> {
  if (total <= 1 || businesses?.length !== total) return {}
  const currentBusiness = businesses[currentStep - 1]
  if (currentBusiness === undefined) return {}
  return {
    dependencies: {
      completed: businesses.slice(0, completed).map(({ name }, index) => ({
        step: index + 1, business: name,
      })),
      blocked: businesses.slice(currentStep).map(({ name }, index) => ({
        step: currentStep + index + 1,
        business: name,
        waitingForStep: currentStep,
        waitingForBusiness: currentBusiness.name,
      })),
    },
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
  dataHandling?: CustomerRequestView['dataHandling']
  preparationRef?: string
  options?: readonly CustomerOption[]
  optionSet?: CustomerOptionSet
  preparedAction?: CustomerPreparedAction
  businesses?: CustomerRequestView['businesses']
  action?: CustomerRequestView['action']
  progress?: CustomerRequestView['progress']
  activity?: CustomerRequestView['activity']
  recovery?: CustomerRequestView['recovery']
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
    ...(input.dataHandling === undefined ? {} : { dataHandling: Object.freeze({ ...input.dataHandling }) }),
    ...(input.disclosureReview === undefined ? {} : { disclosureReview: Object.freeze({
      ...input.disclosureReview,
      categories: Object.freeze(input.disclosureReview.categories.map((category) => Object.freeze({ ...category }))),
    }) }),
    ...(input.preparationRef === undefined ? {} : { preparationRef: input.preparationRef }),
    ...(input.clarification === undefined ? {} : { clarification: Object.freeze({ ...input.clarification }) }),
    ...(input.optionSet === undefined ? {} : { optionSet: input.optionSet }),
    ...(input.preparedAction === undefined ? {} : { preparedAction: Object.freeze({ ...input.preparedAction }) }),
    ...(input.businesses === undefined ? {} : {
      businesses: Object.freeze(input.businesses.map((business) => Object.freeze({ ...business }))),
    }),
    ...(input.action === undefined ? {} : { action: Object.freeze({
      ...input.action,
      ...(input.action.result === undefined ? {} : { result: structuredClone(input.action.result) }),
    }) }),
    ...(input.progress === undefined ? {} : { progress: Object.freeze({
      ...input.progress,
      current: Object.freeze({ ...input.progress.current }),
      ...(input.progress.dependencies === undefined ? {} : {
        dependencies: Object.freeze({
          completed: Object.freeze(input.progress.dependencies.completed.map((step) => Object.freeze({ ...step }))),
          blocked: Object.freeze(input.progress.dependencies.blocked.map((step) => Object.freeze({ ...step }))),
        }),
      }),
    }) }),
    ...(input.activity === undefined ? {} : { activity: Object.freeze({ ...input.activity }) }),
    ...(input.recovery === undefined ? {} : { recovery: Object.freeze({ ...input.recovery }) }),
    ...(input.decision === undefined ? {} : { decision: input.decision }),
    ...(input.confirmation === undefined ? {} : { confirmation: input.confirmation }),
    options: Object.freeze((input.options ?? []).map((option) => Object.freeze({ ...option }))),
  })
}
