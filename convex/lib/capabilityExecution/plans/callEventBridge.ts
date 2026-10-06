import { sendEvent, type WorkflowId } from '@convex-dev/workflow'
import { components, internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { financiallyConclusive, readPlan, readPlanCalls } from './planState'

/** Source-trigger transaction: delivery, finance, exposure and the wakeup cannot diverge. */
export async function planCallChanged(ctx: MutationCtx, call: Doc<'capabilityCalls'> | null): Promise<void> {
  if (call?.planRef === undefined || call.planNodeId === undefined) return
  const plan = await readPlan(ctx, call.planRef)
  if (plan === null || plan.holdReservationRefs === undefined || plan.holdReleaseRefs !== undefined) return
  if (!financiallyConclusive(call)) {
    if (call.state === 'reconciliation_required' || call.formanceFinancialState === 'outcome_unknown') {
      await ctx.db.patch(plan._id, { state: 'reconciliation_required', updatedAt: Date.now() })
    }
    return
  }
  const concluded = plan.concludedNodeIds ?? []
  if (concluded.includes(call.planNodeId)) return
  const quoteRef = call.quoteRef
  const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const reduction = call.formanceFinancialState === 'settled' || (call.formanceFinancialState === 'released' && call.formanceReleaseRefs !== undefined)
    ? quote?.decisionAudUnits : '0'
  const exposure = plan.organizationMonthlyExposureUnits
  if (reduction === undefined || exposure === undefined || !/^(?:0|[1-9]\d{0,15})$/u.test(reduction)
    || !/^(?:0|[1-9]\d{0,30})$/u.test(exposure) || BigInt(reduction) > BigInt(exposure)) {
    await ctx.db.patch(plan._id, { state: 'reconciliation_required', failureCode: 'plan_exposure_inconsistent',
      organizationMonthlyExposureUnits: undefined, updatedAt: Date.now() })
    return
  }
  const unresolvedSibling = (await readPlanCalls(ctx, plan.planRef)).some(other => other.callRef !== call.callRef
    && !financiallyConclusive(other) && (other.state === 'reconciliation_required' || other.formanceFinancialState === 'outcome_unknown'))
  await ctx.db.patch(plan._id, {
    concludedNodeIds: [...concluded, call.planNodeId], organizationMonthlyExposureUnits: (BigInt(exposure) - BigInt(reduction)).toString(),
    holdSettlementRefs: [...new Set([...(plan.holdSettlementRefs ?? []), ...(call.formanceSettlementRefs ?? [])])],
    ...(!unresolvedSibling && plan.terminationIntent === undefined && plan.workflowFinished !== true && plan.authority !== undefined
      && plan.runDeadlineAt > Date.now() ? { state: 'running' as const } : {}), updatedAt: Date.now(),
  })
  if (plan.workflowFinished === true) await ctx.scheduler.runAfter(0, internal.capabilityPlans.finish, { planRef: plan.planRef })
  else if (plan.workflowId !== undefined) await sendEvent(ctx, components.workflow, {
    workflowId: plan.workflowId as WorkflowId, name: `${plan.planRef}:${call.planNodeId}`,
  })
}
