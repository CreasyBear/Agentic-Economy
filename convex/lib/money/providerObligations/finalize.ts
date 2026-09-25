import { v, type Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { providerReversalResultValue, type ProviderReversalResult } from './contracts'
import { markProviderObligationDisputed, readObligation, reversalRefused } from './state'

export const finalizeOwnerReversalArgs = {
  obligationRef: v.string(),
  callRef: v.string(),
  commandRef: v.string(),
  idempotencyKey: v.string(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  settlementTransactionRef: v.string(),
  reversalTransactionRef: v.string(),
}
export const finalizeOwnerReversalResult = providerReversalResultValue
export async function finalizeOwnerReversalHandler(
  ctx: MutationCtx,
  args: { [K in keyof typeof finalizeOwnerReversalArgs]: Infer<(typeof finalizeOwnerReversalArgs)[K]> },
): Promise<ProviderReversalResult> {
  const row = await readObligation(ctx, args.obligationRef)
  if (row === null
    || row.callRef !== args.callRef
    || row.settlementTransactionRef !== args.settlementTransactionRef) {
    return reversalRefused('provider_obligation_not_found')
  }
  if (row.state === 'reversed') {
    return row.reversalTransactionRef === args.reversalTransactionRef
      && row.reversalCommandRef === args.commandRef
      && row.reversalEvidenceDigest === args.evidenceDigest
      ? { kind: 'replayed', obligationRef: row.obligationRef, transactionRef: args.reversalTransactionRef }
      : reversalRefused('provider_reversal_conflict')
  }
  if (row.state !== 'settled'
    || row.reversalState !== 'pending'
    || row.reversalCommandRef !== args.commandRef
    || row.reversalIdempotencyKey !== args.idempotencyKey
    || row.reversalEvidenceDigest !== args.evidenceDigest) {
    await markProviderObligationDisputed(ctx, row, args)
    return reversalRefused('provider_reversal_conflict')
  }
  const now = Date.now()
  await ctx.db.patch(row._id, {
    state: 'reversed',
    reversalState: 'succeeded',
    reversalTransactionRef: args.reversalTransactionRef,
    evidenceRefs: [...new Set([
      ...row.evidenceRefs,
      args.evidenceRef,
      args.reversalTransactionRef,
    ])].slice(-32),
    reversedAt: now,
    updatedAt: now,
  })
  const call = await ctx.db.query('capabilityCallProjections')
    .withIndex('by_callRef', (index) => index.eq('callRef', row.callRef))
    .unique()
  if (call !== null) await ctx.db.patch(call._id, {
    providerObligationState: 'reversed',
    updatedAt: now,
  })
  return { kind: 'completed', obligationRef: row.obligationRef, transactionRef: args.reversalTransactionRef }
}

export const markOwnerReversalUnknownArgs = {
  obligationRef: v.string(),
  commandRef: v.string(),
  evidenceDigest: v.string(),
  statusRef: v.string(),
}
export const markOwnerReversalUnknownResult = v.null()
export async function markOwnerReversalUnknownHandler(
  ctx: MutationCtx,
  args: { [K in keyof typeof markOwnerReversalUnknownArgs]: Infer<(typeof markOwnerReversalUnknownArgs)[K]> },
) {
  const row = await readObligation(ctx, args.obligationRef)
  if (row !== null
    && row.state === 'settled'
    && row.reversalCommandRef === args.commandRef
    && row.reversalEvidenceDigest === args.evidenceDigest) {
    await ctx.db.patch(row._id, {
      reversalState: 'outcome_unknown',
      reversalStatusRef: args.statusRef,
      updatedAt: Date.now(),
    })
  }
  return null
}
