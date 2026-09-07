export type SuggestedNextAction = Readonly<{
  label: string
  kind: 'navigate' | 'copy_command' | 'retry' | 'reconcile'
  command?: string
  href?: string
  warning?: string
}>

type CommandNextAction = SuggestedNextAction & Readonly<{ command: string }>

export type ToolNextActionFacts = Readonly<{
  toolRef: string
  searchQuery: string
  availabilityPosture: 'setup_required' | 'routeable' | 'unavailable'
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>

export type NextActionState =
  | Readonly<{
      subject: 'tool'
      state: 'ready' | 'connection_required' | 'read_only' | 'unavailable'
      toolRef: string
      searchQuery: string
    }>
  | Readonly<{
      subject: 'call'
      state: 'pending' | 'completed' | 'retryable' | 'cancellable' | 'reconciliation_required'
      callRef: string
    }>
  | Readonly<{
      subject: 'provider'
      state: 'draft' | 'unready' | 'incompatible' | 'withdrawn' | 'current'
      offeringRef: string
      toolRef?: string
    }>
  | Readonly<{ subject: 'connection'; state: 'missing'; actor: 'buyer' | 'provider' }>
  | Readonly<{ subject: 'credit'; state: 'insufficient' }>

type CallStatusState =
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

export function nextActionForCallStatus(input: Readonly<{
  callRef: string
  state: CallStatusState
}>): CommandNextAction {
  const state: Extract<NextActionState, { subject: 'call' }>['state'] =
    input.state === 'authorized' || input.state === 'leased'
      ? 'cancellable'
      : input.state === 'retryable'
        ? 'retryable'
        : input.state === 'reconciliation_required'
          ? 'reconciliation_required'
          : input.state === 'terminal' || input.state === 'cancelled' || input.state === 'invalidated'
            ? 'completed'
            : 'pending'
  return callNextAction({ subject: 'call', state, callRef: input.callRef })
}

/**
 * Projects existing result facts into one safe next action. This is an
 * internal presentation rule: it grants no authority and performs no work.
 */
export function suggestNextAction(state: NextActionState): SuggestedNextAction {
  if (state.subject === 'tool') return toolNextAction(state)
  if (state.subject === 'call') return callNextAction(state)
  if (state.subject === 'provider') return providerNextAction(state)
  if (state.subject === 'connection') {
    return state.actor === 'buyer'
      ? { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' }
      : {
          label: 'Connect provider',
          kind: 'navigate',
          href: '/owner/offerings#provider-connections',
        }
  }
  return { label: 'Add credit', kind: 'navigate', command: 'ae account balance', href: '/owner/credit#fund' }
}

/** Converts adapter-visible Tool facts into the one shared next action. */
export function nextActionForToolFacts(
  input: ToolNextActionFacts,
): SuggestedNextAction {
  const state = input.availabilityPosture === 'setup_required'
    ? 'read_only'
    : input.availabilityPosture === 'unavailable'
      ? 'unavailable'
      : input.requiresBuyerCredential && !input.hasBuyerCredential
        ? 'connection_required'
        : 'ready'
  return suggestNextAction({
    subject: 'tool',
    state,
    toolRef: input.toolRef,
    searchQuery: normalizedAlternativeSearchQuery(input.searchQuery),
  })
}

function normalizedAlternativeSearchQuery(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  const query = normalized.length === 0 ? 'current Tool alternatives' : normalized
  return query.length <= 200 ? query : query.slice(0, 200).trimEnd()
}

function toolNextAction(
  state: Extract<NextActionState, { subject: 'tool' }>,
): SuggestedNextAction {
  if (state.state === 'ready') {
    return {
      label: 'Call Tool',
      kind: 'copy_command',
      command: `ae call ${state.toolRef} --input '<json>'`,
    }
  }
  if (state.state === 'connection_required') {
    return { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' }
  }
  if (state.state === 'read_only') {
    return {
      label: 'Find callable alternatives',
      kind: 'navigate',
      command: callableAlternativesCommand(state.searchQuery),
      href: callableAlternativesHref(state.searchQuery),
      warning: 'This Tool is inspectable but not currently callable.',
    }
  }
  return {
    label: 'Find callable alternatives',
    kind: 'navigate',
    command: callableAlternativesCommand(state.searchQuery),
    href: callableAlternativesHref(state.searchQuery),
    warning: 'This Tool is not currently callable.',
  }
}

function callableAlternativesCommand(searchQuery: string): string {
  const escaped = searchQuery.replaceAll("'", "'\\''")
  return `ae search '${escaped}' --filters '{"availability":["routeable"]}'`
}

function callableAlternativesHref(searchQuery: string): string {
  const query = new URLSearchParams({
    window: '30d',
    query: searchQuery,
    availability: 'routeable',
  })
  return `/market?${query.toString()}`
}

function callNextAction(
  state: Extract<NextActionState, { subject: 'call' }>,
): CommandNextAction {
  if (state.state === 'pending') {
    return { label: 'Check call status', kind: 'copy_command', command: `ae status ${state.callRef}` }
  }
  if (state.state === 'completed') {
    return {
      label: 'View receipt',
      kind: 'navigate',
      command: `ae status ${state.callRef}`,
      href: `/calls/${state.callRef}`,
    }
  }
  if (state.state === 'retryable') {
    return {
      label: 'Review safe retry',
      kind: 'retry',
      command: `ae status ${state.callRef}`,
      warning: 'Reuse the recorded Call identity before retrying.',
    }
  }
  if (state.state === 'cancellable') {
    return { label: 'Review cancellation', kind: 'copy_command', command: `ae status ${state.callRef}` }
  }
  return {
    label: 'Prepare reconciliation',
    kind: 'reconcile',
    command: 'ae help recover',
    warning: 'The external effect may have started. Reconcile before retrying.',
  }
}

function providerNextAction(
  state: Extract<NextActionState, { subject: 'provider' }>,
): SuggestedNextAction {
  if (state.state === 'current' && state.toolRef !== undefined) {
    return {
      label: 'View live Tool',
      kind: 'navigate',
      command: `ae describe ${state.toolRef}`,
      href: `/tools/${state.toolRef}`,
    }
  }
  const href = `/owner/supply/${encodeURIComponent(state.offeringRef)}`
  if (state.state === 'draft') {
    return {
      label: 'Continue description',
      kind: 'navigate',
      href: `/owner/supply/${encodeURIComponent(state.offeringRef)}`,
    }
  }
  if (state.state === 'unready' || state.state === 'current') {
    return { label: 'Recheck readiness', kind: 'navigate', href }
  }
  if (state.state === 'incompatible') {
    return { label: 'Inspect incompatibility', kind: 'navigate', href }
  }
  return { label: 'Republish Tool', kind: 'navigate', href }
}
