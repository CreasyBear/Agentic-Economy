import { mutation } from './_generated/server'
import { v } from 'convex/values'
import { attributionTouchValue } from '../src/modules/principal-account/account/convex-schema'
import { resolveBusinessActor } from './authz'

/** Records acquisition touches on the viewer's account: first touch is write-once, last touch always follows the latest. */
export const recordAttribution = mutation({
  args: { firstTouch: v.optional(attributionTouchValue), lastTouch: v.optional(attributionTouchValue) },
  returns: v.null(),
  handler: async (ctx, { firstTouch, lastTouch }) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', actor.canonicalAccountRef))
      .unique()
    if (account === null) return null
    const patch = {
      ...(firstTouch !== undefined && account.firstTouch === undefined ? { firstTouch } : {}),
      ...(lastTouch !== undefined ? { lastTouch } : {}),
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(account._id, patch)
    return null
  },
})
