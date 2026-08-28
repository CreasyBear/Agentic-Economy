import type { WorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'
import {
  canonicalProviderConnectionProjection,
  beginProviderConnectionRevocation,
  createX402ProviderConnection,
  projectProviderConnectionOwner,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionRevocationRef,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../src/modules/capability-supply/provider-connection'
import { validPublicHttpsEndpoint } from '../../../src/modules/capability-supply/public'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import {
  enqueueCleanupWork,
  installCanonicalProviderConnection,
  invalidateActiveLeases,
  readCanonicalConnectionForProjection,
  shareCanonicalProviderConnection,
  transitionCanonicalProviderConnection,
  toDomain,
  toRow,
} from './lifecycle'
import { lifecycle } from './contracts'
import { resolveBusinessActor } from '../../authz'
import { accountRef, principalRef } from '../../../src/modules/principal-account/public'

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
export const shareOwnerArgs = {
  connectionRef: v.string(),
  granteeAccountRef: v.string(),
  commandId: v.string(),
} as const
export const ownerShareResult = v.union(
  v.object({
    kind: v.literal('shared'),
    shareRef: v.string(),
    connectionRef: v.string(),
    connectionGeneration: v.number(),
    owningAccountRef: v.string(),
    granteeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
  }),
  v.object({ kind: v.literal('refused'), code: v.literal('invalid_transition') }),
)

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
  requireUsable = true,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (row === null) return null
  const business = await ctx.db.get(row.businessId)
  if (business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
    || row.owningAccountRef !== actor.canonicalAccountRef) return null
  const canonical = await readCanonicalConnectionForProjection(ctx, toDomain(row), requireUsable)
  return canonical === null ? null : { row, canonical, actor }
}

async function readOwnedBusiness(
  ctx: Pick<QueryCtx, 'auth' | 'db'>,
  businessId: Id<'businesses'>,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const business = await ctx.db.get(businessId)
  return business !== null && business.owningAccountRef === actor.canonicalAccountRef
    ? { business, actor }
    : null
}

async function reauthorizeOwnerConnection(
  ctx: MutationCtx,
  args: ReauthorizeOwnerArgs,
  now: number,
) {
  const owned = await readOwnedConnection(ctx, args.connectionRef)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const { row, canonical, actor } = owned
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
    const refreshed = await transitionCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(actor.canonicalPrincipalRef), accountRef: accountRef(actor.canonicalAccountRef) },
      commandId: args.commandId,
      connection: canonical,
      operation: 'refresh',
      externalState: { kind: 'known', value: 'ready' },
    })
    if (refreshed === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
    const projected = canonicalProviderConnectionProjection(result.connection, refreshed)
    await ctx.db.replace(row._id, toRow(projected, args.commandId, result.commandDigest))
    await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
    return { ...result, connection: projected }
  }
  return result
}

export async function readOwnerHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const owned = await readOwnedConnection(ctx, args.connectionRef)
  return owned === null ? null : projectOwnerProjection(toDomain(owned.row), owned.row.updatedAt)
}

export async function listOwnerHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (index) => index.eq('owningAccountRef', actor.canonicalAccountRef))
    .take(50)
  const rows = (await Promise.all(businesses.map((business) => (
    Promise.all([
      ...['active', 'reauthorization_required', 'revocation_pending', 'revoked', 'cleanup_required'].map((state) => (
        ctx.db.query('capabilityProviderConnections')
          .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', business._id).eq('lifecycle', state as never))
          .take(100)
      )),
    ])
  )))).flat(2)
  const canonicalRows = await Promise.all(rows.map(async (row) => (
    row.owningAccountRef === actor.canonicalAccountRef
      ? await readCanonicalConnectionForProjection(ctx, toDomain(row), true)
      : null
  )))
  return rows.flatMap((row, index) => canonicalRows[index] === null
    ? []
    : [projectOwnerProjection(toDomain(row), row.updatedAt)])
}

