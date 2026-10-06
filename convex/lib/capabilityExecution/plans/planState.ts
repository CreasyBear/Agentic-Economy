import { v, type Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { literalUnion } from '@/modules/common/convex-literals'
import type { CallPrincipal } from '../callLifecycle/contracts'

export const planStateValue = literalUnion(['quoted', 'awaiting_approval', 'running', 'succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired', 'reconciliation_required'] as const)
export const planRunRefusalValue = v.object({ kind: v.literal('refused'), code: literalUnion([
  'plan_quote_expired', 'plan_changed', 'approved_total_mismatch', 'grant_changed', 'approval_required',
  'total_exceeds_available', 'hold_unavailable', 'idempotency_key_reused', 'plan_not_found', 'plan_access_denied', 'plan_not_cancellable',
  'mfa_reverification_required',
] as const) })
export const planRunResultValue = v.union(planRunRefusalValue, v.object({
  kind: literalUnion(['running', 'awaiting_approval', 'replayed'] as const), planRef: v.string(), state: planStateValue,
}))
export type PlanRunResult = Infer<typeof planRunResultValue>
export type Plan = Doc<'capabilityPlans'>
export type PlanCall = Doc<'capabilityCalls'>

export function planPrincipal(plan: Plan): CallPrincipal | undefined {
  if (plan.applicationRef === undefined || plan.principalScopes === undefined || plan.authorityMode === undefined) return undefined
  return { principalId: plan.principalId, ownerId: plan.ownerId, credentialId: plan.credentialId,
    applicationRef: plan.applicationRef, environment: plan.environment, scopes: plan.principalScopes, authorityMode: plan.authorityMode }
}

export async function readPlan(ctx: Pick<QueryCtx, 'db'>, planRef: string): Promise<Plan | null> {
  return ctx.db.query('capabilityPlans').withIndex('by_planRef', q => q.eq('planRef', planRef)).unique()
}

export async function readPlanCalls(ctx: Pick<QueryCtx, 'db'>, planRef: string): Promise<PlanCall[]> {
  const calls = await ctx.db.query('capabilityCalls').withIndex('by_planRef', q => q.eq('planRef', planRef)).take(11)
  if (calls.length > 10 || new Set(calls.map(call => call.planNodeId)).size !== calls.length) throw new Error('plan_call_identity_conflict')
  return calls
}

/** A delivery response alone cannot release a Hold or enable dependent purchases. */
export function financiallyConclusive(call: PlanCall): boolean {
  const terminal = ['completed', 'refused', 'cancelled', 'reconciliation_required'].includes(call.state)
  if (!terminal) return false
  const trace = call.formanceReservationRefs !== undefined || call.formanceReservationAttempt !== undefined || call.formanceFinancialState !== undefined
  return trace ? call.formanceFinancialState === 'released' || call.formanceFinancialState === 'settled'
    : call.state !== 'reconciliation_required'
}

export const planNodeProgressValue = v.object({
  nodeId: v.string(), toolRef: v.string(), providerHost: v.string(), dependsOn: v.array(v.string()),
  ceilingAudUnits: v.string(), state: literalUnion(['waiting', 'ready', 'admitted', 'succeeded', 'failed', 'skipped'] as const),
  callRef: v.optional(v.string()), outcome: v.optional(v.string()), resultJson: v.optional(v.string()),
  chargedAudUnits: v.optional(v.string()), releasedAudUnits: v.optional(v.string()),
})
export const planProgressValue = v.object({
  kind: v.literal('available'), planRef: v.string(), planDigest: v.string(), state: planStateValue,
  approvedTotalAudUnits: v.string(), currency: v.literal('AUD'), exponent: v.literal(6),
  expiresAt: v.number(), runDeadlineAt: v.number(), maximumConcurrentNodes: v.number(),
  terminationIntent: v.optional(literalUnion(['cancelled', 'expired'] as const)), failureCode: v.optional(v.string()),
  stages: v.array(v.array(v.string())), nodes: v.array(planNodeProgressValue),
  dataFlows: v.array(v.object({ from: v.string(), to: v.string(), destinationProviderHost: v.string() })),
  hold: v.object({ status: literalUnion(['none', 'pending', 'reserved', 'released', 'uncertain'] as const),
    settledAudUnits: v.string(), releasedAudUnits: v.string(), heldAudUnits: v.optional(v.string()) }),
})
export type PlanProgress = Infer<typeof planProgressValue>

export async function projectPlan(ctx: Pick<QueryCtx, 'db'>, plan: Plan): Promise<PlanProgress> {
  const calls = await readPlanCalls(ctx, plan.planRef)
  const nodes: PlanProgress['nodes'] = []
  let settled = 0n
  let released = 0n
  for (const node of plan.nodes) {
    const call = calls.find(candidate => candidate.planNodeId === node.nodeId)
    const noCall = plan.nodeOutcomes.find(candidate => candidate.nodeId === node.nodeId)
    const quoteRef = call?.quoteRef
    const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
    const amount = quote?.decisionAudUnits
    const booked = amount !== undefined && /^(?:0|[1-9]\d{0,15})$/u.test(amount)
    const charged = call?.formanceFinancialState === 'settled' && booked ? amount : undefined
    const returned = call?.formanceFinancialState === 'released' && call.formanceReleaseRefs !== undefined && booked ? amount : undefined
    settled += BigInt(charged ?? '0')
    released += BigInt(returned ?? '0')
    nodes.push({ nodeId: node.nodeId, toolRef: node.toolRef, providerHost: node.providerHost,
      dependsOn: node.dependsOn, ceilingAudUnits: node.ceilingAudUnits,
      state: call !== undefined ? !financiallyConclusive(call) ? 'admitted'
        : call.state === 'completed' && call.result?.kind === 'completed' ? 'succeeded' : 'failed'
        : noCall !== undefined ? 'skipped' : 'waiting',
      ...(call === undefined ? {} : { callRef: call.callRef }),
      ...(noCall === undefined ? {} : { outcome: noCall.outcome }),
      ...(call?.result === undefined ? {} : { resultJson: JSON.stringify(call.result) }),
      ...(charged === undefined ? {} : { chargedAudUnits: charged }),
      ...(returned === undefined ? {} : { releasedAudUnits: returned }),
    })
  }
  // Traverse dependency order even when the submitted node array is unordered.
  for (const nodeId of plan.stages.flat()) {
    const node = nodes.find(candidate => candidate.nodeId === nodeId)
    if (node === undefined || node.state !== 'waiting') continue
    const dependencies = nodes.filter(candidate => node.dependsOn.includes(candidate.nodeId))
    if (plan.terminationIntent !== undefined || dependencies.some(candidate => candidate.state === 'failed' || candidate.state === 'skipped')) {
      node.state = 'skipped'
      node.outcome = plan.terminationIntent ?? 'skipped'
    } else if (plan.state === 'running' && dependencies.every(candidate => candidate.state === 'succeeded')) node.state = 'ready'
  }
  if (plan.holdReleaseRefs !== undefined) released += BigInt(plan.holdRemainder?.holdBalanceUnits ?? '0')
  const knownHold = plan.holdReservationRefs !== undefined
  const remaining = BigInt(plan.approvedTotalAudUnits) - settled - released
  const status = plan.state === 'reconciliation_required' || remaining < 0n ? 'uncertain' as const
    : plan.holdReleaseRefs !== undefined ? 'released' as const : knownHold ? 'reserved' as const
    : plan.holdReservationAttempt !== undefined ? 'pending' as const : 'none' as const
  return { kind: 'available', planRef: plan.planRef, planDigest: plan.planDigest, state: plan.state,
    approvedTotalAudUnits: plan.approvedTotalAudUnits, currency: 'AUD', exponent: 6,
    expiresAt: plan.expiresAt, runDeadlineAt: plan.runDeadlineAt, maximumConcurrentNodes: plan.maximumConcurrentNodes ?? 1,
    stages: plan.stages, nodes, dataFlows: plan.dataFlows,
    ...(plan.terminationIntent === undefined ? {} : { terminationIntent: plan.terminationIntent }),
    ...(plan.failureCode === undefined ? {} : { failureCode: plan.failureCode }),
    hold: { status, settledAudUnits: settled.toString(), releasedAudUnits: released.toString(),
      ...(knownHold && remaining >= 0n && status !== 'uncertain' ? { heldAudUnits: remaining.toString() } : {}) },
  }
}
