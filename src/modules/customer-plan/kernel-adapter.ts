import type { NeutralRoutingKernel } from '@/modules/routing-kernel/application'
import type { RootRunSnapshot } from '@/modules/routing-kernel/runtime'

import {
  advanceCustomerPlan,
  decideCustomerPlan,
  type CustomerPlanSnapshot,
} from './public'

export type ExecuteNextCustomerPlanActionDependencies = Readonly<{
  kernel: NeutralRoutingKernel
  networkId: string
  now: () => number
  authorizationTtlMs: number
}>

export type ExecuteNextCustomerPlanActionResult =
  | Readonly<{ kind: 'checkpoint'; decision: ReturnType<typeof decideCustomerPlan> }>
  | Readonly<{
      kind: 'action_completed'
      planId: string
      actionId: string
      rootRunId: string
      plan: CustomerPlanSnapshot
    }>
  | Readonly<{
      kind: 'action_waiting'
      planId: string
      actionId: string
      rootRunId: string
      plan: CustomerPlanSnapshot
    }>
  | Readonly<{
      kind: 'action_outcome_unknown'
      planId: string
      actionId: string
      rootRunId: string
      plan: CustomerPlanSnapshot
    }>
  | Readonly<{
      kind: 'action_refused'
      planId: string
      actionId: string
      reason:
        | 'no_route'
        | 'capability_contract_mismatch'
        | 'currency_mismatch'
        | 'spend_limit_exceeded'
        | 'data_authority_exceeded'
        | 'authorization_expired'
        | 'execution_refused'
        | 'execution_failed'
    }>

/**
 * Releases at most one Plan action. Composition stays in CustomerPlan; all
 * provider selection, authorization, idempotency, and effect handling stays in
 * the neutral routing kernel.
 */
