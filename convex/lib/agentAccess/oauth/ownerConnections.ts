import { v, ConvexError, type ObjectType } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import type { AgentConnectionReadback } from '@/modules/agent-access/agent-connection'
import { agentAccessPolicyValue } from '@/modules/agent-access/public'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveBusinessActor } from '../../../authz'
import { authorityMode, environment, refreshFamilyLifecycle } from './shared'
import { revokeRefreshFamilyCore } from './refreshFamilies'

const ownerReconnectCandidate = v.object({
  principalRef: v.string(),
  principalRevision: v.number(),
})
const agentConnectionReadback = v.object({
  connectionRef: v.string(), revision: v.number(), principalRef: v.string(),
  agentDisplayName: v.string(), connectorDisplayName: v.string(), environment,
  state: refreshFamilyLifecycle, authorityMode,
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()), spendingPolicy: agentAccessPolicyValue,
  commercialScopes: v.array(v.string()), connectedAt: v.number(), lastRotatedAt: v.number(),
  accessExpiresAt: v.number(), connectionExpiresAt: v.number(),
  revokedAt: v.optional(v.number()), revocationReason: v.optional(v.string()),
  credentialGeneration: v.number(),
})
const ownerConnectionLifecycleResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    connectionRef: v.string(), principalRef: v.string(), revision: v.number(),
    providerCleanupPending: v.boolean(), correlationRef: v.string(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required'), correlationRef: v.string() }),
)

export const listOwnerConnectionReadbacksArgs = { principalRefs: v.array(v.string()), now: v.number() }
export const listOwnerConnectionReadbacksResult = v.array(agentConnectionReadback)
export async function listOwnerConnectionReadbacksHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof listOwnerConnectionReadbacksArgs>,
) {
  if (args.principalRefs.length > 25) throw new ConvexError('principal_ref_limit_exceeded')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const uniquePrincipalRefs = [...new Set(args.principalRefs)]
  const pages = await Promise.all(uniquePrincipalRefs.map(async (principalRefValue) => await ctx.db
    .query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', principalRefValue))
    .order('desc')
    .take(100)))
  return (await Promise.all(pages.flat().map(async (family) => await projectOwnerConnection(
    ctx,
    family,
    actor.canonicalAccountRef,
    args.now,
  )))).filter((connection): connection is NonNullable<typeof connection> => connection !== undefined)
}

export const listOwnerReconnectCandidatesArgs = { clientId: v.string(), principalRefs: v.array(v.string()), now: v.number() }
export const listOwnerReconnectCandidatesResult = v.array(ownerReconnectCandidate)
export async function listOwnerReconnectCandidatesHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof listOwnerReconnectCandidatesArgs>,
) {
  if (args.principalRefs.length > 25) throw new ConvexError('principal_ref_limit_exceeded')
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const candidates = await Promise.all([...new Set(args.principalRefs)].map(async (principalRefValue) => {
    const [principal, admission, families] = await Promise.all([
      ctx.db.query('principals')
        .withIndex('by_principalRef', (index) => index.eq('principalRef', principalRefValue))
        .unique(),
      ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (index) => index.eq('principalId', principalRefValue))
        .unique(),
      ctx.db.query('agentAccessOAuthRefreshFamilies')
        .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', principalRefValue))
        .take(100),
    ])
    if (principal === null || principal.kind !== 'agent' || principal.lifecycle !== 'active'
      || admission === null || admission.ownerId !== actor.canonicalAccountRef || admission.lifecycle !== 'active') return []
    const reconnectable = families.filter((family) => (
      family.ownerId === actor.canonicalAccountRef
      && family.clientId === args.clientId
      && (family.lifecycle !== 'active' || family.expiresAt <= args.now)
    ))
    return reconnectable.map(() => ({ principalRef: principal.principalRef, principalRevision: principal.revision }))
  }))
  return candidates.flat()
}

