import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { canonicalCallRef } from '@/modules/capability-execution/call-authority'
import { jsonObject } from '@/modules/capability-execution/convex'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { principalValue } from '../callLifecycle/contracts'
import { financialSubjectsResult } from '../quotes/contracts'
import { prepareFinancialSubjectsCore } from '../quotes/prepareFinancialSubjects'
import { quoteActionCore } from '../quotes/quoteAction'
import { reserveHandler } from '../callLifecycle/admissionReserve'
import { callHandler } from '../callLifecycle/callReservationActions'
import { nodeOutcomeValue, planNodeValue, readNodeMaterial } from './nodeMaterial'
import { financiallyConclusive, planPrincipal, readPlan, readPlanCalls } from './planState'

const nodePreparationResult = v.union(
  v.object({ kind: v.literal('no_call'), outcome: nodeOutcomeValue }),
  v.object({ kind: v.literal('prepared'), principal: principalValue, toolRef: v.string(), input: jsonObject, subjects: financialSubjectsResult }),
)
export const prepareNodeSubjectsResult = nodePreparationResult
export const prepareNodeResult = v.union(nodePreparationResult.members[0], v.object({ kind: v.literal('quoted'), quoteRef: v.string() }))
export const nodeAdmissionResult = v.union(nodePreparationResult.members[0], v.object({ kind: v.literal('admitted'), callRef: v.string() }), v.object({ kind: v.literal('paused') }))
export const admitNodeArgsValue = planNodeValue.extend({ preparation: prepareNodeResult })
export const nodeProbeArgsValue = planNodeValue.extend({ principal: principalValue, toolRef: v.string(), input: jsonObject })

/** An approved Plan permits only its current, resolved node input to leave AE. */
export async function readNodeProbeAdmissionHandler(ctx: QueryCtx, args: Infer<typeof nodeProbeArgsValue>): Promise<boolean> {
  const material = await readNodeMaterial(ctx, args)
  return material.kind === 'ready' && material.node.toolRef === args.toolRef
    && canonicalDigest(material.principal) === canonicalDigest(args.principal)
    && material.inputDigest === canonicalDigest(args.input)
}

export async function prepareNodeSubjectsHandler(ctx: MutationCtx, args: Infer<typeof planNodeValue>): Promise<Infer<typeof nodePreparationResult>> {
  const material = await readNodeMaterial(ctx, args)
  if (material.kind === 'no_call') return material
  if (!isBoundedJsonValue(material.input)) return { kind: 'no_call', outcome: 'input_invalid' }
  const input = material.input as Infer<typeof jsonObject>
  const subjects = await prepareFinancialSubjectsCore(ctx, {
    operationKey: `plan-node:${args.planRef}:${args.nodeId}`, correlationId: `plan:${args.planRef}`, principal: material.principal,
    toolRef: material.node.toolRef, input,
  }, undefined, material.plan.holdBooking?.spendingPeriods)
  return { kind: 'prepared', principal: material.principal, toolRef: material.node.toolRef, input, subjects }
}

/** Unpaid inspection only. The following mutation binds the one Call identity. */
export async function prepareNodeHandler(ctx: ActionCtx, args: Infer<typeof planNodeValue>): Promise<Infer<typeof prepareNodeResult>> {
  const prepared = await ctx.runMutation(internal.capabilityPlans.prepareNodeSubjects, args)
  if (prepared.kind === 'no_call') return prepared
  const quote = await quoteActionCore(ctx, {
    operationKey: `plan-node:${args.planRef}:${args.nodeId}`, correlationId: `plan:${args.planRef}`,
    principal: prepared.principal, toolRef: prepared.toolRef, input: prepared.input,
  }, prepared.subjects, undefined, args)
  return quote.kind === 'committed' ? { kind: 'quoted', quoteRef: quote.quoteRef }
    : { kind: 'no_call', outcome: quote.code === 'budget_exceeded' ? 'price_exceeded_ceiling' : 'skipped' }
}

