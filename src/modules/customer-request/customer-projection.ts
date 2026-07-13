import type { CompileCustomerRequestResult } from './compiler'
import type { RequestEvaluation } from './evaluation'
import type { PreparedRouteCandidateSet } from './preparation'

export type CustomerRequestState =
  | 'needs_information'
  | 'ready_to_compare'
  | 'preparing_options'
  | 'options_ready'
  | 'no_options'
  | 'unsupported'
  | 'needs_attention'

export type CustomerRequestNextAction =
  | 'provide_information'
  | 'prepare_options'
  | 'wait'
  | 'inspect_options'
  | 'revise_request'
  | 'retry'

type PreparedCandidate = PreparedRouteCandidateSet['candidates'][number]
export type CustomerOption = Readonly<Omit<PreparedCandidate, 'inspectionRef'>>

export type CustomerRequestView = Readonly<{
  kind: 'request'
  requestRef: string
  revision: number
  state: CustomerRequestState
  summary: string
  nextAction: CustomerRequestNextAction
  missingFields: readonly Readonly<{ field: string; label: string; explanation: string }>[]
  clarification?: Readonly<
    | { kind: 'intent_direction'; prompt: string; answerKind: 'natural_language' }
    | { kind: 'contract_fact'; field: string; prompt: string; answerKind: 'typed_value' }
  >
  options: readonly CustomerOption[]
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
  if (result.kind === 'plan_ready') return requestView({
    requestRef: result.request.requestId,
    revision: result.request.revision,
    state: 'ready_to_compare',
    summary: result.understanding.outcome,
    nextAction: 'prepare_options',
  })
  if (result.kind === 'needs_information') return requestView({
    requestRef: result.request.requestId,
    revision: result.request.revision,
    state: 'needs_information',
    summary: result.understanding.outcome,
    nextAction: 'provide_information',
    missingFields: result.missingInformation.map((item) => ({
      field: item.field,
      label: item.customerLabel,
      explanation: item.reason === 'required_for_registered_capability'
        ? 'This is needed before businesses can prepare an option.'
        : 'This will determine which registered capability fits the request.',
    })),
  })
  if (result.kind === 'unsupported') return requestView({
    requestRef: result.request.requestId,
    revision: result.request.revision,
    state: 'unsupported',
    summary: result.reason === 'no_registered_capability'
      ? 'No registered business capability can support this request yet.'
      : 'The request could not be translated into a safe business plan.',
    nextAction: 'revise_request',
  })
  if (result.kind === 'revision_conflict') return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'revision_changed' })
  if (result.kind === 'identity_conflict') return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'identity_changed' })
  return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'idempotency_key_reused' })
}

export function projectRequestEvaluation(input: Readonly<{
  snapshot: Readonly<{ requestId: string; revision: number; intent: string }>
  evaluation: RequestEvaluation
}>): CustomerRequestView {
  if (input.evaluation.posture === 'unsupported') return requestView({
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'unsupported',
    summary: 'No registered business capability currently matches this request.',
    nextAction: 'revise_request',
  })
  if (input.evaluation.nextRequirement !== undefined) return requestView({
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'needs_information',
    summary: input.snapshot.intent,
    nextAction: 'provide_information',
    missingFields: input.evaluation.nextRequirement.kind === 'contract_fact' ? [{
      field: input.evaluation.nextRequirement.field,
      label: input.evaluation.nextRequirement.customerLabel,
      explanation: 'This answer changes which registered options can be prepared now.',
    }] : [],
    clarification: input.evaluation.nextRequirement.kind === 'intent_direction'
      ? { kind: 'intent_direction', prompt: input.evaluation.nextRequirement.prompt, answerKind: 'natural_language' }
      : {
          kind: 'contract_fact', field: input.evaluation.nextRequirement.field,
          prompt: input.evaluation.nextRequirement.customerLabel, answerKind: 'typed_value',
        },
  })
  return requestView({
    requestRef: input.snapshot.requestId,
    revision: input.snapshot.revision,
    state: 'ready_to_compare',
    summary: input.snapshot.intent,
    nextAction: 'prepare_options',
  })
}

export function projectPreparingOptions(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
}>): CustomerRequestView {
  return requestView({ ...input, state: 'preparing_options', nextAction: 'wait' })
}

export function projectOptionsReady(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
  candidateSet: PreparedRouteCandidateSet
}>): CustomerRequestView {
  if (input.candidateSet.candidates.length === 0) return requestView({
    requestRef: input.requestRef,
    revision: input.revision,
    state: 'no_options',
    summary: input.summary,
    nextAction: 'revise_request',
  })
  return requestView({
    ...input,
    state: 'options_ready',
    nextAction: 'inspect_options',
    options: input.candidateSet.candidates.map(({ inspectionRef: _inspectionRef, ...option }) => option),
  })
}

export function projectNeedsAttention(input: Readonly<{
  requestRef: string
  revision: number
  summary: string
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
  options?: readonly CustomerOption[]
}>): CustomerRequestView {
  return Object.freeze({
    kind: 'request',
    requestRef: input.requestRef,
    revision: input.revision,
    state: input.state,
    summary: input.summary,
    nextAction: input.nextAction,
    missingFields: Object.freeze((input.missingFields ?? []).map((field) => Object.freeze({ ...field }))),
    ...(input.clarification === undefined ? {} : { clarification: Object.freeze({ ...input.clarification }) }),
    options: Object.freeze((input.options ?? []).map((option) => Object.freeze({ ...option }))),
  })
}
