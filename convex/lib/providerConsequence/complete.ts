import { v } from 'convex/values'
import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import type { MutationCtx } from '../../_generated/server'

export const completeProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  claimRef: v.string(),
  observationJson: v.string(),
} as const

export async function completeProviderConsequenceHandler(
  ctx: MutationCtx,
  args: { ticketRef: string; journalTokenDigest: string; claimRef: string; observationJson: string },
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null
    || row.journalTokenDigest !== args.journalTokenDigest
    || row.claimRef !== args.claimRef) return { kind: 'unavailable' as const }
  const observation = parseRouteTransportObservationJson(args.observationJson)
  if (observation === undefined || observation.requestDigest !== row.requestDigest) {
    return { kind: 'unavailable' as const }
  }
  const observationJson = stableStringify(observation as StableHashValue)
  const observationDigest = canonicalDigest(observation as StableHashValue)
  if (row.state === 'completed') {
    return row.observationDigest === observationDigest && row.observationJson === observationJson
      ? { kind: 'completed' as const }
      : { kind: 'unavailable' as const }
  }
  if (row.state !== 'started') return { kind: 'unavailable' as const }
  const now = Date.now()
  await ctx.db.patch(row._id, {
    state: 'completed', observationJson, observationDigest, completedAt: now, updatedAt: now,
  })
  return { kind: 'completed' as const }
}

export const completeProviderConsequenceResult = v.union(v.object({ kind: v.literal('completed') }), v.object({ kind: v.literal('unavailable') }))
