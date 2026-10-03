import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { callValue, validCallHistoryPeriod } from './contracts'

export const listOwnerCallsArgs = {
  principalRef: v.optional(v.string()),
  periodStartAt: v.optional(v.number()),
  periodEndAt: v.optional(v.number()),
  paginationOpts: paginationOptsValidator,
}
export const listOwnerCallsResult = paginationResultValidator(callValue)

/** Requires an authenticated owner and either no range or one bounded UTC range.
 * Ensures every page uses the same Account, exact Agent and [start, end) index range.
 * Invariant: the client never supplies Account authority; native cursors remain opaque.
 * On violation reject before reading; a page is never represented as a complete total. */
export async function listOwnerCallsHandler(ctx: QueryCtx, args: ObjectType<typeof listOwnerCallsArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
    throw new Error('call_history_page_size_invalid')
  }
  const principalRef = args.principalRef
  if (principalRef !== undefined && (principalRef.length === 0 || principalRef.length > 500)) {
    throw new Error('usage_dimension_invalid')
  }
  const { periodStartAt, periodEndAt } = args
  if ((periodStartAt !== undefined || periodEndAt !== undefined)
    && (periodStartAt === undefined || periodEndAt === undefined || !validCallHistoryPeriod(periodStartAt, periodEndAt))) {
    throw new Error('usage_period_invalid')
  }
  const rows = principalRef === undefined
    ? ctx.db.query('capabilityCallProjections')
        .withIndex('by_accountRef_and_createdAt', (index) => {
          const account = index.eq('accountRef', actor.canonicalAccountRef)
          return periodStartAt === undefined || periodEndAt === undefined
            ? account : account.gte('createdAt', periodStartAt).lt('createdAt', periodEndAt)
        })
    : ctx.db.query('capabilityCallProjections')
        .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => {
          const agent = index.eq('accountRef', actor.canonicalAccountRef).eq('principalRef', principalRef)
          return periodStartAt === undefined || periodEndAt === undefined
            ? agent : agent.gte('createdAt', periodStartAt).lt('createdAt', periodEndAt)
        })
  const page = await rows.order('desc').paginate(args.paginationOpts)
  return {
    ...page,
    page: page.page.map(({ _id, _creationTime, ...call }) => call),
  }
}
