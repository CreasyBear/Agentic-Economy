import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

export const prepareOwnerSpendReadArgs = {
  periodStartAt: v.number(),
  periodEndAt: v.number(),
}
export const prepareOwnerSpendReadResult = v.union(
  v.object({ kind: v.literal('allowed'), accountRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

export async function prepareOwnerSpendReadHandler(ctx: QueryCtx, args: ObjectType<typeof prepareOwnerSpendReadArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'call_history_authentication_required' }
  }
  if (!Number.isSafeInteger(args.periodStartAt)
    || !Number.isSafeInteger(args.periodEndAt)
    || args.periodStartAt < 0
    || args.periodEndAt <= args.periodStartAt
    || args.periodEndAt - args.periodStartAt > 366 * 24 * 60 * 60 * 1_000) {
    return { kind: 'refused' as const, code: 'spend_period_invalid' }
  }
  return { kind: 'allowed' as const, accountRef: actor.canonicalAccountRef }
}
