import { v } from 'convex/values'
import { mutation, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { uniqueSorted } from '@/modules/common/unique-sorted'

import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'

const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
const agentPrincipalArgs = {
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
  grantGeneration: v.number(),
  policyDigest: v.string(),
  lifecycle,
  expiresAt: v.optional(v.number()),
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
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  grantGeneration: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt?: number
  seenAt: number
}>

async function writeAgentPrincipal(ctx: Pick<MutationCtx, 'db'>, args: AgentPrincipalWrite): Promise<{ kind: 'recorded' } | { kind: 'conflict' }> {
  const existing = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
  const scopes = uniqueSorted(args.scopes)
  if (existing !== null) {
    if (existing.credentialId !== args.credentialId || existing.ownerId !== args.ownerId
      || existing.applicationRef !== args.applicationRef || existing.environment !== args.environment
      || (existing.ownerTokenIdentifier !== undefined
        && args.ownerTokenIdentifier !== undefined
        && existing.ownerTokenIdentifier !== args.ownerTokenIdentifier)) return { kind: 'conflict' as const }
    await ctx.db.patch(existing._id, {
      scopes,
      authorityMode: args.authorityMode,
      grantGeneration: args.grantGeneration,
      policyDigest: args.policyDigest,
      lifecycle: args.lifecycle,
      ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
      lastSeenAt: args.seenAt,
      ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
    })
    return { kind: 'recorded' as const }
  }
  const credential = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', args.credentialId)).unique()
  if (credential !== null) return { kind: 'conflict' as const }
  await ctx.db.insert('agentAccessPrincipals', {
    principalId: args.principalId,
    ownerId: args.ownerId,
    credentialId: args.credentialId,
    applicationRef: args.applicationRef,
    environment: args.environment,
    scopes,
    authorityMode: args.authorityMode,
    grantGeneration: args.grantGeneration,
    policyDigest: args.policyDigest,
    lifecycle: args.lifecycle,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: args.ownerTokenIdentifier }),
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

export const registerAgentPrincipal = mutation({
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
const resolvedAgentPrincipal = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})

export const resolveAgentPrincipal = mutation({
  args: {
    principalId: v.string(),
    ownerId: v.string(),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment,
    scopes: v.array(v.string()),
    authorityMode,
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: v.union(resolvedAgentPrincipal, v.null()),
  handler: async (ctx: MutationCtx, args) => {
    const admitted = await requireSourceWrite(ctx, args, 'agent_identity')
    if (admitted.kind === 'rejected') {
      throw new Error(`agent_access_principal_source_write_rejected:${admitted.reason}`)
    }
    const principal = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    if (principal === null
      || principal.ownerId !== args.ownerId
      || principal.credentialId !== args.credentialId
      || principal.applicationRef !== args.applicationRef
      || principal.environment !== args.environment
      || principal.authorityMode !== args.authorityMode
      || principal.lifecycle !== 'active'
      || (principal.expiresAt !== undefined && principal.expiresAt <= Date.now())
      || args.scopes.some((scope) => !principal.scopes.includes(scope))) return null

    const grant = (await ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => (
        query.eq('credentialId', args.credentialId).eq('environment', args.environment).eq('lifecycle', 'active')
      ))
      .take(8))
      .find((candidate) => candidate.principalId === args.principalId
        && candidate.ownerId === args.ownerId
        && candidate.applicationRef === args.applicationRef
        && candidate.generation === principal.grantGeneration
        && candidate.policyDigest === principal.policyDigest
        && candidate.authorityMode === principal.authorityMode
        && candidate.operationAccess === 'all_admitted'
        && candidate.expiresAt > Date.now())
    if (grant === undefined) return null
    return {
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
      scopes: principal.scopes,
      authorityMode: principal.authorityMode,
    }
  },
})

export const getAgentPrincipal = internalQuery({
  args: { principalId: v.string() },
  returns: v.union(v.object({
    principalId: v.string(),
    ownerId: v.string(),
    ownerTokenIdentifier: v.optional(v.string()),
    credentialId: v.string(),
    applicationRef: v.string(),
    environment,
    scopes: v.array(v.string()),
    authorityMode,
    grantGeneration: v.number(),
    policyDigest: v.string(),
    lifecycle,
    expiresAt: v.optional(v.number()),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalId)).unique()
    return row === null ? null : {
      principalId: row.principalId,
      ownerId: row.ownerId,
      ...(row.ownerTokenIdentifier === undefined ? {} : { ownerTokenIdentifier: row.ownerTokenIdentifier }),
      credentialId: row.credentialId,
      applicationRef: row.applicationRef,
      environment: row.environment,
      scopes: row.scopes,
      authorityMode: row.authorityMode,
      grantGeneration: row.grantGeneration,
      policyDigest: row.policyDigest,
      lifecycle: row.lifecycle,
      ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
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
    const rows = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lastSeenAt', (query) => query.eq('ownerId', args.ownerId))
      .order('desc')
      .take(64)
    return rows
      .filter((row) => row.scopes.includes('customer_requests:standing_authority'))
      .map((row) => ({ credentialId: row.credentialId, lastSeenAt: row.lastSeenAt }))
  },
})
