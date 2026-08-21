import type { WorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'
import {
  beginProviderConnectionRevocation,
  createX402ProviderConnection,
  projectProviderConnectionOwner,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionRevocationRef,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../src/modules/capability-supply/provider-connection'
import { validPublicHttpsEndpoint } from '../src/modules/capability-supply/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import {
  enqueueCleanupWork,
  invalidateActiveLeases,
  lifecycle,
  toDomain,
  toRow,
} from './capabilityProviderConnectionLifecycle'

export const ownerProjection = v.object({
  connectionRef: v.string(),
  businessId: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  available: v.boolean(),
  credentialConfigured: v.boolean(),
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  reasonCode: v.union(v.string(), v.null()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const ownerCommandResult = v.union(
  v.object({ kind: v.literal('applied'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_scope'),
      v.literal('invalid_resource'), v.literal('invalid_generation'), v.literal('invalid_digest'),
      v.literal('invalid_transition'), v.literal('command_identity_conflict'),
    ),
  }),
)

export const readOwnerArgs = {
  connectionRef: v.string(),
} as const
export const listOwnerArgs = {} as const
export const revokeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const retryOwnerCleanupArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
} as const
export const reauthorizeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const connectX402OwnerArgs = {
  businessId: v.id('businesses'),
  resourceUrl: v.string(),
  commandId: v.string(),
  evidenceRefs: v.array(v.string()),
} as const

type ReauthorizeOwnerArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
}

type RevokeOwnerArgs = ReauthorizeOwnerArgs

type RetryOwnerCleanupArgs = {
  connectionRef: string
  commandId: string
}

type ConnectX402OwnerArgs = {
  businessId: Id<'businesses'>
  resourceUrl: string
  commandId: string
  evidenceRefs: string[]
}

function projectOwnerProjection(connection: ProviderConnection, now: number) {
  const projection = projectProviderConnectionOwner(connection, now)
  return {
    ...projection,
    grantedScopes: [...projection.grantedScopes],
    grantedResources: [...projection.grantedResources],
    evidenceRefs: [...projection.evidenceRefs],
  }
}

function projectOwnerResult(result: ProviderConnectionCommandResult, now: number) {
  if (result.kind === 'refused') return result
  const connection = projectOwnerProjection(result.connection, now)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}

function cleanupOwnerCommandDigest(connectionRef: string, commandId: string): string {
  return canonicalDigest({ kind: 'provider_cleanup_owner_retry:v1', connectionRef, commandId })
}

async function readOwnedConnection(
  ctx: Pick<QueryCtx, 'auth' | 'db'>,
  connectionRef: string,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const owner = await ctx.db.query('owners')
    .withIndex('by_clerkUserId', (index) => index.eq('clerkUserId', identity.subject)).unique()
  if (owner === null) return null
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (row === null) return null
  const business = await ctx.db.get(row.businessId)
  return business !== null && business.ownerId === owner._id ? row : null
}

async function readOwnedBusiness(
  ctx: Pick<QueryCtx, 'auth' | 'db'>,
  businessId: Id<'businesses'>,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  const owner = await ctx.db.query('owners')
    .withIndex('by_clerkUserId', (index) => index.eq('clerkUserId', identity.subject)).unique()
  if (owner === null) return null
  const business = await ctx.db.get(businessId)
  return business !== null && business.ownerId === owner._id ? business : null
}

async function reauthorizeOwnerConnection(
  ctx: MutationCtx,
  args: ReauthorizeOwnerArgs,
  now: number,
) {
  const row = await readOwnedConnection(ctx, args.connectionRef)
  if (row === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(row)
  const result = reauthorizeProviderConnection(current, {
    ...current,
    ...args,
    businessId: String(current.businessId),
    credentialRef: current.credentialRef,
    requestedScopes: current.grantedScopes,
    grantedScopes: current.grantedScopes,
    requestedResources: current.grantedResources,
    grantedResources: current.grantedResources,
    ...(current.expiresAt === undefined ? {} : { expiresAt: current.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
  }, now)
  if (result.kind === 'applied') {
    await ctx.db.replace(row._id, toRow(result.connection, args.commandId, result.commandDigest))
    await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  }
  return result
}

export async function readOwnerHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const row = await readOwnedConnection(ctx, args.connectionRef)
  return row === null ? null : projectOwnerProjection(toDomain(row), Date.now())
}

export async function listOwnerHandler(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return []
  const owner = await ctx.db.query('owners')
    .withIndex('by_clerkUserId', (index) => index.eq('clerkUserId', identity.subject)).unique()
  if (owner === null) return []
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owner_updatedAt', (index) => index.eq('ownerId', owner._id)).take(50)
  const rows = (await Promise.all(businesses.map((business) => (
    Promise.all([
      ...['active', 'reauthorization_required', 'revocation_pending', 'revoked', 'cleanup_required'].map((state) => (
        ctx.db.query('capabilityProviderConnections')
          .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', business._id).eq('lifecycle', state as never))
          .take(100)
      )),
    ])
  )))).flat(2)
  return rows.map((row) => projectOwnerProjection(toDomain(row), Date.now()))
}

export async function revokeOwnerHandler(ctx: MutationCtx, args: RevokeOwnerArgs) {
  const row = await readOwnedConnection(ctx, args.connectionRef)
  const now = Date.now()
  const result = beginProviderConnectionRevocation(row === null ? undefined : toDomain(row), args, now)
  if (result.kind === 'applied' && row !== null) {
    await ctx.db.replace(row._id, toRow(result.connection, args.commandId, result.commandDigest))
    const hasMore = await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', now, args.commandId)
    const cleanupAttempt = Math.max(1, result.connection.cleanupAttempt ?? 0)
    const revocationRef = result.connection.revocationRef ?? providerConnectionRevocationRef({
      connectionRef: args.connectionRef,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      adapterId: result.connection.adapterId,
    })
    const cleanupCommandId = providerConnectionCleanupCommandId(revocationRef, cleanupAttempt)
    const requestDigest = providerConnectionCleanupRequestDigest({
      revocationRef,
      cleanupAttempt,
      connectionRef: args.connectionRef,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      adapterId: result.connection.adapterId,
    })
    const scheduled = await enqueueCleanupWork(ctx, row._id, {
      ...result.connection,
      revocationRef,
    }, {
      connectionRef: args.connectionRef,
      commandId: cleanupCommandId,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      requestDigest,
      cleanupAttempt,
      workKind: hasMore ? 'lease_drain' : 'cleanup',
    }, now)
    return projectOwnerResult({ kind: 'applied', connection: scheduled, commandDigest: result.commandDigest }, now)
  }
  return projectOwnerResult(result, now)
}

export async function retryOwnerCleanupHandler(ctx: MutationCtx, args: RetryOwnerCleanupArgs) {
  const row = await readOwnedConnection(ctx, args.connectionRef)
  const now = Date.now()
  if (row === null || args.commandId.trim().length === 0 || args.commandId.length > 256) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  if (row.lifecycle === 'revoked') return { kind: 'refused' as const, code: 'invalid_transition' as const }
  if (row.lifecycle !== 'revocation_pending' && row.lifecycle !== 'cleanup_required') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  if (row.cleanupCallbackGraceUntil === undefined || now < row.cleanupCallbackGraceUntil) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  if (row.cleanupWorkId !== undefined) {
    try {
      const status = await marketDispatchWorkpool.status(ctx, row.cleanupWorkId as WorkId)
      if (status.state === 'pending' || status.state === 'running') {
        return {
          kind: 'duplicate' as const,
          connection: projectOwnerProjection(toDomain(row), now),
          commandDigest: cleanupOwnerCommandDigest(args.connectionRef, args.commandId),
        }
      }
    } catch {
      // A missing work item is repairable after the persisted callback grace.
    }
  }
  const current = toDomain(row)
  const cleanupAttempt = (current.cleanupAttempt ?? 0) + 1
  if (!Number.isSafeInteger(cleanupAttempt)) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const revocationRef = current.revocationRef ?? providerConnectionRevocationRef({
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    adapterId: current.adapterId,
  })
  const cleanupCommandId = providerConnectionCleanupCommandId(revocationRef, cleanupAttempt)
  const requestDigest = providerConnectionCleanupRequestDigest({
    revocationRef,
    cleanupAttempt,
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    adapterId: current.adapterId,
  })
  const hasMore = await invalidateActiveLeases(
    ctx,
    current.connectionRef,
    'revocation_started',
    now,
    `${cleanupCommandId}:retry`,
  )
  const ownerDigest = cleanupOwnerCommandDigest(args.connectionRef, args.commandId)
  const prepared = {
    ...current,
    revocationRef,
    cleanupAttempt,
    cleanupCommandId,
    cleanupRequestDigest: requestDigest,
    lastCommandId: args.commandId,
    lastCommandDigest: ownerDigest,
    updatedAt: now,
  }
  await ctx.db.replace(row._id, toRow(prepared, args.commandId, ownerDigest))
  const scheduled = await enqueueCleanupWork(ctx, row._id, prepared, {
    connectionRef: current.connectionRef,
    commandId: cleanupCommandId,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    requestDigest,
    cleanupAttempt,
    workKind: hasMore ? 'lease_drain' : 'cleanup',
  }, now)
  return projectOwnerResult({ kind: 'applied', connection: scheduled, commandDigest: ownerDigest }, now)
}

export async function reauthorizeOwnerHandler(ctx: MutationCtx, args: ReauthorizeOwnerArgs) {
  return projectOwnerResult(await reauthorizeOwnerConnection(ctx, args, Date.now()), Date.now())
}

export async function connectX402OwnerHandler(ctx: MutationCtx, args: ConnectX402OwnerArgs) {
  const business = await readOwnedBusiness(ctx, args.businessId)
  const resourceUrl = validPublicHttpsEndpoint(args.resourceUrl)
  const now = Date.now()
  if (business === null || business.publicStatus !== 'published' || resourceUrl === undefined || resourceUrl.hash !== '') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const canonicalResourceUrl = resourceUrl.toString()
  const connectionRef = `connection:x402:${canonicalDigest({ businessId: String(args.businessId), resourceUrl: canonicalResourceUrl })}`
  const providerRef = `provider:x402:${resourceUrl.host}`
  const providerAccountRef = `x402:${canonicalResourceUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (existing !== null && String(existing.businessId) !== String(args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const result = createX402ProviderConnection({
    commandId: args.commandId,
    connectionRef,
    businessId: String(args.businessId),
    providerRef,
    providerAccountRef,
    resourceUrl: canonicalResourceUrl,
    evidenceRefs: args.evidenceRefs,
  }, now, existing === null ? undefined : toDomain(existing))
  if (result.kind === 'applied') {
    await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, args.commandId, result.commandDigest))
  }
  return projectOwnerResult(result, now)
}
