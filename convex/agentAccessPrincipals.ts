import { v, type Infer } from 'convex/values'
import { mutation, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from './lib/canonicalAgentAuthority'


const environment = v.union(v.literal('sandbox'), v.literal('production'))
const authorityMode = v.union(v.literal('inspect_only'), v.literal('approve_each'), v.literal('bounded_mandate'), v.literal('full_yolo'))
const lifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))
export const agentAccessPrincipalValue = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  scopes: v.array(v.string()),
  authorityMode,
})
export type AgentAccessPrincipalValue = Infer<typeof agentAccessPrincipalValue>
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
  if (args.environment === 'production' && args.authorityMode === 'full_yolo') return { kind: 'conflict' as const }
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
export type AgentSupplyPrincipalAdmission =
  | Readonly<{ kind: 'allowed'; grantRef: string; ownerId: string; principalId: string }>
  | Readonly<{ kind: 'refused'; reason: 'authorization_denied' }>

export async function verifySupplyAgentPrincipal(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  principal: AgentAccessPrincipalValue,
  requireMandate = false,
): Promise<AgentSupplyPrincipalAdmission> {
  if (!principal.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    || (principal.environment === 'production' && principal.authorityMode === 'full_yolo')
    || (requireMandate && principal.authorityMode !== 'bounded_mandate' && principal.authorityMode !== 'full_yolo')) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const stored = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', principal.principalId)).unique()
  if (stored === null
    || stored.ownerId !== principal.ownerId
    || stored.credentialId !== principal.credentialId
    || stored.applicationRef !== principal.applicationRef
    || stored.environment !== principal.environment
    || stored.authorityMode !== principal.authorityMode
    || stored.lifecycle !== 'active'
    || (stored.expiresAt !== undefined && stored.expiresAt <= Date.now())
    || !stored.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
    || principal.scopes.some((scope) => !stored.scopes.includes(scope))) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => (
      query.eq('credentialId', principal.credentialId)
        .eq('environment', principal.environment)
        .eq('lifecycle', 'active')
    ))
    .take(8)
  const grant = grants.find((candidate) => candidate.principalId === stored.principalId
    && candidate.ownerId === stored.ownerId
    && candidate.credentialId === stored.credentialId
    && candidate.applicationRef === stored.applicationRef
    && candidate.authorityMode === stored.authorityMode
    && candidate.operationAccess === 'all_admitted'
    && candidate.generation === stored.grantGeneration
    && candidate.policyDigest === stored.policyDigest
    && candidate.expiresAt > Date.now())
  return grant === undefined
    ? { kind: 'refused', reason: 'authorization_denied' }
    : {
        kind: 'allowed',
        grantRef: grant.grantRef,
        ownerId: stored.ownerId,
        principalId: stored.principalId,
      }
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
    const now = Date.now()
    if (identity === null || identity.tokenIdentifier.trim().length === 0) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const canonical = await resolveCanonicalAgentContext(ctx, identity.tokenIdentifier, now)
    if (canonical === null) {
      return { kind: 'refused' as const, code: 'authentication_required' as const }
    }
    const [sandboxGrants, productionGrants] = await Promise.all([
      ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
          .eq('credentialId', canonical.credentialLocator)
          .eq('environment', 'sandbox')
          .eq('lifecycle', 'active'))
        .take(2),
      ctx.db.query('agentAccessGrants')
        .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
          .eq('credentialId', canonical.credentialLocator)
          .eq('environment', 'production')
          .eq('lifecycle', 'active'))
        .take(2),
    ])
    const grants = [...sandboxGrants, ...productionGrants]
    if (grants.length !== 1) return { kind: 'conflict' as const }
    const grant = grants[0]!
    const delegation = await ctx.db.query('authorityDelegationGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', grant.grantRef))
      .take(2)
    if (delegation.length !== 1) return { kind: 'conflict' as const }
    const liveDelegation = await validateCanonicalAgentDelegation(ctx, {
      evidenceKind: 'agent-principal-registration',
      evidenceRef: identity.tokenIdentifier,
      principalRef: canonical.principalRef,
      accountRef: canonical.accountRef,
      grantRef: grant.grantRef,
      grantGeneration: grant.generation,
      requiredScopes: delegation[0]!.scopes,
      resourceRefs: delegation[0]!.resourceRefs,
      now,
    })
    const expectedScopes = uniqueSorted(args.scopes)
    if (liveDelegation === null
      || args.principalId !== canonical.principalRef
      || args.credentialId !== canonical.credentialLocator
      || args.applicationRef !== grant.applicationRef
      || args.environment !== grant.environment
      || args.authorityMode !== grant.authorityMode
      || args.grantGeneration !== grant.generation
      || args.policyDigest !== grant.policyDigest
      || args.lifecycle !== grant.lifecycle
      || args.expiresAt !== grant.expiresAt
      || grant.principalId !== canonical.principalRef
      || grant.ownerId !== canonical.accountRef
      || grant.credentialId !== canonical.credentialLocator
      || grant.expiresAt > canonical.credentialExpiresAt
      || expectedScopes.length !== liveDelegation.scopes.length
      || expectedScopes.some((scope, index) => scope !== liveDelegation.scopes[index])) {
      return { kind: 'conflict' as const }
    }
    return await writeAgentPrincipal(ctx, {
      principalId: canonical.principalRef,
      ownerId: canonical.accountRef,
      credentialId: canonical.credentialLocator,
      applicationRef: grant.applicationRef,
      environment: grant.environment,
      scopes: liveDelegation.scopes,
      authorityMode: grant.authorityMode,
      grantGeneration: grant.generation,
      policyDigest: grant.policyDigest,
      lifecycle: grant.lifecycle,
      expiresAt: grant.expiresAt,
      seenAt: now,
      ownerTokenIdentifier: identity.tokenIdentifier,
    })
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
    return row === null || (row.environment === 'production' && row.authorityMode === 'full_yolo') ? null : {
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
