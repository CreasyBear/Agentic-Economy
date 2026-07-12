import { canonicalAuthorityDigest } from '@/modules/routing-kernel/runtime'

export type CustomerPlanInputValue =
  | Readonly<{ kind: 'literal'; value: string }>
  | Readonly<{ kind: 'action_output'; actionId: string; field: string }>

export type CustomerPlanActionProposal = Readonly<{
  actionId: string
  capabilityContractId: string
  effect: 'observation' | 'consequential'
  dependsOn: readonly string[]
  input: Readonly<Record<string, CustomerPlanInputValue>>
  authority: Readonly<{ maximumSpendMinor: number; currency: string; dataFields: readonly string[] }>
}>

export type CustomerPlanProposal = Readonly<{
  planId: string
  principalId: string
  agentId: string
  intent: string
  actions: readonly CustomerPlanActionProposal[]
}>

type CustomerPlanActionState = Readonly<{
  actionId: string
  status: 'pending' | 'approved' | 'running' | 'completed' | 'outcome_unknown'
  approval?: Readonly<{
    approvalDigest: string
    maximumSpendMinor: number
    currency: string
    allowedDataFields: readonly string[]
    expiresAt: number
  }>
  rootRunId?: string
  output?: Readonly<Record<string, string>>
}>

export type CustomerPlanSnapshot = Readonly<{
  planId: string
  principalId: string
  agentId: string
  intent: string
  proposalDigest: string
  createdAt: number
  actions: readonly CustomerPlanActionProposal[]
  actionStates: readonly CustomerPlanActionState[]
}>

export type CustomerPlanDecision =
  | Readonly<{
      kind: 'action_ready'
      planId: string
      actionId: string
      capabilityContractId: string
      effect: 'observation' | 'consequential'
      input: Readonly<Record<string, string>>
      authority: Readonly<{ maximumSpendMinor: number; currency: string; dataFields: readonly string[] }>
      approvalDigest?: string
      approvalExpiresAt?: number
    }>
  | Readonly<{
      kind: 'approval_required'
      planId: string
      actionId: string
      approvalDigest: string
      maximumSpendMinor: number
      currency: string
      dataFields: readonly string[]
      resolvedInput: Readonly<Record<string, string>>
    }>
  | Readonly<{ kind: 'action_required'; planId: string; actionId: string; reason: 'outcome_unknown'; rootRunId: string }>
  | Readonly<{ kind: 'action_waiting'; planId: string; actionId: string; rootRunId: string }>
  | Readonly<{ kind: 'plan_completed'; planId: string; output: Readonly<Record<string, Readonly<Record<string, string>>>> }>

export type CustomerPlanEvent =
  | Readonly<{
      type: 'action_approved'
      actionId: string
      approvedByPrincipalId: string
      approvalDigest: string
      maximumSpendMinor: number
      currency: string
      allowedDataFields: readonly string[]
      expiresAt: number
      occurredAt: number
    }>
  | Readonly<{
      type: 'action_completed'
      actionId: string
      rootRunId: string
      output: Readonly<Record<string, string>>
      occurredAt: number
    }>
  | Readonly<{
      type: 'action_started'
      actionId: string
      rootRunId: string
      occurredAt: number
    }>
  | Readonly<{
      type: 'action_outcome_unknown'
      actionId: string
      rootRunId: string
      occurredAt: number
    }>
  | Readonly<{
      type: 'action_reconciled'
      actionId: string
      rootRunId: string
      output: Readonly<Record<string, string>>
      occurredAt: number
    }>

export function createCustomerPlan(proposal: CustomerPlanProposal, createdAt: number): CustomerPlanSnapshot {
  validateProposal(proposal)
  const actions = proposal.actions.map(freezeAction)
  return Object.freeze({
    planId: proposal.planId,
    principalId: proposal.principalId,
    agentId: proposal.agentId,
    intent: proposal.intent.trim(),
    proposalDigest: canonicalAuthorityDigest(proposalMaterial(proposal)),
    createdAt,
    actions: Object.freeze(actions),
    actionStates: Object.freeze(actions.map((action) => Object.freeze({ actionId: action.actionId, status: 'pending' as const }))),
  })
}

