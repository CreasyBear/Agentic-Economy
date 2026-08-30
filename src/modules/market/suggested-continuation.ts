export type SuggestedContinuation = Readonly<{
  label: string
  kind: 'navigate' | 'copy_command' | 'retry' | 'reconcile'
  command?: string
  href?: string
  warning?: string
}>

type CommandContinuation = SuggestedContinuation & Readonly<{ command: string }>

export type OperationContinuationFacts = Readonly<{
  operationRef: string
  availabilityPosture: 'integrated' | 'routeable' | 'unavailable'
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>

export type ContinuationState =
  | Readonly<{
      subject: 'operation'
      state: 'ready' | 'connection_required' | 'inspect_only' | 'unavailable'
      operationRef: string
    }>
  | Readonly<{
      subject: 'invocation'
      state: 'pending' | 'completed' | 'retryable' | 'cancellable' | 'reconciliation_required'
      invocationRef: string
    }>
  | Readonly<{
      subject: 'supplier'
      state: 'draft' | 'unready' | 'incompatible' | 'withdrawn' | 'current'
      offeringRef: string
      operationRef?: string
    }>
  | Readonly<{ subject: 'connection'; state: 'missing'; actor: 'buyer' | 'supplier' }>
  | Readonly<{ subject: 'credit'; state: 'insufficient' }>

type InvocationStatusState =
  | 'gathering_information'
  | 'awaiting_authority'
  | 'authorized'
  | 'leased'
  | 'in_progress'
  | 'retryable'
  | 'reconciliation_required'
  | 'terminal'
  | 'cancelled'
  | 'invalidated'

export function continuationForInvocationStatus(input: Readonly<{
  invocationRef: string
  state: InvocationStatusState
}>): CommandContinuation {
  const state: Extract<ContinuationState, { subject: 'invocation' }>['state'] =
    input.state === 'authorized' || input.state === 'leased'
      ? 'cancellable'
      : input.state === 'retryable'
        ? 'retryable'
        : input.state === 'reconciliation_required'
          ? 'reconciliation_required'
          : input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated'
            ? 'completed'
            : 'pending'
  return invocationContinuation({ subject: 'invocation', state, invocationRef: input.invocationRef })
}

/**
 * Projects existing result facts into one safe continuation. This is an
 * internal presentation rule: it grants no authority and performs no work.
 */
export function suggestContinuation(state: ContinuationState): SuggestedContinuation {
  if (state.subject === 'operation') return operationContinuation(state)
  if (state.subject === 'invocation') return invocationContinuation(state)
  if (state.subject === 'supplier') return supplierContinuation(state)
  if (state.subject === 'connection') {
    return state.actor === 'buyer'
      ? { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' }
      : { label: 'Connect provider', kind: 'navigate', href: '/owner/settings/connections' }
  }
  return { label: 'Add credit', kind: 'navigate', command: 'ae account balance', href: '/owner/credit#fund' }
}

/** Converts adapter-visible Operation facts into the one shared continuation. */
export function continuationForOperationFacts(
  input: OperationContinuationFacts,
): SuggestedContinuation {
  const state = input.availabilityPosture === 'integrated'
    ? 'inspect_only'
    : input.availabilityPosture === 'unavailable'
      ? 'unavailable'
      : input.requiresBuyerCredential && !input.hasBuyerCredential
        ? 'connection_required'
        : 'ready'
  return suggestContinuation({
    subject: 'operation',
    state,
    operationRef: input.operationRef,
  })
}

function operationContinuation(
  state: Extract<ContinuationState, { subject: 'operation' }>,
): SuggestedContinuation {
  if (state.state === 'ready') {
    return {
      label: 'Call Operation',
      kind: 'copy_command',
      command: `ae call ${state.operationRef} --input '<json>'`,
    }
  }
  if (state.state === 'connection_required') {
    return { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' }
  }
  if (state.state === 'inspect_only') {
    return {
      label: 'Inspect Operation',
      kind: 'navigate',
      command: `ae inspect ${state.operationRef}`,
      href: `/operations/${state.operationRef}`,
    }
  }
  return {
    label: 'Inspect availability',
    kind: 'copy_command',
    command: `ae inspect ${state.operationRef}`,
    warning: 'This Operation is not currently callable.',
  }
}

function invocationContinuation(
  state: Extract<ContinuationState, { subject: 'invocation' }>,
): CommandContinuation {
  if (state.state === 'pending') {
    return { label: 'Check call status', kind: 'copy_command', command: `ae status ${state.invocationRef}` }
  }
  if (state.state === 'completed') {
    return {
      label: 'View receipt',
      kind: 'navigate',
      command: `ae status ${state.invocationRef}`,
      href: `/operations/invocations/${state.invocationRef}`,
    }
  }
  if (state.state === 'retryable') {
    return {
      label: 'Review safe retry',
      kind: 'retry',
      command: `ae status ${state.invocationRef}`,
      warning: 'Reuse the recorded invocation identity before retrying.',
    }
  }
  if (state.state === 'cancellable') {
    return { label: 'Review cancellation', kind: 'copy_command', command: `ae status ${state.invocationRef}` }
  }
  return {
    label: 'Review reconciliation',
    kind: 'reconcile',
    command: `ae status ${state.invocationRef}`,
    warning: 'The external effect may have started. Reconcile before retrying.',
  }
}

function supplierContinuation(
  state: Extract<ContinuationState, { subject: 'supplier' }>,
): SuggestedContinuation {
  if (state.state === 'current' && state.operationRef !== undefined) {
    return {
      label: 'View live Operation',
      kind: 'navigate',
      command: `ae inspect ${state.operationRef}`,
      href: `/operations/${state.operationRef}`,
    }
  }
  const href = `/owner/supply/${encodeURIComponent(state.offeringRef)}`
  if (state.state === 'draft') {
    return {
      label: 'Continue description',
      kind: 'navigate',
      href: `/owner/offerings/${encodeURIComponent(state.offeringRef)}`,
    }
  }
  if (state.state === 'unready' || state.state === 'current') {
    return { label: 'Recheck readiness', kind: 'navigate', href }
  }
  if (state.state === 'incompatible') {
    return { label: 'Inspect incompatibility', kind: 'navigate', href }
  }
  return { label: 'Republish Operation', kind: 'navigate', href }
}
