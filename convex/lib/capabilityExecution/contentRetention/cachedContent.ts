import { expireProcureResultContent, procureQuoteSnapshotSchema, toolProcureResultSchema } from '@/modules/capability-execution/procure'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { CALL_CONTENT_RETENTION_MS, expiredCallForCopy } from './callContent'

/** A cache entry keeps its original identity and digest. Clearing the whole
 * result would turn a retry into a new Quote; expiry must remain replayable. */
export async function expireProcureContent(ctx: MutationCtx, row: Doc<'operationKeys'>, now: number): Promise<boolean> {
  if (row.operationName !== 'tool.procure' || row.scope !== 'capability_execution'
    || row.contentExpiredAt !== undefined || row.resultJson === undefined) return false
  let json: unknown
  try { json = JSON.parse(row.resultJson) } catch { return false }
  const quoteRef = row.effectRefs[0]
  const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  if (quoteRef !== undefined && quote === null) return false
  if (quote === null && row.updatedAt > now - CALL_CONTENT_RETENTION_MS) return false
  if (quote !== null && (quote.contentExpiredAt === undefined || quote.principalId !== row.actorRef)) return false
  const callRef = row.effectRefs[1] ?? quote?.consumedCallRef
  if (callRef !== undefined && !await expiredCallForCopy(ctx, callRef, now)) return false
  const snapshot = procureQuoteSnapshotSchema.safeParse(json)
  if (snapshot.success) {
    if (quote === null || snapshot.data.quoteRef !== quote.quoteRef) return false
    if (!('input' in snapshot.data)) return false
    const { input: _input, endpoint: _endpoint, ...identity } = snapshot.data
    await ctx.db.patch(row._id, { resultJson: JSON.stringify({ ...identity, contentExpiredAt: now }), contentExpiredAt: now })
    return true
  }
  const parsed = toolProcureResultSchema.safeParse(json)
  if (!parsed.success) return false
  const result = parsed.data
  if ('callRef' in result && (callRef === undefined || result.callRef !== callRef)) return false
  const expired = expireProcureResultContent(result, now)
  if (expired === null) return false
  await ctx.db.patch(row._id, { resultJson: JSON.stringify(expired), contentExpiredAt: now })
  return true
}