export const listOwnerConnectionHistoryArgs = { principalRef: v.string(), now: v.number(), paginationOpts: paginationOptsValidator }
export const listOwnerConnectionHistoryResult = paginationResultValidator(agentConnectionReadback)
export async function listOwnerConnectionHistoryHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof listOwnerConnectionHistoryArgs>,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { page: [], isDone: true, continueCursor: '' }
  const result = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_principalRef_and_lifecycle', (index) => index.eq('principalRef', args.principalRef))
    .paginate(args.paginationOpts)
  const page = (await Promise.all(result.page.map(async (family) => await projectOwnerConnection(
    ctx,
    family,
    actor.canonicalAccountRef,
    args.now,
  )))).filter((connection): connection is NonNullable<typeof connection> => connection !== undefined)
  return { ...result, page }
}

export const revokeOwnerConnectionArgs = { connectionRef: v.string(), expectedRevision: v.number(), correlationRef: v.string() }
export const revokeOwnerConnectionResult = ownerConnectionLifecycleResult
export async function revokeOwnerConnectionHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof revokeOwnerConnectionArgs>,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  }
  const family = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_familyRef', (index) => index.eq('familyRef', args.connectionRef)).unique()
  if (family === null || family.ownerId !== actor.canonicalAccountRef) {
    return { kind: 'conflict' as const, code: 'connection_not_found' as const, correlationRef: args.correlationRef }
  }
  if (family.lifecycle !== 'active') {
    return {
      kind: 'replayed' as const,
      connectionRef: family.familyRef,
      principalRef: family.principalRef,
      revision: family.revision,
      providerCleanupPending: false,
      correlationRef: args.correlationRef,
    }
  }
  if (family.revision !== args.expectedRevision) {
    return { kind: 'conflict' as const, code: 'connection_revision_conflict' as const, correlationRef: args.correlationRef }
  }
  const revoked = await revokeRefreshFamilyCore(ctx, family, 'owner_revoked', Date.now(), args.correlationRef)
  return {
    kind: 'completed' as const,
    connectionRef: family.familyRef,
    principalRef: family.principalRef,
    revision: family.revision + 1,
    providerCleanupPending: revoked.providerCleanupPending,
    correlationRef: args.correlationRef,
  }
}

async function projectOwnerConnection(
  ctx: QueryCtx,
  family: Doc<'agentAccessOAuthRefreshFamilies'>,
  ownerAccountRef: string,
  now: number,
) {
  if (family.ownerId !== ownerAccountRef) return undefined
  const [principal, client] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (index) => index.eq('principalRef', family.principalRef))
      .unique(),
    ctx.db.query('agentAccessOAuthClients')
      .withIndex('by_clientId', (index) => index.eq('clientId', family.clientId))
      .unique(),
  ])
  if (principal === null || principal.kind !== 'agent' || client === null) return undefined
  const state = family.lifecycle === 'active' && family.expiresAt <= now ? 'expired' as const : family.lifecycle
  return {
    connectionRef: family.familyRef,
    revision: family.revision,
    principalRef: family.principalRef,
    agentDisplayName: principal.displayName,
    connectorDisplayName: client.clientName,
    environment: family.environment,
    state,
    authorityMode: family.authorityMode,
    toolAccess: family.toolAccess,
    toolRefs: family.toolRefs,
    spendingPolicy: family.spendingPolicy,
    commercialScopes: family.scopes.filter((scope) => scope !== 'offline_access'),
    connectedAt: family.createdAt,
    lastRotatedAt: family.updatedAt,
    accessExpiresAt: family.currentAccessExpiresAt,
    connectionExpiresAt: family.expiresAt,
    ...(family.revokedAt === undefined ? {} : { revokedAt: family.revokedAt }),
    ...(family.revocationReason === undefined ? {} : { revocationReason: family.revocationReason }),
    credentialGeneration: family.currentGeneration,
  } satisfies AgentConnectionReadback
}
