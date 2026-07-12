import type { CompileCustomerRequestResult } from './compiler'

export type CustomerRequestProjection =
  | Readonly<{
      kind: 'request'; requestRef: string; revision: number
      status: 'ready_to_compare' | 'needs_information' | 'unsupported'
      summary: string; nextAction: 'compare_options' | 'provide_information' | 'revise_request'
      missingFields: readonly Readonly<{ field: string; label: string; explanation: string }>[]
      stepCount: number
    }>
  | Readonly<{ kind: 'conflict'; requestRef: string; reason: 'revision_changed' | 'identity_changed' | 'idempotency_key_reused' }>

export function projectCustomerRequest(result: CompileCustomerRequestResult): CustomerRequestProjection {
  if (result.kind === 'plan_ready') return Object.freeze({
    kind: 'request', requestRef: result.request.requestId, revision: result.request.revision,
    status: 'ready_to_compare', summary: result.understanding.outcome, nextAction: 'compare_options',
    missingFields: Object.freeze([]), stepCount: result.planRevision.actions.length,
  })
  if (result.kind === 'needs_information') return Object.freeze({
    kind: 'request', requestRef: result.request.requestId, revision: result.request.revision,
    status: 'needs_information', summary: result.understanding.outcome, nextAction: 'provide_information',
    missingFields: Object.freeze(result.missingInformation.map((item) => Object.freeze({
      field: item.field, label: item.customerLabel,
      explanation: item.reason === 'required_for_registered_capability'
        ? 'This is needed before businesses can prepare an option.'
        : 'This will determine which registered capability fits the request.',
    }))), stepCount: 0,
  })
  if (result.kind === 'unsupported') return Object.freeze({
    kind: 'request', requestRef: result.request.requestId, revision: result.request.revision,
    status: 'unsupported', summary: result.reason === 'no_registered_capability'
      ? 'No registered business capability can support this request yet.'
      : 'The request could not be translated into a safe business plan.',
    nextAction: 'revise_request', missingFields: Object.freeze([]), stepCount: 0,
  })
  if (result.kind === 'revision_conflict') return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'revision_changed' })
  if (result.kind === 'identity_conflict') return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'identity_changed' })
  return Object.freeze({ kind: 'conflict', requestRef: result.requestId, reason: 'idempotency_key_reused' })
}
