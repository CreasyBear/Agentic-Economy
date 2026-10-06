import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeStoredAgentAccessGrant, projectAgentAccessGrant } from '@/modules/agent-access/policy'
import { normalizePricingConfig } from '@/modules/money/public'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { principalValue, type CallPrincipal } from '../callLifecycle/contracts'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { readAgentPaymentAdmission } from '../../money/treasury/paymentAdmission'
import { financialSubjectsResult } from '../quotes/contracts'
import { prepareFinancialSubjectsCore } from '../quotes/prepareFinancialSubjects'
import { authorizePlanTools, readAdmittedPlanTools } from './quotePlan'
import { planPrincipal, planRunRefusalValue, readPlan, type Plan, type PlanRunResult } from './planState'

export const runArgsValue = v.object({
  operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs,
  principal: principalValue, planRef: v.string(), approvedTotalAudUnits: v.string(), idempotencyKey: v.string(),
})
export const beginRunResult = v.union(planRunRefusalValue, v.object({
  kind: v.union(v.literal('ready'), v.literal('awaiting_approval'), v.literal('replayed')), planRef: v.string(),
}))
export const prepareRunResult = v.union(planRunRefusalValue, v.object({
  kind: v.literal('prepared'), principal: principalValue, rootToolRef: v.string(), subjects: financialSubjectsResult,
}))

export function planBelongsTo(plan: Plan, principal: CallPrincipal): boolean {
  return plan.principalId === principal.principalId && plan.accountRef === principal.ownerId
    && plan.applicationRef === principal.applicationRef && plan.environment === principal.environment
}

/** Requires pinned material and current authority. No caller can supply a replacement grant or ceiling. */
export async function validateRunPlan(ctx: Pick<QueryCtx, 'db'>, plan: Plan, now: number): Promise<
  | Extract<PlanRunResult, { kind: 'refused' }>
  | { kind: 'valid'; principal: CallPrincipal; grantExpiresAt: number; maximumConcurrentNodes: number }
> {
  const principal = planPrincipal(plan)
  if (principal === undefined || plan.grantDigest === undefined) return { kind: 'refused', code: 'grant_changed' }
  const refs = [...new Set(plan.nodes.map(node => node.toolRef))]
  const authority = await authorizePlanTools(ctx, principal, refs, now)
  if (authority === undefined || authority.grantRef !== plan.grantRef || authority.grantGeneration !== plan.grantGeneration
    || authority.policyDigest !== plan.grantDigest) return { kind: 'refused', code: 'grant_changed' }
  const materials = await readAdmittedPlanTools(ctx, principal, refs, now)
  if (materials === undefined) return { kind: 'refused', code: 'plan_changed' }
  for (const node of plan.nodes) {
    const material = materials.find(item => item.toolRef === node.toolRef)
    if (material === undefined || material.materialDigest !== node.toolMaterialDigest
      || material.pricingDigest !== node.pricingDigest || material.providerHost !== node.providerHost) return { kind: 'refused', code: 'plan_changed' }
    const pricing = normalizePricingConfig(material.pricingConfig)
    // Paid Calls currently require an attributed upstream obligation. Refuse unsupported fixed-price execution before any Hold.
    if (pricing.kind !== 'valid' || (pricing.config.kind === 'fixed_aud' && pricing.config.amountUnits !== '0')) return { kind: 'refused', code: 'plan_changed' }
  }
  const policy = await readCommercialPolicyGate(ctx.db, { environment: plan.environment, now,
    ...(plan.environment === 'sandbox' ? { sandboxFixture: 'managed_x402_deterministic_v1' as const } : {}) })
  if (policy.kind !== 'admitted' || policy.policyDigest !== plan.commercialPolicyDigest) return { kind: 'refused', code: 'plan_changed' }
  const row = await ctx.db.query('agentAccessGrants').withIndex('by_grantRef', q => q.eq('grantRef', plan.grantRef)).unique()
  if (row === null) return { kind: 'refused', code: 'grant_changed' }
  const grant = normalizeStoredAgentAccessGrant(row)
  const budget = projectAgentAccessGrant(grant).budget
  if (budget.maximumSpendPerCall.currency !== 'AUD' || budget.maximumSpendPerCall.exponent !== 6
    || plan.nodes.some(node => BigInt(node.ceilingAudUnits) > BigInt(budget.maximumSpendPerCall.units))) return { kind: 'refused', code: 'total_exceeds_available' }
  if (plan.approvedTotalAudUnits !== '0') {
    if (principal.authorityMode === 'read_only') return { kind: 'refused', code: 'approval_required' }
    const access = await readAgentPaymentAdmission(ctx, { environment: plan.environment, accountRef: plan.accountRef,
      grantRef: plan.grantRef, grantGeneration: plan.grantGeneration }, now)
    if (access.kind === 'refused') return { kind: 'refused', code: 'hold_unavailable' }
  }
  const concurrency = 'maximumConcurrentCalls' in grant.spendingPolicy.budget
    ? grant.spendingPolicy.budget.maximumConcurrentCalls : grant.spendingPolicy.budget.maximumConcurrentInvocations
  return { kind: 'valid', principal, grantExpiresAt: authority.expiresAt, maximumConcurrentNodes: Math.min(3, concurrency) }
}

