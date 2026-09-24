import { v } from 'convex/values'
import type { MutationCtx } from '../../_generated/server'

export const abortProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  claimRef: v.string(),
} as const

export async function abortProviderConsequenceHandler(
  ctx: MutationCtx,
  args: { ticketRef: string; journalTokenDigest: string; claimRef: string },
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null
    || row.journalTokenDigest !== args.journalTokenDigest
    || row.claimRef !== args.claimRef) return { kind: 'unavailable' as const }
  if (row.state === 'aborted') return { kind: 'aborted' as const }
  if (row.state !== 'started') return { kind: 'unavailable' as const }
  const now = Date.now()
  await ctx.db.patch(row._id, { state: 'aborted', abortedAt: now, updatedAt: now })
  return { kind: 'aborted' as const }
}

export const abortProviderConsequenceResult = v.union(v.object({ kind: v.literal('aborted') }), v.object({ kind: v.literal('unavailable') }))
