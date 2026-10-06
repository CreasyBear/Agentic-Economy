import { v, type Infer, type ObjectType } from 'convex/values'
import { vResultValidator, vWorkflowId, type WorkflowId } from '@convex-dev/workflow'
import { internal } from '../../../_generated/api'
import type { ActionCtx, MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { planHoldBookingValue, promotionalCreditAllocationValue } from '@/modules/money/public'
import { restorePromotionalCredit } from '../../money/promotionalCredit/allocation'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { authorizePlanTools } from './quotePlan'
import { readPlanArgsValue } from './planReads'
import { planBelongsTo } from './runAdmission'
import { financiallyConclusive, projectPlan, readPlan, readPlanCalls, type Plan, type PlanRunResult } from './planState'
import { planWorkflowManager } from './runWorkflow'

const remainderValue = v.object({ holdBalanceUnits: v.string(), remainingCreditAllocation: v.optional(promotionalCreditAllocationValue), terminalEvidenceDigest: v.string() })
export const terminalPreparationResult = v.union(v.object({ kind: v.literal('waiting') }), v.object({
  kind: v.literal('ready'), expectedEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
  booking: v.optional(planHoldBookingValue), remainder: v.optional(remainderValue),
}))
export const freezeRemainderArgsValue = v.object({ planRef: v.string(), holdBalanceUnits: v.string(), remainingCreditAllocation: v.optional(promotionalCreditAllocationValue) })
export const workflowCompleteArgs = { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ planRef: v.string() }) }

async function terminalGate(ctx: MutationCtx, plan: Plan): Promise<boolean> {
  return plan.workflowFinished === true && (await readPlanCalls(ctx, plan.planRef)).every(financiallyConclusive)
}

export async function startWorkflowHandler(ctx: MutationCtx, args: { planRef: string }): Promise<null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.workflowId !== undefined || plan.authority === undefined || plan.holdReservationRefs === undefined) return null
  if (plan.terminationIntent !== undefined || plan.runDeadlineAt <= Date.now()) {
    await ctx.db.patch(plan._id, { workflowFinished: true, terminationIntent: plan.terminationIntent ?? 'expired', updatedAt: Date.now() })
    await ctx.scheduler.runAfter(0, internal.capabilityPlans.finish, args)
    return null
  }
  const workflowId = await planWorkflowManager.start(ctx, internal.capabilityPlansWorkflow.run, args, {
    onComplete: internal.capabilityPlans.workflowComplete, context: args,
  })
  await ctx.db.patch(plan._id, { workflowId, state: 'running', updatedAt: Date.now() })
  return null
}

export async function workflowCompleteHandler(ctx: MutationCtx, args: ObjectType<typeof workflowCompleteArgs>): Promise<null> {
  const plan = await readPlan(ctx, args.context.planRef)
  if (plan === null || plan.workflowId !== args.workflowId) return null
  await ctx.db.patch(plan._id, { workflowFinished: true, updatedAt: Date.now(),
    ...(args.result.kind === 'failed' ? { failureCode: 'workflow_failed' } : {}) })
  await ctx.scheduler.runAfter(0, internal.capabilityPlans.finish, { planRef: plan.planRef })
  return null
}

export async function stopPlan(ctx: MutationCtx, plan: Plan, intent: 'cancelled' | 'expired'): Promise<void> {
  if (['succeeded', 'partially_succeeded', 'failed', 'cancelled', 'expired'].includes(plan.state)) return
  const noHold = plan.holdReservationAttempt === undefined && plan.holdReservationRefs === undefined
  await ctx.db.patch(plan._id, { terminationIntent: plan.terminationIntent ?? intent,
    state: noHold ? intent : 'reconciliation_required', updatedAt: Date.now(),
    ...(noHold ? { organizationMonthlyExposureUnits: '0' } : {}),
    workflowFinished: true,
  })
  if (plan.workflowId !== undefined && plan.workflowFinished !== true) await planWorkflowManager.cancel(ctx, plan.workflowId as WorkflowId)
  if (!noHold) await ctx.scheduler.runAfter(0, internal.capabilityPlans.finish, { planRef: plan.planRef })
}

export async function cancelPlanHandler(ctx: MutationCtx, args: Infer<typeof readPlanArgsValue>): Promise<PlanRunResult> {
  if ((await requireSourceWrite(ctx, args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null) return { kind: 'refused', code: 'plan_not_found' }
  const current = await authorizePlanTools(ctx, args.principal, [...new Set(plan.nodes.map(node => node.toolRef))], Date.now(), 'persisted_invocation')
  if (current === undefined || !planBelongsTo(plan, current.principal)) return { kind: 'refused', code: 'plan_access_denied' }
  await stopPlan(ctx, plan, 'cancelled')
  const updated = await readPlan(ctx, plan.planRef)
  return { kind: 'replayed', planRef: plan.planRef, state: updated?.state ?? plan.state }
}

export async function deadlineHandler(ctx: MutationCtx, args: { planRef: string }): Promise<null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan !== null && (plan.state === 'awaiting_approval' ? plan.expiresAt : plan.runDeadlineAt) <= Date.now()) await stopPlan(ctx, plan, 'expired')
  return null
}