/** Exact total precedes replay. Authority precedes the only scheduled Hold attempt. */
export async function beginRunHandler(ctx: MutationCtx, args: Infer<typeof runArgsValue>): Promise<Infer<typeof beginRunResult>> {
  if ((await requireSourceWrite(ctx, args, 'protected_action')).kind !== 'accepted') return { kind: 'refused', code: 'plan_access_denied' }
  return beginRunCore(ctx, args)
}

export async function beginRunCore(ctx: MutationCtx,
  args: Pick<Infer<typeof runArgsValue>, 'principal' | 'planRef' | 'approvedTotalAudUnits' | 'idempotencyKey'>,
): Promise<Infer<typeof beginRunResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null) return { kind: 'refused', code: 'plan_not_found' }
  if (!planBelongsTo(plan, args.principal)) return { kind: 'refused', code: 'plan_access_denied' }
  if (args.approvedTotalAudUnits !== plan.approvedTotalAudUnits) return { kind: 'refused', code: 'approved_total_mismatch' }
  if (args.idempotencyKey.length === 0 || args.idempotencyKey.length > 200) return { kind: 'refused', code: 'idempotency_key_reused' }
  const command = canonicalDigest({ planRef: plan.planRef, planDigest: plan.planDigest, approvedTotalAudUnits: args.approvedTotalAudUnits })
  const replay = await ctx.db.query('capabilityPlans').withIndex('by_principalId_and_idempotencyKey', q =>
    q.eq('principalId', args.principal.principalId).eq('idempotencyKey', args.idempotencyKey)).take(2)
  if (replay.length > 0) return replay.length === 1 && replay[0]?.planRef === plan.planRef && replay[0].runCommandDigest === command
    ? { kind: 'replayed', planRef: plan.planRef } : { kind: 'refused', code: 'idempotency_key_reused' }
  if (plan.idempotencyKey !== undefined || plan.state !== 'quoted') return { kind: 'refused', code: 'idempotency_key_reused' }
  const now = Date.now()
  if (plan.expiresAt <= now) return { kind: 'refused', code: 'plan_quote_expired' }
  if (args.principal.credentialId !== plan.credentialId || args.principal.authorityMode !== plan.authorityMode) return { kind: 'refused', code: 'grant_changed' }
  const valid = await validateRunPlan(ctx, plan, now)
  if (valid.kind === 'refused') return valid
  const approval = valid.principal.authorityMode === 'approval_required'
  const runDeadlineAt = Math.min(now + 30 * 60_000, valid.grantExpiresAt)
  await ctx.db.patch(plan._id, {
    idempotencyKey: args.idempotencyKey, runCommandDigest: command, maximumConcurrentNodes: valid.maximumConcurrentNodes,
    state: approval ? 'awaiting_approval' : 'reconciliation_required', runDeadlineAt,
    organizationMonth: new Date(now).toISOString().slice(0, 7), organizationMonthlyExposureUnits: '0', updatedAt: now,
    ...(!approval && plan.grantDigest !== undefined ? { authority: {
      format: 'plan' as const, planRef: plan.planRef, planDigest: plan.planDigest, approvedTotalAudUnits: plan.approvedTotalAudUnits,
      nodeCeilings: plan.nodes.map(node => ({ nodeId: node.nodeId, ceilingAudUnits: node.ceilingAudUnits })),
      grantRef: plan.grantRef, grantGeneration: plan.grantGeneration, grantDigest: plan.grantDigest, expiresAt: runDeadlineAt,
    } } : {}),
  })
  await ctx.scheduler.runAt(approval ? plan.expiresAt : runDeadlineAt, internal.capabilityPlans.deadline, { planRef: plan.planRef })
  if (!approval) await ctx.scheduler.runAfter(10_000, internal.capabilityPlans.continueRun, { planRef: plan.planRef })
  return { kind: approval ? 'awaiting_approval' : 'ready', planRef: plan.planRef }
}

export async function prepareRunHandler(ctx: MutationCtx, args: { planRef: string }): Promise<Infer<typeof prepareRunResult>> {
  const plan = await readPlan(ctx, args.planRef)
  const now = Date.now()
  if (plan === null) return { kind: 'refused', code: 'plan_not_found' }
  if (plan.authority === undefined || plan.terminationIntent !== undefined || plan.runDeadlineAt <= now) return { kind: 'refused', code: 'approval_required' }
  const valid = await validateRunPlan(ctx, plan, now)
  if (valid.kind === 'refused') return valid
  const parsed = parsePlan(JSON.parse(plan.planJson))
  if ('kind' in parsed) return { kind: 'refused', code: 'plan_changed' }
  const first = parsed.nodes.find(node => node.dependsOn.length === 0)
  if (first === undefined) return { kind: 'refused', code: 'plan_changed' }
  const subjects = await prepareFinancialSubjectsCore(ctx, {
    operationKey: `plan:${plan.planRef}`, correlationId: `plan:${plan.planRef}`, principal: valid.principal,
    toolRef: first.toolRef, input: first.input,
  }, plan.approvedTotalAudUnits)
  return { kind: 'prepared', principal: valid.principal, rootToolRef: first.toolRef, subjects }
}
