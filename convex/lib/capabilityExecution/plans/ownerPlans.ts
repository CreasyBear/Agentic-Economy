import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { clerkMfaConsequenceProofValue, consumeConsequenceProof, deriveMfaConsequenceProof } from '../../authority/consequence/proof'
import { planQuoteResultValue } from './quotePlan'
import { validateRunPlan } from './runAdmission'
import { stopPlan } from './terminalLifecycle'
import { planProgressValue, planRunRefusalValue, projectPlan, readPlan, type Plan, type PlanRunResult } from './planState'

export const ownerPlanResult = v.union(planRunRefusalValue, v.object({
  kind: v.literal('available'), quote: planQuoteResultValue, progress: planProgressValue, planJson: v.string(),
}))
export const ownerPlanDecisionArgs = v.object({
  planRef: v.string(), planDigest: v.string(), approvedTotalAudUnits: v.string(), decision: v.union(v.literal('approve'), v.literal('deny')),
  operationKey: v.string(), correlationId: v.string(), proof: v.optional(clerkMfaConsequenceProofValue), ...sourceWriteArgs,
})
export const ownerPlanCancelArgs = v.object({ planRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs })

export async function cancelOwnerPlanHandler(ctx: MutationCtx, args: Infer<typeof ownerPlanCancelArgs>): Promise<PlanRunResult> {
  const commandRef = `plan-cancel:${args.planRef}`
  if (args.operationKey !== commandRef || args.correlationId !== commandRef
    || (await requireSourceWrite(ctx, args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'plan_access_denied' }
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.accountRef !== actor.canonicalAccountRef) return { kind: 'refused', code: 'plan_not_found' }
  await stopPlan(ctx, plan, 'cancelled')
  return { kind: 'replayed', planRef: plan.planRef, state: (await readPlan(ctx, plan.planRef))?.state ?? plan.state }
}

function quoteProjection(plan: Plan): Extract<Infer<typeof planQuoteResultValue>, { kind: 'quoted' }> {
  return { kind: 'quoted', planRef: plan.planRef, planDigest: plan.planDigest,
    nodes: plan.nodes.map(({ nodeId, toolRef, inputMode, priceClass, pricingDigest, ceilingAudUnits, validation, dependsOn, bounds, rateToleranceBps }) => ({
      nodeId, toolRef, inputMode, priceClass, pricingDigest, ceilingAudUnits, validation, dependsOn,
      ...(bounds === undefined ? {} : { bounds }),
      ...(rateToleranceBps === undefined ? {} : { rateToleranceBps }),
    })), stages: plan.stages, dataFlows: plan.dataFlows, approvedTotalAudUnits: plan.approvedTotalAudUnits,
    currency: 'AUD', exponent: 6, expiresAt: plan.expiresAt }
}

export async function readOwnerPlanHandler(ctx: QueryCtx, args: { planRef: string }): Promise<Infer<typeof ownerPlanResult>> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'plan_access_denied' }
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.accountRef !== actor.canonicalAccountRef) return { kind: 'refused', code: 'plan_not_found' }
  return { kind: 'available', quote: quoteProjection(plan), progress: await projectPlan(ctx, plan), planJson: plan.planJson }
}

export const ownerPlanSummaryValue = v.object({
  planRef: v.string(), state: planProgressValue.fields.state, approvedTotalAudUnits: v.string(), nodeCount: v.number(), createdAt: v.number(),
})
export async function listOwnerPlansHandler(ctx: QueryCtx): Promise<Infer<typeof ownerPlanSummaryValue>[]> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const plans = await ctx.db.query('capabilityPlans').withIndex('by_ownerId_and_createdAt', q => q.eq('ownerId', actor.canonicalAccountRef)).order('desc').take(50)
  return plans.map(plan => ({ planRef: plan.planRef, state: plan.state, approvedTotalAudUnits: plan.approvedTotalAudUnits,
    nodeCount: plan.nodes.length, createdAt: plan.createdAt }))
}

/**
 * Requires the current Account owner and exact displayed material. Ensures one
 * durable decision; no Hold on denial/expiry. Invariant: approved authority pins
 * every ceiling and grant. Changed material or missing proof refuses unchanged.
 */
