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

type SupplierContinuationInput = Readonly<{
  offeringRef: string
  catalogStatus: 'draft' | 'published' | 'paused' | 'retired'
  lifecycleState: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  liveAvailable: boolean
  publicationState?: 'current' | 'withdrawn' | 'superseded' | 'incompatible'
  operationRef?: string
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
): SuggestedContinuation | undefined {
  if (input.kind === 'found' && input.state !== undefined) {
    if (input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated') {
      return undefined
    }
    return continuationForInvocationStatus({ invocationRef: input.invocationRef, state: input.state })
  }
  return suggestContinuation({
    subject: 'invocation',
    state: input.retryable === true ? 'retryable' : 'completed',
    invocationRef: input.invocationRef,
  })
}

export function supplierContinuationForCli(
  input: SupplierContinuationInput,
): SuggestedContinuation {
  const state = input.catalogStatus === 'draft'
    ? 'draft'
    : input.lifecycleState === 'incompatible' || input.publicationState === 'incompatible'
      ? 'incompatible'
      : input.lifecycleState === 'withdrawn' || input.publicationState === 'withdrawn'
        ? 'withdrawn'
        : input.liveAvailable && input.publicationState === 'current' && input.operationRef !== undefined
          ? 'current'
          : 'unready'
  return suggestContinuation({
    subject: 'supplier',
    state,
    offeringRef: input.offeringRef,
    ...(input.operationRef === undefined ? {} : { operationRef: input.operationRef }),
  })
}

export function connectionContinuationForCli(
  actor: 'buyer' | 'supplier',
): SuggestedContinuation {
  return suggestContinuation({ subject: 'connection', state: 'missing', actor })
}

export function creditContinuationForCli(): SuggestedContinuation {
  return suggestContinuation({ subject: 'credit', state: 'insufficient' })
}
