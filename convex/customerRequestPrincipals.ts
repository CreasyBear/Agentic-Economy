import { v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'

export const recordAgentPrincipal = internalMutation({
  args: {
    principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()), seenAt: v.number(),
  },
  returns: v.union(v.object({ kind: v.literal('recorded') }), v.object({ kind: v.literal('conflict') })),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    const scopes = [...new Set(args.scopes)].sort()
    if (existing !== null) {
      if (existing.credentialId !== args.credentialId || existing.ownerId !== args.ownerId) return { kind: 'conflict' as const }
      await ctx.db.patch(existing._id, { scopes, lastSeenAt: args.seenAt })
      return { kind: 'recorded' as const }
    }
    const credential = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_credentialId', (query) => query.eq('credentialId', args.credentialId)).unique()
    if (credential !== null) return { kind: 'conflict' as const }
    await ctx.db.insert('customerRequestAgentPrincipals', {
      principalId: args.principalId, ownerId: args.ownerId, credentialId: args.credentialId,
      scopes, recordedAt: args.seenAt, lastSeenAt: args.seenAt,
    })
    return { kind: 'recorded' as const }
  },
})

export const getAgentPrincipal = internalQuery({
  args: { principalId: v.string() },
  returns: v.union(v.object({
    principalId: v.string(), ownerId: v.string(), credentialId: v.string(), scopes: v.array(v.string()),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    return row === null ? null : {
      principalId: row.principalId, ownerId: row.ownerId, credentialId: row.credentialId, scopes: row.scopes,
    }
  },
})
