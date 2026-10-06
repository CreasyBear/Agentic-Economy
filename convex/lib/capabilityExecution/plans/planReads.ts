import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { requireSourceRead } from '../../security/sourceWrite/admission'
import { principalValue } from '../callLifecycle/contracts'
import { authorizePlanTools } from './quotePlan'
import { planBelongsTo } from './runAdmission'
import { planProgressValue, planRunRefusalValue, projectPlan, readPlan, type PlanProgress } from './planState'

export const readPlanArgsValue = v.object({ operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs, principal: principalValue, planRef: v.string() })
export const readPlanResult = v.union(planProgressValue, planRunRefusalValue)

export async function readProgressHandler(ctx: QueryCtx, args: { planRef: string }): Promise<PlanProgress | null> {
  const plan = await readPlan(ctx, args.planRef)
  return plan === null ? null : await projectPlan(ctx, plan)
}

/** Query-only: authenticate and project. Never consume a nonce, emit an event or admit work. */
export async function getPlanHandler(ctx: QueryCtx, args: Infer<typeof readPlanArgsValue>): Promise<Infer<typeof readPlanResult>> {
  if ((await requireSourceRead(args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null) return { kind: 'refused', code: 'plan_not_found' }
  const authority = await authorizePlanTools(ctx, args.principal, [...new Set(plan.nodes.map(node => node.toolRef))], Date.now(), 'persisted_invocation')
  if (authority === undefined) return { kind: 'refused', code: 'plan_access_denied' }
  return planBelongsTo(plan, authority.principal) ? await projectPlan(ctx, plan) : { kind: 'refused', code: 'plan_access_denied' }
}
