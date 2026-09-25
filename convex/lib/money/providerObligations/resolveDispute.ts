import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'

export const resolveDisputeArgs = {
  obligationRef: v.string(),
  evidenceRef: v.string(),
  observedAt: v.number(),
}
export const resolveDisputeResult = v.object({
  kind: v.union(v.literal('settled'), v.literal('replayed')),
  obligationRef: v.string(),
})

type ResolveDisputeArgs = { [K in keyof typeof resolveDisputeArgs]: Infer<(typeof resolveDisputeArgs)[K]> }

export async function resolveDisputeHandler(
  ctx: MutationCtx,
  args: ResolveDisputeArgs,
): Promise<Infer<typeof resolveDisputeResult>> {
  const row = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_obligationRef', (index) => index.eq('obligationRef', args.obligationRef))
    .unique()
  if (row === null) throw new Error('provider_obligation_not_found')
  if (row.state === 'settled') return { kind: 'replayed', obligationRef: row.obligationRef }
  if (row.state !== 'disputed') throw new Error('provider_obligation_dispute_state_invalid')
  await ctx.db.patch(row._id, {
    state: 'settled',
    evidenceRefs: [...row.evidenceRefs, args.evidenceRef].slice(-32),
    updatedAt: args.observedAt,
  })
  const call = await ctx.db.query('capabilityCallProjections')
    .withIndex('by_callRef', (index) => index.eq('callRef', row.callRef))
    .unique()
  if (call !== null) await ctx.db.patch(call._id, {
    providerObligationState: 'settled',
    updatedAt: args.observedAt,
  })
  return { kind: 'settled', obligationRef: row.obligationRef }
}
