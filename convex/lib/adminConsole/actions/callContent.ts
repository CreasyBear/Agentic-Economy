import { v } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { CALL_CONTENT_REVIEW_MS, type CallContentReview } from '@/lib/operator/admin-console/call-content-review'
import type { MutationCtx } from '../../../_generated/server'
import { resolveAdminAuthority } from '../../../authz'
import { adminCommandArgsValue, adminCommandReceiptValue, type AdminCommandWireArgs } from '../commands/contracts'
import { runAdminCommand, type AdminCommandSpec } from '../commands/commandEnvelope'
import { refused } from '../commands/commandEnvelopeSteps'

export const reviewCallContentArgs = adminCommandArgsValue(v.literal('review_call_content'),
  v.object({ callRef: v.string() }), v.union(v.literal('alpha_quality'), v.literal('failure_investigation')))
const receiptValue = adminCommandReceiptValue(v.literal('review_call_content'), v.literal('call_content_reviewed'), v.string())
export const reviewCallContentValue = v.union(
  v.object({ kind: v.literal('command'), receipt: receiptValue }),
  v.object({ kind: v.literal('content'), receipt: v.object({ kind: v.literal('completed'), action: v.literal('review_call_content'),
    code: v.literal('call_content_reviewed'), effectRefs: v.array(v.string()), auditEventRef: v.string(), correlationId: v.string() }),
    callRef: v.string(), expiresAt: v.number(), inputJson: v.optional(v.string()), outputJson: v.optional(v.string()) }),
)

function reviewSpec(ctx: MutationCtx, args: AdminCommandWireArgs<'review_call_content'>): AdminCommandSpec<'review_call_content'> {
  const readCall = async () => args.input.callRef.length > 256 ? null : await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', q => q.eq('callRef', args.input.callRef)).unique()
  return {
    targetType: 'protected_action', targetRef: args.input.callRef, auditEventType: 'admin.call_content_reviewed',
    currentStateDigest: async () => {
      const call = await readCall()
      return call === null ? null : canonicalDigest({ callRef: call.callRef, version: call.updatedAt, contentExpiredAt: call.contentExpiredAt ?? null })
    },
    apply: async () => {
      const call = await readCall()
      if (call === null) return { kind: 'refused', code: 'call_not_found' }
      if (call.contentExpiredAt !== undefined) return { kind: 'refused', code: 'content_expired' }
      return { kind: 'applied', code: 'call_content_reviewed', effectRefs: [call.callRef], beforeState: 'retained', afterState: 'retained' }
    },
  }
}

/** Requires current owner-admin membership, a selected Call, reason and the
 * normal signed MFA command. Ensures an audit containing references only.
 * Content is returned once per request, never persisted in command receipts.
 * Replay rechecks current membership, content expiry and the original 10m
 * window; stale authority or deleted content cannot restore access. */
export async function reviewCallContentHandler(ctx: MutationCtx, args: AdminCommandWireArgs<'review_call_content'>): Promise<CallContentReview> {
  const receipt = await runAdminCommand(ctx, args, reviewSpec(ctx, args))
  if (receipt.kind !== 'completed') return { kind: 'command', receipt }
  const authority = await resolveAdminAuthority(ctx, 'review_call_content')
  if (authority.kind === 'denied') return { kind: 'command', receipt: refused(args, authority.reason) }
  const actorRef = authority.membership.clerkUserId
  const operation = await ctx.db.query('operationKeys').withIndex('by_actor_operation_key', q =>
    q.eq('actorRef', actorRef).eq('operationName', 'admin:review_call_content').eq('key', args.operationKey)).unique()
  const now = Date.now()
  if (operation === null || now < operation.createdAt || now >= operation.createdAt + CALL_CONTENT_REVIEW_MS) {
    return { kind: 'command', receipt: refused(args, 'review_expired') }
  }
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', args.input.callRef)).unique()
  if (call === null) return { kind: 'command', receipt: refused(args, 'call_not_found') }
  if (call.contentExpiredAt !== undefined) return { kind: 'command', receipt: refused(args, 'content_expired') }
  const outputJson = call.result?.kind === 'completed' && 'output' in call.result ? JSON.stringify(call.result.output) : undefined
  return { kind: 'content', receipt, callRef: call.callRef, expiresAt: operation.createdAt + CALL_CONTENT_REVIEW_MS,
    ...(call.inputJson === undefined ? {} : { inputJson: call.inputJson }), ...(outputJson === undefined ? {} : { outputJson }) }
}
