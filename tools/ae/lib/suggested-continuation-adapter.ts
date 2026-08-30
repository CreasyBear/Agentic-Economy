import {
  continuationForInvocationStatus,
  suggestContinuation,
  type SuggestedContinuation,
} from '@/modules/market/suggested-continuation'

type OperationContinuationInput = Readonly<{
  operationRef: string
  availabilityPosture: 'integrated' | 'routeable' | 'unavailable'
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>

type InvocationContinuationInput = Readonly<{
  kind: 'found' | 'refused'
  invocationRef: string
  state?:
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
  retryable?: boolean
}>

export function operationContinuationForCli(
  input: OperationContinuationInput,
): SuggestedContinuation {
  const state = input.requiresBuyerCredential && !input.hasBuyerCredential
    ? 'connection_required'
    : input.availabilityPosture === 'routeable'
      ? 'ready'
      : input.availabilityPosture === 'integrated'
        ? 'inspect_only'
        : 'unavailable'
  return suggestContinuation({
    subject: 'operation',
    state,
    operationRef: input.operationRef,
  })
}

export function invocationContinuationForCli(
  input: InvocationContinuationInput,
): SuggestedContinuation {
  if (input.kind === 'found' && input.state !== undefined) {
    return continuationForInvocationStatus({ invocationRef: input.invocationRef, state: input.state })
  }
  return suggestContinuation({
    subject: 'invocation',
    state: input.retryable === true ? 'retryable' : 'completed',
    invocationRef: input.invocationRef,
  })
}
