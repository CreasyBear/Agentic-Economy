import { v, type ObjectType } from 'convex/values'
import { callFeedbackValue, CALL_FEEDBACK_RETENTION_MS, type CallFeedbackView } from '@/modules/capability-execution/call-feedback'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { env, type MutationCtx, type QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { sourceWriteArgs } from '../security/sourceWrite/contracts'
import { requireSourceWrite } from '../security/sourceWrite/admission'

export const writeCallFeedbackArgs = { callRef: v.string(), feedback: callFeedbackValue,
  operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs }

async function ownedCall(ctx: QueryCtx | MutationCtx, callRef: string) {
  if (callRef.length < 1 || callRef.length > 256) return null
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique()
  return call?.ownerId === actor.canonicalAccountRef && call.environment === deploymentPaymentEnvironment(env) ? call : null
}

export async function readCallFeedback(ctx: QueryCtx, args: { callRef: string }): Promise<CallFeedbackView> {
  const call = await ownedCall(ctx, args.callRef)
  if (call === null) return { kind: 'refused', code: 'owner_required' }
  if (call.state !== 'completed') return { kind: 'refused', code: 'call_not_eligible' }
  const row = await ctx.db.query('callUsefulnessFeedback').withIndex('by_accountRef_and_callRef', q =>
    q.eq('accountRef', call.ownerId).eq('callRef', call.callRef)).unique()
  return { kind: 'ready', callRef: call.callRef, feedback: row?.feedback ?? null, expiresAt: row?.expiresAt ?? null }
}

/** Requires the current Account owner and a completed Call. Ensures one bounded
 * vote per Account/Call, with identical retries preserving the original expiry.
 * Concurrent updates serialize; no content, audit payload or refund is created.
 * Missing ownership or signed request fails before any feedback write. */
export async function writeCallFeedback(ctx: MutationCtx, args: ObjectType<typeof writeCallFeedbackArgs>): Promise<CallFeedbackView> {
  const call = await ownedCall(ctx, args.callRef)
  if (call === null) return { kind: 'refused', code: 'owner_required' }
  if (call.state !== 'completed') return { kind: 'refused', code: 'call_not_eligible' }
  const admission = await requireSourceWrite(ctx, args, 'protected_action')
  if (admission.kind !== 'accepted') return { kind: 'refused', code: 'source_unavailable' }
  const row = await ctx.db.query('callUsefulnessFeedback').withIndex('by_accountRef_and_callRef', q =>
    q.eq('accountRef', call.ownerId).eq('callRef', call.callRef)).unique()
  const now = Date.now()
  if (row !== null && row.expiresAt > now && canonicalDigest(row.feedback) === canonicalDigest(args.feedback)) {
    return { kind: 'ready', callRef: call.callRef, feedback: row.feedback, expiresAt: row.expiresAt }
  }
  const expiresAt = now + CALL_FEEDBACK_RETENTION_MS
  const fields = { feedback: args.feedback, updatedAt: now, expiresAt }
  if (row === null) await ctx.db.insert('callUsefulnessFeedback', {
    callRef: call.callRef, accountRef: call.ownerId, toolRef: call.toolRef, ...fields, createdAt: now,
  })
  else await ctx.db.patch(row._id, fields)
  return { kind: 'ready', callRef: call.callRef, feedback: args.feedback, expiresAt }
}
