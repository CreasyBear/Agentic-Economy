import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'

const agentPrincipalArgs = {
  principalId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  seenAt: v.number(),
}
const agentPrincipalResult = v.union(
  v.object({ kind: v.literal('recorded') }),
  v.object({ kind: v.literal('conflict') }),
)

type AgentPrincipalWrite = Readonly<{
  principalId: string
  ownerId: string
  ownerTokenIdentifier?: string
  credentialId: string
  scopes: readonly string[]
  seenAt: number
}>

async function writeAgentPrincipal(ctx: Pick<MutationCtx, 'db'>, args: AgentPrincipalWrite): Promise<{ kind: 'recorded' } | { kind: 'conflict' }> {
  const existing = await ctx.db.query('customerRequestAgentPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
  const scopes = uniqueSorted(args.scopes)
  if (existing !== null) {
    if (existing.credentialId !== args.credentialId || existing.ownerId !== args.ownerId
      || (existing.ownerTokenIdentifier !== undefined
        && args.ownerTokenIdentifier !== undefined
        && existing.ownerTokenIdentifier !== args.ownerTokenIdentifier)) return { kind: 'conflict' as const }
    await ctx.db.patch(existing._id, {
      scopes,
      lastSeenAt: args.seenAt,
      ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    })
    return { kind: 'recorded' as const }
  }
  const credential = await ctx.db.query('customerRequestAgentPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', args.credentialId)).unique()
  if (credential !== null) return { kind: 'conflict' as const }
  await ctx.db.insert('customerRequestAgentPrincipals', {
    principalId: args.principalId,
    ownerId: args.ownerId,
    credentialId: args.credentialId,
    ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    scopes,
    recordedAt: args.seenAt,
    lastSeenAt: args.seenAt,
  })
  return { kind: 'recorded' as const }
}

export const recordAgentPrincipal = internalMutation({
  args: {
    ...agentPrincipalArgs,
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
  },
  returns: agentPrincipalResult,
  handler: async (ctx, args) => await writeAgentPrincipal(ctx, args),
})

export const registerAgentPrincipal = mutationGeneric({
  args: agentPrincipalArgs,
  returns: v.union(
    agentPrincipalResult,
    v.object({ kind: v.literal('refused'), code: v.literal('authentication_required') }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null || identity.subject.trim().length === 0) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    return await writeAgentPrincipal(ctx, {
      ...args,
      ownerId: identity.subject,
      ownerTokenIdentifier: identity.tokenIdentifier,
    })
  },
})

export const getAgentPrincipal = internalQuery({
  args: { principalId: v.string() },
  returns: v.union(v.object({
    principalId: v.string(), ownerId: v.string(), ownerTokenIdentifier: v.optional(v.string()),
    credentialId: v.string(), scopes: v.array(v.string()),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    return row === null ? null : {
      principalId: row.principalId, ownerId: row.ownerId,
      ...(row.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: row.ownerTokenIdentifier }),
      credentialId: row.credentialId, scopes: row.scopes,
    }
  },
})

export const listStandingCredentials = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(v.object({
    credentialId: v.string(),
    lastSeenAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('customerRequestAgentPrincipals')
      .withIndex('by_ownerId_and_lastSeenAt', (query) => query.eq('ownerId', args.ownerId))
      .order('desc')
      .take(64)
    return rows
      .filter((row) => (
        row.scopes.includes('customer_requests:standing_authority')
      ))
      .map((row) => ({ credentialId: row.credentialId, lastSeenAt: row.lastSeenAt }))
  },
})