export function decideCustomerPlan(plan: CustomerPlanSnapshot, now: number): CustomerPlanDecision {
  const stateById = new Map(plan.actionStates.map((state) => [state.actionId, state]))
  for (const action of plan.actions) {
    const state = requiredState(stateById, action.actionId)
    if (state.status === 'completed') continue
    if (state.status === 'running') {
      if (state.rootRunId === undefined) throw new Error('customer_plan_running_run_missing')
      return Object.freeze({ kind: 'action_waiting', planId: plan.planId, actionId: action.actionId, rootRunId: state.rootRunId })
    }
    if (state.status === 'outcome_unknown') {
      if (state.rootRunId === undefined) throw new Error('customer_plan_unknown_run_missing')
      return Object.freeze({ kind: 'action_required', planId: plan.planId, actionId: action.actionId, reason: 'outcome_unknown', rootRunId: state.rootRunId })
    }
    if (!action.dependsOn.every((dependency) => requiredState(stateById, dependency).status === 'completed')) continue
    const input = resolveActionInput(action, stateById)
    if (action.effect === 'consequential' && (state.status !== 'approved' || state.approval === undefined || state.approval.expiresAt <= now)) {
      return Object.freeze({
        kind: 'approval_required', planId: plan.planId, actionId: action.actionId,
        approvalDigest: approvalDigest(plan, action, input),
        maximumSpendMinor: action.authority.maximumSpendMinor, currency: action.authority.currency,
        dataFields: Object.freeze([...action.authority.dataFields]), resolvedInput: Object.freeze(input),
      })
    }
    return Object.freeze({
      kind: 'action_ready', planId: plan.planId, actionId: action.actionId,
      capabilityContractId: action.capabilityContractId, effect: action.effect,
      input: Object.freeze(input), authority: action.authority,
      ...(state.approval === undefined ? {} : {
        approvalDigest: state.approval.approvalDigest,
        approvalExpiresAt: state.approval.expiresAt,
      }),
    })
  }
  return Object.freeze({
    kind: 'plan_completed', planId: plan.planId,
    output: Object.freeze(Object.fromEntries(plan.actionStates.flatMap((state) => state.output === undefined ? [] : [[state.actionId, state.output]]))),
  })
}

export function advanceCustomerPlan(plan: CustomerPlanSnapshot, event: CustomerPlanEvent): CustomerPlanSnapshot {
  const decision = decideCustomerPlan(plan, event.occurredAt)
  const index = plan.actionStates.findIndex((state) => state.actionId === event.actionId)
  if (index < 0) throw new Error('customer_plan_action_not_found')
  const action = plan.actions[index]
  const current = plan.actionStates[index]
  if (action === undefined || current === undefined) throw new Error('customer_plan_action_not_found')

  let next: CustomerPlanActionState
  if (event.type === 'action_approved') {
    if (decision.kind !== 'approval_required' || decision.actionId !== event.actionId) throw new Error('customer_plan_approval_not_requested')
    if (event.approvedByPrincipalId !== plan.principalId) throw new Error('customer_plan_approval_principal_mismatch')
    if (event.approvalDigest !== decision.approvalDigest) throw new Error('customer_plan_approval_digest_mismatch')
    if (event.maximumSpendMinor !== decision.maximumSpendMinor || event.currency !== decision.currency) throw new Error('customer_plan_approval_authority_mismatch')
    if (!sameStrings(event.allowedDataFields, decision.dataFields)) throw new Error('customer_plan_approval_authority_mismatch')
    if (event.expiresAt <= event.occurredAt) throw new Error('customer_plan_approval_expired')
    next = Object.freeze({
      actionId: event.actionId, status: 'approved',
      approval: Object.freeze({
        approvalDigest: event.approvalDigest, maximumSpendMinor: event.maximumSpendMinor,
        currency: event.currency, allowedDataFields: Object.freeze([...event.allowedDataFields].sort()), expiresAt: event.expiresAt,
      }),
    })
  } else if (event.type === 'action_completed') {
    requireReadyDecision(decision, event.actionId)
    next = Object.freeze({ actionId: event.actionId, status: 'completed', rootRunId: event.rootRunId, output: Object.freeze({ ...event.output }) })
  } else if (event.type === 'action_started') {
    requireReadyDecision(decision, event.actionId)
    next = Object.freeze({ actionId: event.actionId, status: 'running', rootRunId: event.rootRunId, ...(current.approval === undefined ? {} : { approval: current.approval }) })
  } else if (event.type === 'action_outcome_unknown') {
    requireReadyDecision(decision, event.actionId)
    next = Object.freeze({ actionId: event.actionId, status: 'outcome_unknown', rootRunId: event.rootRunId, ...(current.approval === undefined ? {} : { approval: current.approval }) })
  } else {
    if ((current.status !== 'running' && current.status !== 'outcome_unknown') || current.rootRunId !== event.rootRunId) throw new Error('customer_plan_reconciliation_not_expected')
    next = Object.freeze({ actionId: event.actionId, status: 'completed', rootRunId: event.rootRunId, output: Object.freeze({ ...event.output }), ...(current.approval === undefined ? {} : { approval: current.approval }) })
  }

  return Object.freeze({ ...plan, actionStates: Object.freeze(plan.actionStates.map((state, stateIndex) => stateIndex === index ? next : state)) })
}

