import { v } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

import { refused } from './contracts'

export const readBalanceSubjectArgs = {}

export const readBalanceSubjectResult = v.union(
  v.object({ kind: v.literal('resolved'), accountRef: v.string(), locked: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.string(), retryable: v.boolean() }),
)

export async function readBalanceSubjectHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return refused('billing_identity_missing')
  const openCase = await ctx.db.query('moneyReconciliationCases')
    .withIndex('by_scopeType_and_scopeRef_and_status', (builder) => builder
      .eq('scopeType', 'account')
      .eq('scopeRef', actor.canonicalAccountRef)
      .eq('status', 'open'))
    .first()
  return {
    kind: 'resolved' as const,
    accountRef: actor.canonicalAccountRef,
    locked: openCase !== null,
  }
}