export async function executeNextCustomerPlanAction(
  plan: CustomerPlanSnapshot,
  dependencies: ExecuteNextCustomerPlanActionDependencies,
): Promise<ExecuteNextCustomerPlanActionResult> {
  if (!Number.isSafeInteger(dependencies.authorizationTtlMs) || dependencies.authorizationTtlMs <= 0) {
    throw new Error('customer_plan_authorization_ttl_invalid')
  }

  const occurredAt = dependencies.now()
  const decision = decideCustomerPlan(plan, occurredAt)
  if (decision.kind !== 'action_ready') return Object.freeze({ kind: 'checkpoint', decision })

  const caller = Object.freeze({ principalId: plan.principalId, agentId: plan.agentId })
  const routed = await dependencies.kernel.operations.route({
    networkId: dependencies.networkId,
    caller,
    query: actionRouteQuery(decision.capabilityContractId, decision.input),
    constraints: {
      currency: decision.authority.currency,
      maximumSpendMinor: decision.authority.maximumSpendMinor,
    },
  })
  if (routed.kind !== 'quoted') return refused(plan, decision.actionId, 'no_route')

  const quote = routed.quote
  if (quote.selectedGraph.capabilityContractId !== decision.capabilityContractId
    || quote.selectedGraph.steps.some((step) => step.capabilityContractId !== decision.capabilityContractId)) {
    return refused(plan, decision.actionId, 'capability_contract_mismatch')
  }
  if (quote.selectedGraph.maximumCost.currency !== decision.authority.currency) {
    return refused(plan, decision.actionId, 'currency_mismatch')
  }
  if (quote.selectedGraph.maximumCost.amountMinor > decision.authority.maximumSpendMinor) {
    return refused(plan, decision.actionId, 'spend_limit_exceeded')
  }
  if (!isSubset(quote.selectedGraph.dataFields, decision.authority.dataFields)) {
    return refused(plan, decision.actionId, 'data_authority_exceeded')
  }

  const authorizationExpiresAt = Math.min(
    quote.expiresAt,
    decision.approvalExpiresAt ?? occurredAt + dependencies.authorizationTtlMs,
  )
  if (authorizationExpiresAt <= occurredAt) return refused(plan, decision.actionId, 'authorization_expired')

  const authorization = await dependencies.kernel.authority.authorize({
    quoteId: quote.quoteId,
    quoteDigest: quote.quoteDigest,
    principalId: plan.principalId,
    agentId: plan.agentId,
    maximumSpendMinor: decision.authority.maximumSpendMinor,
    currency: decision.authority.currency,
    expiresAt: authorizationExpiresAt,
    allowedDataFields: decision.authority.dataFields,
    allowedRecipientBindingIds: quote.selectedGraph.steps.map((step) => step.bindingId),
    allowedDisclosurePurposes: [decision.capabilityContractId],
  })
  const executed = await dependencies.kernel.operations.execute({
    caller,
    quoteId: quote.quoteId,
    quoteDigest: quote.quoteDigest,
    authorizationRef: authorization.authorizationRef,
    idempotencyKey: `${plan.planId}:${decision.actionId}`,
    data: decision.input,
  })
  if (executed.kind === 'execution_pending') {
    const nextPlan = advanceCustomerPlan(plan, {
      type: 'action_started', actionId: decision.actionId, rootRunId: executed.rootRunId,
      occurredAt: dependencies.now(),
    })
    return Object.freeze({
      kind: 'action_waiting', planId: plan.planId, actionId: decision.actionId,
      rootRunId: executed.rootRunId, plan: nextPlan,
    })
  }
  if (executed.kind !== 'run_admitted') return refused(plan, decision.actionId, 'execution_refused')

  if (executed.run.state === 'completed') {
    const output = completedOutcome(executed.run)
    const nextPlan = advanceCustomerPlan(plan, {
      type: 'action_completed',
      actionId: decision.actionId,
      rootRunId: executed.run.rootRunId,
      output,
      occurredAt: dependencies.now(),
    })
    return Object.freeze({
      kind: 'action_completed', planId: plan.planId, actionId: decision.actionId,
      rootRunId: executed.run.rootRunId, plan: nextPlan,
    })
  }
  if (executed.run.state === 'running') {
    const nextPlan = advanceCustomerPlan(plan, {
      type: 'action_started', actionId: decision.actionId, rootRunId: executed.run.rootRunId,
      occurredAt: dependencies.now(),
    })
    return Object.freeze({
      kind: 'action_waiting', planId: plan.planId, actionId: decision.actionId,
      rootRunId: executed.run.rootRunId, plan: nextPlan,
    })
  }
  if (executed.run.state === 'outcome_unknown') {
    const nextPlan = advanceCustomerPlan(plan, {
      type: 'action_outcome_unknown',
      actionId: decision.actionId,
      rootRunId: executed.run.rootRunId,
      occurredAt: dependencies.now(),
    })
    return Object.freeze({
      kind: 'action_outcome_unknown', planId: plan.planId, actionId: decision.actionId,
      rootRunId: executed.run.rootRunId, plan: nextPlan,
    })
  }
  return refused(plan, decision.actionId, 'execution_failed')
}

function actionRouteQuery(capabilityContractId: string, input: Readonly<Record<string, string>>): string {
  return `${capabilityContractId}\n${Object.entries(input).map(([field, value]) => `${field}: ${value}`).join('\n')}`
}

function completedOutcome(run: RootRunSnapshot): Readonly<Record<string, string>> {
  const committed = run.leaves.find((leaf) => leaf.state === 'completed' && leaf.effectState === 'committed')
  if (committed?.outcome === undefined) throw new Error('customer_plan_completed_outcome_missing')
  return committed.outcome
}

function isSubset(required: readonly string[], allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed)
  return required.every((field) => allowedSet.has(field))
}

function refused(
  plan: CustomerPlanSnapshot,
  actionId: string,
  reason: Extract<ExecuteNextCustomerPlanActionResult, { kind: 'action_refused' }>['reason'],
): ExecuteNextCustomerPlanActionResult {
  return Object.freeze({ kind: 'action_refused', planId: plan.planId, actionId, reason })
}