function resolveActionInput(action: CustomerPlanActionProposal, stateById: ReadonlyMap<string, CustomerPlanActionState>): Record<string, string> {
  return Object.fromEntries(Object.entries(action.input).sort(([left], [right]) => left.localeCompare(right)).map(([field, source]) => {
    if (source.kind === 'literal') return [field, source.value]
    const value = requiredState(stateById, source.actionId).output?.[source.field]
    if (value === undefined) throw new Error('customer_plan_action_output_missing')
    return [field, value]
  }))
}

function approvalDigest(plan: CustomerPlanSnapshot, action: CustomerPlanActionProposal, input: Readonly<Record<string, string>>): string {
  return canonicalAuthorityDigest({
    planId: plan.planId, proposalDigest: plan.proposalDigest, actionId: action.actionId,
    capabilityContractId: action.capabilityContractId, input,
    maximumSpendMinor: action.authority.maximumSpendMinor, currency: action.authority.currency,
    dataFields: [...action.authority.dataFields].sort(),
  })
}

function validateProposal(proposal: CustomerPlanProposal): void {
  if (proposal.planId.trim() === '' || proposal.principalId.trim() === '' || proposal.agentId.trim() === '' || proposal.intent.trim() === '') throw new Error('customer_plan_invalid')
  if (proposal.actions.length === 0 || proposal.actions.length > 32) throw new Error('customer_plan_invalid')
  const ids = new Set(proposal.actions.map((action) => action.actionId))
  if (ids.size !== proposal.actions.length || proposal.actions.some((action) => action.actionId.trim() === '' || action.capabilityContractId.trim() === '')) throw new Error('customer_plan_invalid')
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const byId = new Map(proposal.actions.map((action) => [action.actionId, action]))
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('customer_plan_cycle')
    if (visited.has(id)) return
    const action = byId.get(id)
    if (action === undefined) throw new Error('customer_plan_dependency_not_found')
    visiting.add(id)
    for (const dependency of action.dependsOn) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const action of proposal.actions) visit(action.actionId)
}

function freezeAction(action: CustomerPlanActionProposal): CustomerPlanActionProposal {
  return Object.freeze({
    ...action, dependsOn: Object.freeze([...action.dependsOn]),
    input: Object.freeze(Object.fromEntries(Object.entries(action.input).map(([field, value]) => [field, Object.freeze({ ...value })]))),
    authority: Object.freeze({ ...action.authority, dataFields: Object.freeze([...action.authority.dataFields].sort()) }),
  })
}

function proposalMaterial(proposal: CustomerPlanProposal) {
  return { ...proposal, actions: proposal.actions.map((action) => ({ ...action, dependsOn: [...action.dependsOn].sort(), authority: { ...action.authority, dataFields: [...action.authority.dataFields].sort() } })) }
}

function requiredState(states: ReadonlyMap<string, CustomerPlanActionState>, actionId: string): CustomerPlanActionState {
  const state = states.get(actionId)
  if (state === undefined) throw new Error('customer_plan_action_not_found')
  return state
}

function requireReadyDecision(decision: CustomerPlanDecision, actionId: string): void {
  if (decision.kind !== 'action_ready' || decision.actionId !== actionId) throw new Error('customer_plan_action_not_ready')
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort()
  const b = [...right].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}
