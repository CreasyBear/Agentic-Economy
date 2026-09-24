import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { callValue } from './contracts'

export const listOwnerCallsArgs = {
  principalRef: v.optional(v.string()),
  paginationOpts: paginationOptsValidator,
}
export const listOwnerCallsResult = paginationResultValidator(callValue)

export async function listOwnerCallsHandler(ctx: QueryCtx, args: ObjectType<typeof listOwnerCallsArgs>) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') throw new Error('call_history_authentication_required')
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
    throw new Error('call_history_page_size_invalid')
  }
  const principalRef = args.principalRef
  const rows = principalRef === undefined
    ? ctx.db.query('capabilityCallProjections')
        .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
    : ctx.db.query('capabilityCallProjections')
        .withIndex('by_accountRef_and_principalRef_and_createdAt', (index) => index
          .eq('accountRef', actor.canonicalAccountRef)
          .eq('principalRef', principalRef))
  const page = await rows.order('desc').paginate(args.paginationOpts)
  return {
    ...page,
    page: page.page.map(({ _id, _creationTime, ...call }) => call),
  }
}
