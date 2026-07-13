import type { CompileCustomerRequestResult } from './compiler'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { RequestEvaluation } from './evaluation'
import type { PreparedRouteCandidateSet } from './preparation'
import { projectCustomerOptionSet, type CustomerOption, type CustomerOptionSet } from './customer-option-set'

export type CustomerRequestState =
  | 'needs_information'
  | 'ready_to_compare'
  | 'preparing_options'
  | 'options_ready'
  | 'no_options'
  | 'needs_authorization'
  | 'unsupported'
  | 'needs_attention'

export type CustomerRequestNextAction =
  | 'provide_information'
  | 'prepare_options'
  | 'wait'
  | 'inspect_options'
  | 'revise_request'
  | 'review_disclosure'
  | 'retry'

export type { CustomerOption, CustomerOptionSet } from './customer-option-set'
export type CustomerCriterion = Readonly<{
  label: string
  value: JsonValue
  basis: 'customer_provided' | 'extracted_from_request'
}>

export type CustomerRequestView = Readonly<{
  kind: 'request'
  requestRef: string
  revision: number
  state: CustomerRequestState
  summary: string
  nextAction: CustomerRequestNextAction
  missingFields: readonly Readonly<{ field: string; label: string; explanation: string }>[]
  criteria?: readonly CustomerCriterion[]
  disclosureReview?: Readonly<{
    purpose: string
    maximumRecipients: number
    categories: readonly Readonly<{ label: string; classification: 'public' | 'personal' | 'sensitive' | 'credential' }>[]
  }>
  preparationRef?: string
  clarification?: Readonly<
    | { kind: 'intent_direction'; prompt: string; answerKind: 'natural_language' }
    | { kind: 'contract_fact'; requirementKey: string; prompt: string; answerKind: 'typed_value' }
  >
  options: readonly CustomerOption[]
  optionSet?: CustomerOptionSet
}>

export type CustomerRequestProjection =
  | CustomerRequestView
  | Readonly<{ kind: 'conflict'; requestRef: string; reason: 'revision_changed' | 'identity_changed' | 'idempotency_key_reused' }>

/** @deprecated Use CustomerRequestView. Kept as a source-compatible migration alias. */
export type CustomerOptionsProjection =
  | CustomerRequestView
  | Readonly<{ kind: 'conflict'; requestRef: string; reason: 'revision_changed' | 'request_not_ready' }>
  | Readonly<{ kind: 'refused'; reason: 'authentication_required' }>

export function projectCustomerRequest(result: CompileCustomerRequestResult): CustomerRequestProjection {
  if (result.kind === 'refused') return requestView({
    requestRef: 'request:uncommitted', revision: 0, state: 'needs_attention',
    summary: result.reason === 'capability_graph_invalid'
      ? 'The registered options changed and need to be checked again.'
      : 'This request could not be interpreted safely.',
    nextAction: 'retry',
  })
  return projectRequestEvaluation({ snapshot: result.aggregate.snapshot, evaluation: result.aggregate.evaluation })
}

export function projectRequestEvaluation(input: Readonly<{
  snapshot: Readonly<{ requestId: string; revision: number; intent: string }>
  evaluation: RequestEvaluation
}>): CustomerRequestView {
  const criteria = input.evaluation.criteria.map(({ label, value, basis }) => ({ label, value, basis }))
  if (input.evaluation.posture === 'unsupported') return requestView({
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'No registered business capability currently matches this request.',
    nextAction: 'revise_request',
    criteria,
  })
  if (input.evaluation.nextRequirement !== undefined) return requestView({
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'needs_information',
    summary: input.snapshot.intent,
    nextAction: 'provide_information',
    missingFields: input.evaluation.nextRequirement.kind === 'contract_fact' ? [{
      field: input.evaluation.nextRequirement.requirementKey,
      label: input.evaluation.nextRequirement.customerLabel,
      explanation: 'This answer changes which registered options can be prepared now.',
    }] : [],
    clarification: input.evaluation.nextRequirement.kind === 'intent_direction'
      ? { kind: 'intent_direction', prompt: input.evaluation.nextRequirement.prompt, answerKind: 'natural_language' }
      : {
          kind: 'contract_fact', requirementKey: input.evaluation.nextRequirement.requirementKey,
          prompt: input.evaluation.nextRequirement.customerLabel, answerKind: 'typed_value',
        },
    criteria,
  })
  if (input.evaluation.preparationDisclosure !== undefined) return requestView({
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
  return requestView({
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

function requestView(input: Readonly<{
  requestRef: string
  revision: number
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
}>): CustomerRequestView {
  return Object.freeze({
    kind: 'request',
    requestRef: input.requestRef,
    revision: input.revision,
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
    options: Object.freeze((input.options ?? []).map((option) => Object.freeze({ ...option }))),
  })
}
