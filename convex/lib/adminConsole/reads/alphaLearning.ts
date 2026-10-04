import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { CALL_FEEDBACK_RETENTION_MS, callFeedbackValue } from '@/modules/capability-execution/call-feedback'

const sampleLimit = 50
export const alphaLearningValue = v.object({
  kind: v.literal('learning'), asOf: v.number(), from: v.number(), sampleLimit: v.number(),
  truncated: v.boolean(),
  calls: v.array(v.object({ callRef: v.string(), toolRef: v.string(), state: v.union(v.literal('completed'), v.literal('refused'), v.literal('outcome_unknown')),
    latencyMs: v.number(), amountAudUnits: v.union(v.string(), v.null()) })),
  feedback: v.array(v.object({ callRef: v.string(), toolRef: v.string(), feedback: callFeedbackValue, updatedAt: v.number() })),
  selections: v.array(v.object({ outcome: v.union(v.literal('selected'), v.literal('no_match'), v.literal('unavailable'), v.literal('no_selection')),
    latencyMs: v.number(), costAud: v.union(v.number(), v.null()) })),
})

/** Read bounded samples of existing metadata; never hydrate Call payloads or
 * expose arbitrary diagnostic strings. This is a sample, not a global total. */
export async function readAlphaLearning(ctx: QueryCtx, args: { now: number }): Promise<typeof alphaLearningValue.type> {
  if (!Number.isSafeInteger(args.now) || args.now < 0) throw new Error('learning_time_invalid')
  const from = args.now - CALL_FEEDBACK_RETENTION_MS
  const [calls, feedback, selections] = await Promise.all([
    ctx.db.query('capabilityCallProjections').withIndex('by_createdAt', q => q.gte('createdAt', from).lte('createdAt', args.now)).order('desc').take(sampleLimit + 1),
    ctx.db.query('callUsefulnessFeedback').withIndex('by_updatedAt', q => q.gt('updatedAt', from).lte('updatedAt', args.now)).order('desc').take(sampleLimit + 1),
    ctx.db.query('toolSelectionDecisions').withIndex('by_createdAt', q => q.gt('createdAt', from).lte('createdAt', args.now)).order('desc').take(sampleLimit + 1),
  ])
  return { kind: 'learning', asOf: args.now, from, sampleLimit, truncated: [calls, feedback, selections].some(rows => rows.length > sampleLimit),
    calls: calls.slice(0, sampleLimit).map(row => ({ callRef: row.callRef, toolRef: row.toolRef, state: row.state, latencyMs: row.latencyMs, amountAudUnits: row.audAmountUnits ?? null })),
    feedback: feedback.slice(0, sampleLimit).map(row => ({ callRef: row.callRef, toolRef: row.toolRef, feedback: row.feedback, updatedAt: row.updatedAt })),
    selections: selections.slice(0, sampleLimit).map(row => ({ outcome: row.tier === 'selection_unavailable' ? 'unavailable' : row.tier === 'no_match' ? 'no_match'
      : row.pickedToolRef === undefined ? 'no_selection' : 'selected', latencyMs: row.latencyMs, costAud: row.costAud ?? null })),
  }
}
