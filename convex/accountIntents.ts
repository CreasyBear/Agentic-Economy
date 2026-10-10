import { v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import { InteractiveAuthorityError } from './interactiveAuthority'
import { emitJourneyEvent, singleLineText } from './lib/journey/events'
import { callerIsAccountOwner, requireAuthenticatedAccountContext } from './lib/principalAccount/workspace/accountContext'

const MAX_INTENT_LENGTH = 500

async function requireOwnerAccountRef(ctx: QueryCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  const { account, canonicalAccountRef, canonicalPrincipalRef } = await requireAuthenticatedAccountContext(ctx.db, identity)
  if (!await callerIsAccountOwner(ctx.db, account, canonicalPrincipalRef)) throw new InteractiveAuthorityError('authority_mismatch')
  return canonicalAccountRef
}

/** Null when the viewer is not the signed-in owner. Text is null until answered and empty when skipped. */
export const readMine = query({
  args: {},
  returns: v.union(v.null(), v.object({ text: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const accountRef = await requireOwnerAccountRef(ctx).catch((error: unknown) => {
      if (error instanceof InteractiveAuthorityError) return null
      throw error
    })
    if (accountRef === null) return null
    const row = await ctx.db.query('accountIntents').withIndex('by_accountRef', q => q.eq('accountRef', accountRef)).unique()
    return { text: row?.text ?? null }
  },
})

export const answer = mutation({
  args: { text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const accountRef = await requireOwnerAccountRef(ctx)
    const text = singleLineText(args.text).slice(0, MAX_INTENT_LENGTH)
    const now = Date.now()
    const existing = await ctx.db.query('accountIntents').withIndex('by_accountRef', q => q.eq('accountRef', accountRef)).unique()
    if (existing === null) await ctx.db.insert('accountIntents', { accountRef, text, createdAt: now, updatedAt: now })
    else await ctx.db.patch(existing._id, { text, updatedAt: now })
    if (text.length > 0) await emitJourneyEvent(ctx, accountRef, 'intent_answered')
    return null
  },
})