export async function admitNodeHandler(ctx: MutationCtx, args: Infer<typeof admitNodeArgsValue>): Promise<Infer<typeof nodeAdmissionResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null) return { kind: 'no_call', outcome: 'skipped' }
  const existing = (await readPlanCalls(ctx, plan.planRef)).find(call => call.planNodeId === args.nodeId)
  if (existing !== undefined) return { kind: 'admitted', callRef: existing.callRef }
  const skipped = plan.nodeOutcomes.find(node => node.nodeId === args.nodeId)
  if (skipped !== undefined) return { kind: 'no_call', outcome: skipped.outcome }
  // A sibling's uncertain payment pauses admission; it is not a cancelled node.
  if (plan.terminationIntent === undefined && plan.runDeadlineAt > Date.now()
    && (plan.state === 'reconciliation_required' || (args.preparation.kind === 'no_call' && args.preparation.outcome === 'cancelled'))) return { kind: 'paused' }
  const material = await readNodeMaterial(ctx, args)
  const noCall = material.kind === 'no_call' ? material : args.preparation.kind === 'no_call' ? args.preparation : undefined
  if (noCall !== undefined) {
    if (plan.nodes.some(node => node.nodeId === args.nodeId)) await ctx.db.patch(plan._id, {
      nodeOutcomes: [...plan.nodeOutcomes, { nodeId: args.nodeId, outcome: noCall.outcome }], updatedAt: Date.now(),
    })
    return noCall
  }
  if (material.kind !== 'ready' || args.preparation.kind !== 'quoted') throw new Error('plan_node_preparation_invalid')
  const quoteRef = args.preparation.quoteRef
  const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const skip = async (outcome: Infer<typeof nodeOutcomeValue>): Promise<Infer<typeof nodeAdmissionResult>> => {
    await ctx.db.patch(plan._id, { nodeOutcomes: [...plan.nodeOutcomes, { nodeId: args.nodeId, outcome }], updatedAt: Date.now() })
    return { kind: 'no_call', outcome }
  }
  if (quote === null || quote.planRef !== plan.planRef || quote.planNodeId !== args.nodeId
    || quote.inputDigest !== material.inputDigest || quote.toolMaterialDigest !== material.node.toolMaterialDigest
    || quote.decisionAudUnits === undefined || BigInt(quote.decisionAudUnits) > BigInt(material.node.ceilingAudUnits)) return await skip('price_exceeded_ceiling')
  const calls = await readPlanCalls(ctx, plan.planRef)
  const active = calls.filter(call => !financiallyConclusive(call))
  if (active.length >= (plan.maximumConcurrentNodes ?? 1)
    || active.filter(call => plan.nodes.find(node => node.nodeId === call.planNodeId)?.providerHost === material.node.providerHost).length >= 2) {
    throw new Error('plan_node_concurrency_conflict')
  }
  const idempotencyKey = `plan:${plan.planRef}:${args.nodeId}`
  const callRef = canonicalCallRef({ ...material.principal, grantGeneration: plan.grantGeneration, toolRef: material.node.toolRef, idempotencyKey })
  const reserved = await reserveHandler(ctx, {
    quoteRef, callRef, ...material.principal, grantRef: plan.grantRef, grantGeneration: plan.grantGeneration,
    policyDigest: quote.grantPolicyDigest, grantExpiresAt: quote.grantExpiresAt, toolRef: material.node.toolRef,
    idempotencyKey, inputDigest: material.inputDigest, requestDigest: canonicalDigest({ operationRef: material.node.toolRef, input: material.input }),
    toolJson: quote.toolJson, inputJson: JSON.stringify(material.input), now: Date.now(),
  }, material.plan)
  if (reserved.kind !== 'reserved' && reserved.kind !== 'replayed') return await skip('skipped')
  await ctx.scheduler.runAfter(0, internal.capabilityPlans.startNode, { planRef: plan.planRef, nodeId: args.nodeId })
  await ctx.scheduler.runAfter(30_000, internal.capabilityPlans.startNode, { planRef: plan.planRef, nodeId: args.nodeId })
  return { kind: 'admitted', callRef: reserved.reservation.callRef }
}