export async function revokeOwnerHandler(ctx: MutationCtx, args: RevokeOwnerArgs) {
  const owned = await readOwnedConnection(ctx, args.connectionRef)
  const now = Date.now()
  const result = beginProviderConnectionRevocation(owned === null ? undefined : toDomain(owned.row), args, now)
  if (result.kind === 'applied' && owned !== null) {
    const { row, canonical, actor } = owned
    const revoked = await transitionCanonicalProviderConnection(ctx, {
      actor: { principalRef: principalRef(actor.canonicalPrincipalRef), accountRef: accountRef(actor.canonicalAccountRef) },
      commandId: args.commandId,
      connection: canonical,
      operation: 'revoke',
      externalState: { kind: 'unknown', value: 'revocation_pending' },
    })
    if (revoked === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
    const projected = canonicalProviderConnectionProjection(result.connection, revoked)
    await ctx.db.replace(row._id, toRow(projected, args.commandId, result.commandDigest))
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
      ...projected,
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
    return projectOwnerResult({ kind: 'applied', connection: canonicalProviderConnectionProjection(scheduled, revoked), commandDigest: result.commandDigest }, now)
  }
  return projectOwnerResult(result, now)
}

async function cleanupWorkIsActive(ctx: MutationCtx, workId: string): Promise<boolean> {
  try {
    const status = await marketDispatchWorkpool.status(ctx, workId as WorkId)
    return ['pending', 'running'].includes(status.state)
  } catch {
    // A missing work item is repairable after the persisted callback grace.
    return false
  }
}

function retryCleanupIsInvalid(
  row: Readonly<{
    lifecycle: string
    cleanupCallbackGraceUntil?: number
  }>,
  commandId: string,
  now: number,
): boolean {
  return [
    commandId.trim().length === 0,
    commandId.length > 256,
    row.lifecycle === 'revoked',
    !['revocation_pending', 'cleanup_required'].includes(row.lifecycle),
    row.cleanupCallbackGraceUntil === undefined,
    row.cleanupCallbackGraceUntil !== undefined && now < row.cleanupCallbackGraceUntil,
  ].some(Boolean)
}

export async function retryOwnerCleanupHandler(ctx: MutationCtx, args: RetryOwnerCleanupArgs) {
  const owned = await readOwnedConnection(ctx, args.connectionRef, false)
  const now = Date.now()
  if (owned === null) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const { row } = owned
  if ([args.commandId.trim().length === 0, args.commandId.length > 256].some(Boolean))
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  if (retryCleanupIsInvalid(row, args.commandId, now))
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  if (row.cleanupWorkId !== undefined && await cleanupWorkIsActive(
    ctx, row.cleanupWorkId,
  )) return {
    kind: 'duplicate' as const,
    connection: projectOwnerProjection(toDomain(row), now),
    commandDigest: cleanupOwnerCommandDigest(args.connectionRef, args.commandId),
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
  const ownedBusiness = await readOwnedBusiness(ctx, args.businessId)
  const resourceUrl = validPublicHttpsEndpoint(args.resourceUrl)
  const now = Date.now()
  if (ownedBusiness === null || resourceUrl === undefined) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  if (![
    ownedBusiness.business.publicStatus === 'published', resourceUrl.hash === '',
  ].every(Boolean)) return { kind: 'refused' as const, code: 'invalid_identity' as const }
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
  if (result.kind === 'refused') return result
  const canonical = await installCanonicalProviderConnection(ctx, {
    actor: {
      principalRef: principalRef(ownedBusiness.actor.canonicalPrincipalRef),
      accountRef: accountRef(ownedBusiness.actor.canonicalAccountRef),
    },
    commandId: args.commandId,
    providerNamespace: 'x402',
    providerLocator: canonicalResourceUrl,
    credentialRef: null,
  })
  if (canonical === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const projected = canonicalProviderConnectionProjection(result.connection, canonical)
  if (result.kind === 'applied') {
    await ctx.db.insert('capabilityProviderConnections', toRow(projected, args.commandId, result.commandDigest))
  }
  return projectOwnerResult({ ...result, connection: projected }, now)
}

export async function shareOwnerHandler(
  ctx: MutationCtx,
  args: Readonly<{ connectionRef: string; granteeAccountRef: string; commandId: string }>,
) {
  const owned = await readOwnedConnection(ctx, args.connectionRef)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  let grantee
  try {
    grantee = accountRef(args.granteeAccountRef)
  } catch {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const share = await shareCanonicalProviderConnection(ctx, {
    actor: {
      principalRef: principalRef(owned.actor.canonicalPrincipalRef),
      accountRef: accountRef(owned.actor.canonicalAccountRef),
    },
    commandId: args.commandId,
    connection: owned.canonical,
    granteeAccountRef: grantee,
  })
  return share === null
    ? { kind: 'refused' as const, code: 'invalid_transition' as const }
    : {
        kind: 'shared' as const,
        shareRef: share.shareRef,
        connectionRef: share.connectionRef,
        connectionGeneration: share.connectionGeneration,
        owningAccountRef: share.owningAccountRef,
        granteeAccountRef: share.granteeAccountRef,
        actorPrincipalRef: share.action.actorPrincipalRef,
        grantRef: share.action.grantRef,
        grantGeneration: share.action.grantGeneration,
      }
}
