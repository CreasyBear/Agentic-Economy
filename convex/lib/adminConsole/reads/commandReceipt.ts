import { v } from 'convex/values'
import type { AdminCommandAction, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import type { QueryCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { ADMIN_OPAQUE_REF_PATTERN, adminCommandReceiptValue } from '../commands/contracts'
import { parseAdminOperationReceipt } from '../commands/idempotency'

const actionValue = v.union(
  v.literal('review_call_content'), v.literal('set_business_suppression'),
  v.literal('close_removal_dispute'), v.literal('grant_admin_membership'),
  v.literal('revoke_admin_membership'), v.literal('verify_capability_source_authority'),
  v.literal('change_commercial_policy'), v.literal('grant_promotional_credit'),
  v.literal('issue_trial'), v.literal('set_payments_paused'), v.literal('set_payments_audience'), v.literal('change_treasury_thresholds'),
)
const successValue = v.union(
  v.literal('call_content_reviewed'), v.literal('payments_paused'), v.literal('payments_resumed'), v.literal('payments_audience_changed'),
  v.literal('treasury_thresholds_changed'), v.literal('business_suppressed'), v.literal('business_unsuppressed'),
  v.literal('dispute_closed'), v.literal('membership_granted'), v.literal('membership_revoked'),
  v.literal('source_authority_verified'), v.literal('source_authority_insufficient'),
  v.literal('commercial_policy_changed'), v.literal('promotional_credit_granted'), v.literal('trial_approved'),
)
export const readAdminCommandReceiptArgs = {
  action: actionValue, operationKey: v.string(), correlationId: v.string(),
}
export const readAdminCommandReceiptResult = v.union(
  v.object({ kind: v.literal('recorded'), receipt: adminCommandReceiptValue(actionValue, successValue, v.string()) }),
  v.object({ kind: v.literal('unrecorded') }),
  v.object({ kind: v.literal('unavailable') }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)
type Observation =
  | { kind: 'recorded'; receipt: AdminCommandReceipt<AdminCommandAction> }
  | { kind: 'unrecorded' | 'unavailable' }
  | { kind: 'refused'; code: string }

/** Derives actor from current authority; never accepts one from browser storage.
 * Returns the integrity-checked original receipt only, never command terms or Call content. */
export async function readAdminCommandReceiptHandler(
  ctx: QueryCtx,
  args: { action: AdminCommandAction; operationKey: string; correlationId: string },
): Promise<Observation> {
  const authority = await resolveAdminAuthority(ctx, ADMIN_ACTION_PERMISSION[args.action])
  if (authority.kind === 'denied') return { kind: 'refused', code: authority.reason }
  if (!ADMIN_OPAQUE_REF_PATTERN.test(args.operationKey) || !ADMIN_OPAQUE_REF_PATTERN.test(args.correlationId)) {
    return { kind: 'unavailable' }
  }
  const row = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', query => query
    .eq('actorRef', authority.membership.clerkUserId)
    .eq('operationName', `admin:${args.action}`)
    .eq('key', args.operationKey)).unique()
  if (row === null) return { kind: 'unrecorded' }
  if (row.scope !== 'admin_operator' || row.actorKind !== 'admin' || row.resultJson === undefined) return { kind: 'unavailable' }
  try {
    const receipt = parseAdminOperationReceipt(row.resultJson, row.resultHash ?? null, args.action)
    if (receipt.correlationId !== args.correlationId) return { kind: 'unavailable' }
    return { kind: 'recorded', receipt }
  } catch { return { kind: 'unavailable' } }
}
