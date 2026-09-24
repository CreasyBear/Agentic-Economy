import { v } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'

export const attestProviderConsequenceTicketArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  ticketClaimsDigest: v.string(),
  expiresAt: v.number(),
  signingSecretRef: v.string(),
  signingSecretGeneration: v.string(),
  signingSecretPointerRevision: v.number(),
} as const

export async function attestProviderConsequenceTicketHandler(
  ctx: QueryCtx,
  args: Readonly<{
    ticketRef: string
    journalTokenDigest: string
    ticketClaimsDigest: string
    expiresAt: number
    signingSecretRef: string
    signingSecretGeneration: string
    signingSecretPointerRevision: number
  }>,
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null
    || row.state !== 'pending'
    || row.journalTokenDigest !== args.journalTokenDigest
    || row.ticketClaimsDigest !== args.ticketClaimsDigest
    || row.expiresAt !== args.expiresAt
    || row.expiresAt <= Date.now()
    || row.signingSecretRef !== args.signingSecretRef
    || row.signingSecretGeneration !== args.signingSecretGeneration
    || row.signingSecretPointerRevision !== args.signingSecretPointerRevision) {
    return { kind: 'unavailable' as const }
  }
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', row.signingSecretRef)).unique()
  return pointer !== null
    && pointer.owningAccountRef === row.signingAccountRef
    && pointer.activeGeneration === row.signingSecretGeneration
    && pointer.revision === row.signingSecretPointerRevision
    ? { kind: 'attested' as const }
    : { kind: 'unavailable' as const }
}

export const attestProviderConsequenceTicketResult = v.union(
  v.object({ kind: v.literal('attested') }),
  v.object({ kind: v.literal('unavailable') }),
)
