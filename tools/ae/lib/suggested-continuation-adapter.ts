import {
  nextActionForCallStatus,
  nextActionForToolFacts,
  suggestNextAction,
  type SuggestedNextAction,
} from '@/modules/market/suggested-next-action'

type ToolNextActionInput = Readonly<{
  toolRef: string
  searchQuery: string
  availabilityPosture: 'setup_required' | 'routeable' | 'unavailable'
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>

type CallNextActionInput = Readonly<{
  kind: 'found' | 'refused'
  callRef: string
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

type ProviderNextActionInput = Readonly<{
  offeringRef: string
  catalogStatus: 'draft' | 'published' | 'paused' | 'retired'
  lifecycleState: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  liveAvailable: boolean
  publicationState?: 'current' | 'withdrawn' | 'superseded' | 'incompatible'
  toolRef?: string
}>

export function toolNextActionForCli(
  input: ToolNextActionInput,
): SuggestedNextAction {
  return nextActionForToolFacts(input)
}

export function callNextActionForCli(
  input: CallNextActionInput,
): SuggestedNextAction | undefined {
  if (input.kind === 'found' && input.state !== undefined) {
    if (input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated') {
      return undefined
    }
    return nextActionForCallStatus({ callRef: input.callRef, state: input.state })
  }
  return suggestNextAction({
    subject: 'call',
    state: input.retryable === true ? 'retryable' : 'completed',
    callRef: input.callRef,
  })
}

export function providerNextActionForCli(
  input: ProviderNextActionInput,
): SuggestedNextAction {
  const state = input.catalogStatus === 'draft'
    ? 'draft'
    : input.lifecycleState === 'incompatible' || input.publicationState === 'incompatible'
      ? 'incompatible'
      : input.lifecycleState === 'withdrawn' || input.publicationState === 'withdrawn'
        ? 'withdrawn'
        : input.liveAvailable && input.publicationState === 'current' && input.toolRef !== undefined
          ? 'current'
          : 'unready'
  return suggestNextAction({
    subject: 'provider',
    state,
    offeringRef: input.offeringRef,
    ...(input.toolRef === undefined ? {} : { toolRef: input.toolRef }),
  })
}

export function connectionContinuationForCli(
  actor: 'buyer' | 'provider',
): SuggestedNextAction {
  return suggestNextAction({ subject: 'connection', state: 'missing', actor })
}

export function creditContinuationForCli(): SuggestedNextAction {
  return suggestNextAction({ subject: 'credit', state: 'insufficient' })
}
