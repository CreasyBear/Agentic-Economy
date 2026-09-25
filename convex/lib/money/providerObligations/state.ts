import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { ProviderReversalResult } from './contracts'

export function reversalRefused(code: string): ProviderReversalResult {
  return { kind: 'refused', code, retryable: false }
}

export async function readObligation(ctx: MutationCtx, obligationRef: string) {
  return await ctx.db.query('moneyProviderObligations')
    .withIndex('by_obligationRef', (index) => index.eq('obligationRef', obligationRef))
    .unique()
}

export async function markProviderObligationDisputed(
  ctx: MutationCtx,
  row: Doc<'moneyProviderObligations'>,
  args: Readonly<{ evidenceRef: string }>,
): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'disputed',
    evidenceRefs: [...new Set([...row.evidenceRefs, args.evidenceRef])].slice(-32),
    updatedAt: Date.now(),
  })
  const call = await ctx.db.query('capabilityCallProjections')
    .withIndex('by_callRef', (index) => index.eq('callRef', row.callRef))
    .unique()
  if (call !== null) await ctx.db.patch(call._id, {
    providerObligationState: 'disputed',
    updatedAt: Date.now(),
  })
}
