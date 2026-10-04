import { v } from 'convex/values'
import { CALL_FEEDBACK_RETENTION_MS } from '@/modules/capability-execution/call-feedback'
import { internal } from '../../../_generated/api'
import type { MutationCtx } from '../../../_generated/server'
import { admitWorkloadCron } from '../../platform/workloadCron/admission'
import { expireChatTitles, expireChatTurnContent, expireUnusedChatFiles } from '../../chat/turns/contentRetention'
import { CALL_CONTENT_RETENTION_MS, UNUSED_QUOTE_CONTENT_RETENTION_MS, expireCallContent, expireQuoteContent, expiredCallForCopy } from './callContent'
import { expireProcureContent } from './cachedContent'

const phases = ['calls', 'quotes', 'attempts', 'observations', 'procure', 'chat', 'chatResume', 'titles', 'files', 'learning', 'feedback'] as const
export const contentRetentionArgs = {
  phase: v.optional(v.union(...phases.map(phase => v.literal(phase)))),
  cursor: v.optional(v.union(v.string(), v.null())),
}
type Phase = typeof phases[number]
type Batch = { isDone: boolean; continueCursor: string | null }
export const LEARNING_RETENTION_MS = CALL_FEEDBACK_RETENTION_MS

/** Each bounded transaction re-admits the workload and rechecks finality.
 * A repeated or overlapping sweep cannot create a purchase or restore content.
 * Two primary rows plus their bounded joins fit below Convex's byte limits. */
export async function expireAlphaContentHandler(ctx: MutationCtx, args: {
  phase?: Phase; cursor?: string | null
}): Promise<null> {
  await admitWorkloadCron(ctx, 'expire alpha content')
  const phase = args.phase ?? 'calls'
  const cursor = args.cursor ?? null
  const batch = await expireContentBatch(ctx, phase, cursor, Date.now())
  const next = batch.isDone ? phases[phases.indexOf(phase) + 1] : phase
  if (next !== undefined) await ctx.scheduler.runAfter(0, internal.workloadCron.expireAlphaContent, {
    phase: next, cursor: batch.isDone ? null : batch.continueCursor,
  })
  return null
}

export async function expireContentBatch(ctx: MutationCtx, phase: Phase, cursor: string | null, now: number): Promise<Batch> {
  const page = { cursor, numItems: phase === 'chat' || phase === 'chatResume' ? 1 : 2 }
  const cutoff = now - CALL_CONTENT_RETENTION_MS
  switch (phase) {
    case 'calls': {
      const rows = await ctx.db.query('capabilityCalls').withIndex('by_contentExpiredAt_and_createdAt', q =>
        q.eq('contentExpiredAt', undefined).lte('createdAt', cutoff)).paginate(page)
      for (const row of rows.page) await expireCallContent(ctx, row, now)
      return rows
    }
    case 'quotes': {
      const rows = await ctx.db.query('capabilityQuotes').withIndex('by_contentExpiredAt_and_expiresAt', q =>
        q.eq('contentExpiredAt', undefined).lte('expiresAt', now - UNUSED_QUOTE_CONTENT_RETENTION_MS)).paginate(page)
      for (const row of rows.page) {
        if (row.state !== 'consumed' && row.consumedCallRef === undefined) await expireQuoteContent(ctx, row, now)
      }
      return rows
    }
    case 'attempts': {
      const rows = await ctx.db.query('moneyX402PaymentAttempts').withIndex('by_contentExpiredAt_and_preparedAt', q =>
        q.eq('contentExpiredAt', undefined).lte('preparedAt', cutoff)).paginate(page)
      for (const row of rows.page) {
        if (row.state !== 'observed' || row.settlementStatus === undefined || row.settlementStatus === 'unknown'
          || !await expiredCallForCopy(ctx, row.dispatchRef, now)) continue
        await ctx.db.patch(row._id, { challengeJson: undefined, selectedRequirementJson: undefined,
          providerEndpoint: undefined, quarantinedOutputJson: undefined, contentExpiredAt: now })
      }
      return rows
    }
    case 'observations': {
      const rows = await ctx.db.query('providerConsequenceJournal').withIndex('by_contentExpiredAt_and_issuedAt', q =>
        q.eq('contentExpiredAt', undefined).lte('issuedAt', cutoff)).paginate(page)
      for (const row of rows.page) {
        if (!['completed', 'aborted'].includes(row.state) || !await expiredCallForCopy(ctx, row.callRef, now)) continue
        await ctx.db.patch(row._id, { observationJson: undefined, contentExpiredAt: now })
      }
      return rows
    }
    case 'procure': {
      const rows = await ctx.db.query('operationKeys').withIndex('by_operationName_contentExpiredAt_createdAt', q =>
        q.eq('operationName', 'tool.procure').eq('contentExpiredAt', undefined)
          .lte('createdAt', now - UNUSED_QUOTE_CONTENT_RETENTION_MS)).paginate(page)
      for (const row of rows.page) await expireProcureContent(ctx, row, now)
      return rows
    }
    case 'chat':
    case 'chatResume': {
      const rows = await ctx.db.query('chatTurns').withIndex('by_retentionState_and_updatedAt', q =>
        q.eq('contentRetention.state', phase === 'chat' ? undefined : 'purging').lte('updatedAt', cutoff)).paginate(page)
      for (const row of rows.page) {
        const progressed = await expireChatTurnContent(ctx, row, now)
        const after = progressed ? await ctx.db.get(row._id) : null
        // Stay at the same page until its bounded component deletion finishes.
        if (after?.contentRetention?.state === 'purging' && phase === 'chatResume') {
          return { isDone: false, continueCursor: cursor }
        }
      }
      return rows
    }
    case 'learning': {
      const rows = await ctx.db.query('toolSelectionDecisions').withIndex('by_createdAt', q =>
        q.lte('createdAt', now - LEARNING_RETENTION_MS)).paginate({ cursor, numItems: 100 })
      for (const row of rows.page) await ctx.db.delete(row._id)
      return rows
    }
    case 'files': return await expireUnusedChatFiles(ctx, cursor)
    case 'titles': return await expireChatTitles(ctx, cursor, now)
    case 'feedback': {
      const rows = await ctx.db.query('callUsefulnessFeedback').withIndex('by_expiresAt', q => q.lte('expiresAt', now))
        .paginate({ cursor, numItems: 100 })
      for (const row of rows.page) await ctx.db.delete(row._id)
      return rows
    }
  }
}