export async function prepareTerminalHandler(ctx: MutationCtx, args: { planRef: string }): Promise<Infer<typeof terminalPreparationResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.holdReleaseRefs !== undefined || plan.holdReservationRefs === undefined) return { kind: 'waiting' }
  if (!await terminalGate(ctx, plan)) {
    if (plan.workflowFinished === true) await ctx.db.patch(plan._id, { state: 'reconciliation_required', updatedAt: Date.now() })
    return { kind: 'waiting' }
  }
  if ((plan.holdReleaseAttempts ?? 0) >= 5) return { kind: 'waiting' }
  await ctx.db.patch(plan._id, { holdReleaseAttempts: (plan.holdReleaseAttempts ?? 0) + 1, state: 'reconciliation_required', updatedAt: Date.now() })
  await ctx.scheduler.runAfter(60_000, internal.capabilityPlans.finish, args)
  return { kind: 'ready', expectedEnvironment: plan.environment,
    ...(plan.holdBooking === undefined ? {} : { booking: plan.holdBooking }),
    ...(plan.holdRemainder === undefined ? {} : { remainder: plan.holdRemainder }) }
}

export async function freezeRemainderHandler(ctx: MutationCtx, args: Infer<typeof freezeRemainderArgsValue>): Promise<Infer<typeof remainderValue> | null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.holdReservationRefs === undefined || !await terminalGate(ctx, plan)) return null
  if (plan.holdRemainder !== undefined) return plan.holdRemainder
  if (!/^(?:0|[1-9]\d{0,15})$/u.test(args.holdBalanceUnits) || BigInt(args.holdBalanceUnits) > BigInt(plan.approvedTotalAudUnits)) return null
  const calls = await readPlanCalls(ctx, plan.planRef)
  const remainder = { holdBalanceUnits: args.holdBalanceUnits,
    ...(args.remainingCreditAllocation === undefined ? {} : { remainingCreditAllocation: args.remainingCreditAllocation }),
    terminalEvidenceDigest: canonicalDigest({ planRef: plan.planRef, authority: plan.authority ?? null,
      calls: calls.map(call => ({ callRef: call.callRef, state: call.state, financial: call.formanceFinancialState ?? null,
        settlementRefs: call.formanceSettlementRefs ?? [], releaseRefs: call.formanceReleaseRefs ?? [] })).sort((a, b) => a.callRef.localeCompare(b.callRef)) }),
  }
  await ctx.db.patch(plan._id, { holdRemainder: remainder, updatedAt: Date.now() })
  return remainder
}

export async function attachRemainderHandler(ctx: MutationCtx, args: { planRef: string; transactionRefs: string[] }): Promise<null> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.holdReleaseRefs !== undefined || plan.holdRemainder === undefined || !await terminalGate(ctx, plan)) return null
  if (plan.holdRemainder.holdBalanceUnits !== '0' && args.transactionRefs.length === 0) throw new Error('plan_release_evidence_missing')
  if (plan.holdRemainder.remainingCreditAllocation !== undefined && plan.holdCreditRestored !== true) {
    const restored = await restorePromotionalCredit(ctx, plan.holdRemainder.remainingCreditAllocation, plan.accountRef, plan.environment, Date.now())
    if (restored.kind !== 'restored') throw new Error('plan_remainder_credit_restore_failed')
  }
  const projected = await projectPlan(ctx, plan)
  const successes = projected.nodes.filter(node => node.state === 'succeeded').length
  const state = plan.terminationIntent ?? (successes === plan.nodes.length ? 'succeeded' : successes > 0 ? 'partially_succeeded' : 'failed')
  await ctx.db.patch(plan._id, { state, holdReleaseRefs: args.transactionRefs, holdCreditRestored: true,
    organizationMonthlyExposureUnits: '0', updatedAt: Date.now(),
    nodeOutcomes: [...plan.nodeOutcomes, ...projected.nodes.filter(node => node.callRef === undefined
      && !plan.nodeOutcomes.some(stored => stored.nodeId === node.nodeId)).map(node => ({ nodeId: node.nodeId, outcome: 'skipped' as const }))],
  })
  return null
}

export async function finishPlanHandler(ctx: ActionCtx, args: { planRef: string }): Promise<null> {
  const prepared = await ctx.runMutation(internal.capabilityPlans.prepareTerminal, args)
  if (prepared.kind !== 'ready') return null
  let remainder = prepared.remainder
  if (remainder === undefined) {
    const balance = prepared.booking === undefined ? { kind: 'available' as const, holdBalanceUnits: '0' }
      : await ctx.runAction(internal.moneyFormance.readPlanRemainder, { ...prepared.booking, expectedEnvironment: prepared.expectedEnvironment })
    if (balance.kind !== 'available') return null
    const frozen = await ctx.runMutation(internal.capabilityPlans.freezeRemainder, { planRef: args.planRef, holdBalanceUnits: balance.holdBalanceUnits,
      ...('remainingCreditAllocation' in balance && balance.remainingCreditAllocation !== undefined ? { remainingCreditAllocation: balance.remainingCreditAllocation } : {}) })
    if (frozen === null) return null
    remainder = frozen
  }
  const result = prepared.booking === undefined ? { kind: 'completed' as const, transactionRefs: [] }
    : await ctx.runAction(internal.moneyFormance.releasePlanRemainder, { ...prepared.booking, ...remainder,
      allNodeCallsFinanciallyConclusive: true, expectedEnvironment: prepared.expectedEnvironment })
  if (result.kind === 'completed') await ctx.runMutation(internal.capabilityPlans.attachRemainder, { ...args, transactionRefs: [...result.transactionRefs] })
  return null
}

export { remainderValue }