export const startNodeMaterialResult = v.union(v.null(), v.object({
  principal: principalValue, quoteRef: v.string(), toolRef: v.string(), input: jsonObject,
  decisionPrice: v.object({ currency: v.literal('AUD'), exponent: v.literal(6), units: v.string() }),
  idempotencyKey: v.string(), callRef: v.string(),
}))
export async function readStartNodeHandler(ctx: QueryCtx, args: Infer<typeof planNodeValue>): Promise<Infer<typeof startNodeMaterialResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null) return null
  const principal = planPrincipal(plan)
  const call = (await readPlanCalls(ctx, plan.planRef)).find(candidate => candidate.planNodeId === args.nodeId)
  if (principal === undefined || call === undefined || call.quoteRef === undefined || call.inputJson === undefined
    || call.state !== 'pending') return null
  const quoteRef = call.quoteRef
  const quote = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const input: unknown = JSON.parse(call.inputJson)
  if (quote === null || !isBoundedJsonValue(input) || input === null || Array.isArray(input) || typeof input !== 'object') return null
  return { principal, quoteRef, toolRef: call.toolRef, input, decisionPrice: { currency: 'AUD', exponent: 6, units: quote.decisionAudUnits },
    idempotencyKey: call.idempotencyKey, callRef: call.callRef }
}

export async function startNodeHandler(ctx: ActionCtx, args: Infer<typeof planNodeValue>): Promise<null> {
  const material = await ctx.runQuery(internal.capabilityPlans.readStartNode, args)
  if (material === null) return null
  const result = await callHandler(ctx, { ...material, operationKey: `plan-node:${args.planRef}:${args.nodeId}`, correlationId: `plan:${args.planRef}` }, true, undefined, args)
  if (result.kind === 'refused') await ctx.runMutation(internal.capabilityCalls.refuseUnclaimed, {
    callRef: material.callRef, principalId: material.principal.principalId, credentialId: material.principal.credentialId,
    idempotencyKey: material.idempotencyKey, code: result.code, retryable: result.retryable,
  })
  return null
}

export const nodeAuthorityResult = v.union(v.null(), v.object({
  planRef: v.string(), nodeId: v.string(), planAuthorityDigest: v.string(), resolvedInputDigest: v.string(), ceilingAudUnits: v.string(), expiresAt: v.number(),
}))
export async function readNodeAuthorityHandler(ctx: QueryCtx, args: { callRef: string; planRef: string; nodeId: string }): Promise<Infer<typeof nodeAuthorityResult>> {
  const plan = await readPlan(ctx, args.planRef)
  const call = (await readPlanCalls(ctx, args.planRef)).find(candidate => candidate.callRef === args.callRef)
  const node = plan?.nodes.find(candidate => candidate.nodeId === args.nodeId)
  if (plan?.authority === undefined || node === undefined || call === undefined || call.planNodeId !== node.nodeId
    || plan.holdReservationRefs === undefined || plan.holdReleaseRefs !== undefined || plan.authority.expiresAt <= Date.now()
    || call.principalId !== plan.principalId || call.ownerId !== plan.accountRef || call.grantRef !== plan.authority.grantRef
    || call.grantGeneration !== plan.authority.grantGeneration || call.policyDigest !== plan.authority.grantDigest) return null
  return { planRef: plan.planRef, nodeId: node.nodeId, planAuthorityDigest: canonicalDigest(plan.authority),
    resolvedInputDigest: call.inputDigest, ceilingAudUnits: node.ceilingAudUnits, expiresAt: plan.authority.expiresAt }
}
