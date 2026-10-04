import type { AgentActivityView, AgentDirectoryItem, AgentDirectoryProjection, AgentLiveCallView } from './agent-operator-view-model'

export type AgentFirstUseAccess = Readonly<{
  kind: 'authorized' | 'authenticated' | 'browse_only' | 'connection_required' | 'unavailable'
  authenticated: boolean
}>
export type AgentFirstUseState =
  | Readonly<{ kind: 'choose_agent'; agents: readonly AgentDirectoryItem[] }>
  | Readonly<{ kind: 'connection_required' | 'unavailable'; agent?: AgentDirectoryItem }>
  | Readonly<{ kind: 'authorized' | 'authenticated'; agent: AgentDirectoryItem }>
  | Readonly<{ kind: 'browse_only'; agent: AgentDirectoryItem; authenticated: boolean }>
  | Readonly<{ kind: 'choose_call'; agent: AgentDirectoryItem; calls: readonly AgentLiveCallView[]; access: AgentFirstUseAccess }>
  | Readonly<{ kind: 'running' | 'awaiting_authority' | 'recording_result'; agent: AgentDirectoryItem; call: AgentLiveCallView; access: AgentFirstUseAccess }>
  | Readonly<{ kind: 'recover'; agent: AgentDirectoryItem; call: Pick<AgentActivityView, 'callRef' | 'toolRef' | 'credentialRef' | 'createdAt'>; access: AgentFirstUseAccess }>
  | Readonly<{ kind: 'delivered'; agent: AgentDirectoryItem; call: AgentActivityView & { receiptRef: string }; access: AgentFirstUseAccess }>

/** Requires an owned Agent and an exact Call when following an attempt.
 * Ensures Call evidence survives changed access, credentials and report windows.
 * Invariant: current access never proves delivery; historical success never
 * completes a new attempt. On ambiguous Calls ask for a selection; on absent
 * exact evidence retain uncertainty. Reads cannot issue access or repurchase.
 * Cost: one independent access fact replaces misleading inferred authentication.
 */
export function projectAgentFirstUse(input: Readonly<{
  directory: AgentDirectoryProjection; caller?: string; toolRef?: string; callRef?: string; unavailable?: boolean
}>): AgentFirstUseState {
  const { directory, caller, toolRef, callRef } = input
  if (caller === undefined && (directory.items.length > 1 || directory.nextCursor !== undefined)) {
    return { kind: 'choose_agent', agents: directory.items }
  }
  const agent = caller === undefined ? directory.items[0] : directory.items.find(item => item.principalRef === caller)
  if (agent === undefined) return { kind: input.unavailable ? 'unavailable' : 'connection_required' }
  const detail = directory.details.find(item => item.agent.principalRef === agent.principalRef)
  if (detail === undefined) return { kind: 'unavailable', agent }
  const credential = detail.credentials.find(item => item.credentialRef === detail.currentCredentialRef && item.lifecycle === 'active')
  const authenticated = credential?.lastAuthenticatedAt !== undefined
  const access: AgentFirstUseAccess = {
    kind: input.unavailable ? 'unavailable' : agent.status !== 'connected' || !detail.scopes.includes('market_tools:call') ? 'connection_required'
      : credential === undefined ? 'unavailable' : agent.authorityMode === 'read_only' ? 'browse_only' : authenticated ? 'authenticated' : 'authorized',
    authenticated: !input.unavailable && agent.status === 'connected' && authenticated,
  }
  let live: AgentLiveCallView | undefined
  let activity: AgentActivityView | undefined
  if (callRef !== undefined) {
    if (detail.watchedCall?.kind === 'missing') return { kind: 'unavailable', agent }
    live = detail.watchedCall?.kind === 'observed' && detail.watchedCall.live.callRef === callRef
      ? detail.watchedCall.live : detail.liveCalls?.find(call => call.callRef === callRef)
    activity = detail.watchedCall?.kind === 'observed' && detail.watchedCall.live.callRef === callRef
      ? detail.watchedCall.activity : detail.activity.find(call => call.callRef === callRef)
    if ((live === undefined && activity === undefined) || (toolRef !== undefined && (live?.toolRef ?? activity?.toolRef) !== toolRef)) return { kind: 'unavailable', agent }
  } else {
    const unresolved = new Map((detail.liveCalls ?? []).filter(call => call.phase !== 'finished' && (toolRef === undefined || call.toolRef === toolRef)).map(call => [call.callRef, call]))
    for (const call of detail.activity) {
      if ((toolRef === undefined || call.toolRef === toolRef) && (call.state === 'outcome_unknown' || call.deliveryState === 'unknown' || call.paymentState === 'unknown')) {
        unresolved.set(call.callRef, { ...call, phase: 'recovery_required' })
      }
    }
    if (unresolved.size > 1) return { kind: 'choose_call', agent, calls: [...unresolved.values()], access }
    live = [...unresolved.values()][0]
    activity = live === undefined ? undefined : detail.activity.find(call => call.callRef === live?.callRef)
  }
  if (live?.phase === 'awaiting_authority') return { kind: 'awaiting_authority', agent, call: live, access }
  if (live?.phase === 'queued' || live?.phase === 'running') return { kind: 'running', agent, call: live, access }
  if (activity !== undefined) {
    if (activity.state === 'completed' && activity.deliveryState === 'delivered' && activity.paymentState !== 'unknown' && activity.receiptRef !== undefined) {
      return { kind: 'delivered', agent, call: { ...activity, receiptRef: activity.receiptRef }, access }
    }
    return { kind: 'recover', agent, call: activity, access }
  }
  if (live !== undefined) return { kind: live.phase === 'finished' ? 'recording_result' : 'recover', agent, call: live, access }
  if (input.unavailable || detail.dataState === 'partial' || detail.dataState === 'unavailable') return { kind: 'unavailable', agent }
  return access.kind === 'browse_only' ? { kind: 'browse_only', agent, authenticated } : { kind: access.kind, agent }
}

export function firstToolInstruction(toolRef?: string, authorityMode?: AgentDirectoryItem['authorityMode']): string {
  if (authorityMode === 'read_only') return [
    'Use Agentic Economy’s public discovery in this task. Refresh tools/list and use only listed tools.',
    toolRef === undefined ? 'Ask what outside service I need, then search, describe and compare suitable Tools.' : `Describe this exact Tool: ${toolRef}, including required input, terms and data recipients.`,
    'My Agent has Browse only access. Make no purchase. If I decide to use a Tool, explain the access approval required and retain this Tool and its intended input in this task.',
  ].join('\n\n')
  return [
    'Use Agentic Economy in this task. Refresh the connected server’s tool list first.',
    toolRef === undefined
      ? 'Ask what useful outside service I need, then search and describe suitable Tools. If none fits, explain the gap.'
      : `Describe this exact Tool: ${toolRef}. Keep its reference and my intended input in this task. Ask only for missing required input.`,
    'Get a fresh Quote for the exact Tool and input. Check the price, data recipients, effects and my current authority. Do not spend beyond my approved limits; follow any required owner approval or funding handoff.',
    'When authorized, make one Call with that Quote and a stable idempotency key. Keep the returned Call reference and share the owner’s /agent-access?caller=<your principalRef>&callRef=<that Call reference> live page on this server. If interrupted or uncertain, check that same Call and follow its recovery actions before retrying.',
    'Return the actual Tool result and receipt. A configured connection or successful account check is setup progress, not a completed Tool use.',
  ].join('\n\n')
}