export async function decideOwnerPlanHandler(ctx: MutationCtx, args: Infer<typeof ownerPlanDecisionArgs>): Promise<PlanRunResult> {
  const commandRef = `plan-approval:${args.planRef}:${args.decision}`
  if (args.operationKey !== commandRef || args.correlationId !== commandRef
    || (await requireSourceRead(args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'plan_access_denied' }
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.accountRef !== actor.canonicalAccountRef) return { kind: 'refused', code: 'plan_not_found' }
  if (args.approvedTotalAudUnits !== plan.approvedTotalAudUnits) return { kind: 'refused', code: 'approved_total_mismatch' }
  if (args.planDigest !== plan.planDigest) return { kind: 'refused', code: 'plan_changed' }
  const expectedDecision = args.decision === 'approve' ? 'approved' : 'denied'
  if (plan.approvalDecision !== undefined) return plan.approvalDecision.decision === expectedDecision
    ? { kind: 'replayed', planRef: plan.planRef, state: plan.state } : { kind: 'refused', code: 'approval_required' }
  if (plan.state !== 'awaiting_approval' || plan.authority !== undefined || plan.holdReservationAttempt !== undefined
    || plan.holdReservationRefs !== undefined) return { kind: 'refused', code: 'approval_required' }
  const now = Date.now()
  if (args.decision === 'approve') {
    if (plan.expiresAt <= now) return { kind: 'refused', code: 'plan_quote_expired' }
    const valid = await validateRunPlan(ctx, plan, now)
    if (valid.kind === 'refused') return valid
    if (plan.grantDigest === undefined || valid.principal.authorityMode !== 'approval_required') return { kind: 'refused', code: 'grant_changed' }
    // Owner-chat retains the same consequence proof requirement as one Call.
    if (plan.applicationRef === 'ae-owner-chat') {
      const identity = await ctx.auth.getUserIdentity()
      if (identity === null || args.proof === undefined) return { kind: 'refused', code: 'mfa_reverification_required' }
      const derived = deriveMfaConsequenceProof({ proof: args.proof, subject: identity.subject, now })
      if (derived.kind === 'refused') return { kind: 'refused', code: 'mfa_reverification_required' }
      const commandDigest = canonicalDigest({ action: 'owner-chat:approve-plan', idempotencyRef: commandRef,
        planRef: plan.planRef, planDigest: plan.planDigest, approvedTotalAudUnits: plan.approvedTotalAudUnits,
        grantRef: plan.grantRef, grantGeneration: plan.grantGeneration, grantDigest: plan.grantDigest,
        actorPrincipalRef: actor.canonicalPrincipalRef, accountRef: actor.canonicalAccountRef })
      const consumed = await consumeConsequenceProof(ctx, { reverificationId: args.proof.reverificationId,
        actorPrincipalRef: actor.canonicalPrincipalRef, activeAccountRef: actor.canonicalAccountRef,
        commandDigest, proof: derived.proof, correlationRef: commandRef, idempotencyRef: commandRef })
      if (consumed.kind === 'refused') return { kind: 'refused', code: 'mfa_reverification_required' }
    }
    // Throw after a proof write so a rejected nonce rolls the whole decision back.
    if ((await requireSourceWrite(ctx, args, 'protected_action')).kind !== 'accepted') throw new Error('plan_approval_source_rejected')
    const runDeadlineAt = Math.min(now + 30 * 60_000, valid.grantExpiresAt)
    await ctx.db.patch(plan._id, { state: 'reconciliation_required', runDeadlineAt, maximumConcurrentNodes: valid.maximumConcurrentNodes,
      approvalDecision: { decision: 'approved', actorRef: actor.canonicalPrincipalRef, decidedAt: now },
      authority: { format: 'plan', planRef: plan.planRef, planDigest: plan.planDigest, approvedTotalAudUnits: plan.approvedTotalAudUnits,
        nodeCeilings: plan.nodes.map(node => ({ nodeId: node.nodeId, ceilingAudUnits: node.ceilingAudUnits })),
        grantRef: plan.grantRef, grantGeneration: plan.grantGeneration, grantDigest: plan.grantDigest, expiresAt: runDeadlineAt }, updatedAt: now })
    await ctx.scheduler.runAt(runDeadlineAt, internal.capabilityPlans.deadline, { planRef: plan.planRef })
    await ctx.scheduler.runAfter(0, internal.capabilityPlans.continueRun, { planRef: plan.planRef })
    return { kind: 'running', planRef: plan.planRef, state: 'reconciliation_required' }
  }
  if ((await requireSourceWrite(ctx, args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  await ctx.db.patch(plan._id, { state: 'cancelled', terminationIntent: 'cancelled', workflowFinished: true,
    approvalDecision: { decision: 'denied', actorRef: actor.canonicalPrincipalRef, decidedAt: now },
    organizationMonthlyExposureUnits: '0', updatedAt: now })
  return { kind: 'replayed', planRef: plan.planRef, state: 'cancelled' }
}
