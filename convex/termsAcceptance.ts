import { ConvexError, v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { TERMS_VERSION } from '@/modules/principal-account/public'

/** Clickwrap: acceptance is an explicit act stored with the version and time. */
export const read = query({
  args: {},
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { accepted: false }
    const rows = await ctx.db.query('termsAcceptances')
      .withIndex('by_principalRef', q => q.eq('principalRef', actor.canonicalPrincipalRef)).collect()
    return { accepted: rows.some(row => row.termsVersion === TERMS_VERSION) }
  },
})

export const accept = mutation({
  args: { termsVersion: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.termsVersion !== TERMS_VERSION) throw new ConvexError({ code: 'terms_version_stale' })
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new ConvexError({ code: 'authentication_required' })
    const existing = await ctx.db.query('termsAcceptances')
      .withIndex('by_principalRef', q => q.eq('principalRef', actor.canonicalPrincipalRef)).collect()
    if (existing.some(row => row.termsVersion === TERMS_VERSION)) return null
    await ctx.db.insert('termsAcceptances', {
      principalRef: actor.canonicalPrincipalRef, termsVersion: TERMS_VERSION, acceptedAt: Date.now(),
    })
    return null
  },
})
