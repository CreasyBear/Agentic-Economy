import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePlan } from '@/modules/capability-execution/plan/parse'
import { trustedChatAuthorityValue } from '../../chat/turns/contracts'
import { resolveTrustedChatAuthority } from '../callLifecycle/chatCallAuthority'
import type { CallPrincipal } from '../callLifecycle/contracts'
import { authenticatePlanPrincipal, authenticatePlanQuoteResult, planQuoteResultValue, quotePlanCore } from './quotePlan'
import { beginRunCore, beginRunResult, planBelongsTo } from './runAdmission'
import { completeRunAdmission } from './runAction'
import { projectPlan, readPlan, type PlanRunResult } from './planState'
import { readPlanResult } from './planReads'

export const chatPlanQuoteArgs = { authority: trustedChatAuthorityValue, planJson: v.string() }
export const chatPlanRunArgs = { authority: trustedChatAuthorityValue, planRef: v.string(), approvedTotalAudUnits: v.string() }
export const chatPlanReadArgs = { authority: trustedChatAuthorityValue, planRef: v.string() }
type Authority = Infer<typeof trustedChatAuthorityValue>

async function chatPrincipal(ctx: Pick<QueryCtx, 'db'>, authority: Authority, toolRefs: readonly string[]): Promise<CallPrincipal | null> {
  let first: CallPrincipal | null = null
  for (const toolRef of toolRefs) {
    const principal = await resolveTrustedChatAuthority(ctx, authority, toolRef)
    if (principal === null || (first !== null && canonicalDigest(first) !== canonicalDigest(principal))) return null
    first = principal
  }
  return first
}

export async function authenticateChatPlanHandler(ctx: MutationCtx, args: { authority: Authority; planJson: string }): Promise<Infer<typeof authenticatePlanQuoteResult>> {
  let input: unknown
  try { input = JSON.parse(args.planJson) } catch { return { kind: 'refused', code: 'input_schema_mismatch' } }
  const plan = parsePlan(input)
  if ('kind' in plan) return plan
  const principal = await chatPrincipal(ctx, args.authority, plan.nodes.map(node => node.toolRef))
  return principal === null ? { kind: 'refused', code: 'tool_not_admitted' } : authenticatePlanPrincipal(ctx, { principal, planJson: args.planJson })
}

export async function quoteChatPlanHandler(ctx: ActionCtx, args: { authority: Authority; planJson: string }): Promise<Infer<typeof planQuoteResultValue>> {
  const authentication = await ctx.runMutation(internal.chatPlans.authenticateQuote, args)
  if (authentication.kind === 'refused') return authentication
  return quotePlanCore(ctx, args.planJson, authentication, args.authority)
}

/** Requires a live key-backed turn and its own sealed quote. The model supplies neither authority nor a replay key. */
export async function beginChatPlanHandler(ctx: MutationCtx, args: { authority: Authority; planRef: string; approvedTotalAudUnits: string }): Promise<Infer<typeof beginRunResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.chatTurnRef !== args.authority.turnRef) return { kind: 'refused', code: 'plan_access_denied' }
  const principal = await chatPrincipal(ctx, args.authority, plan.nodes.map(node => node.toolRef))
  if (principal === null || !planBelongsTo(plan, principal) || plan.credentialId !== args.authority.credentialLocator) return { kind: 'refused', code: 'plan_access_denied' }
  const idempotencyKey = `chat-plan:${canonicalDigest({ turnRef: args.authority.turnRef, credentialId: args.authority.credentialLocator, planRef: plan.planRef })}`
  return beginRunCore(ctx, { principal, planRef: plan.planRef, approvedTotalAudUnits: args.approvedTotalAudUnits, idempotencyKey })
}

export async function runChatPlanHandler(ctx: ActionCtx, args: { authority: Authority; planRef: string; approvedTotalAudUnits: string }): Promise<PlanRunResult> {
  return completeRunAdmission(ctx, await ctx.runMutation(internal.chatPlans.beginRun, args))
}

export async function getChatPlanHandler(ctx: QueryCtx, args: { authority: Authority; planRef: string }): Promise<Infer<typeof readPlanResult>> {
  const plan = await readPlan(ctx, args.planRef)
  if (plan === null || plan.chatTurnRef !== args.authority.turnRef) return { kind: 'refused', code: 'plan_access_denied' }
  const principal = await chatPrincipal(ctx, args.authority, plan.nodes.map(node => node.toolRef))
  if (principal === null || !planBelongsTo(plan, principal)) return { kind: 'refused', code: 'plan_access_denied' }
  return projectPlan(ctx, plan)
}
