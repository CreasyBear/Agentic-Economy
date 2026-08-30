import {
  beginProviderConnectionRevocation,
  createProviderConnection,
  providerConnectionAuthorityProvenanceIsValid,
  providerConnectionRevocationRef,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  withProviderConnectionAuthority,
  type ProviderConnectionAuthorityValidation,
  type ProviderConnectionCredentialResolution,
} from '../../../src/modules/capability-supply/provider-connection'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import {
  type AuthorityCommandArgs,
  type BeginRevocationArgs,
  type ListByBusinessLifecycleArgs,
  type ListByProviderLifecycleArgs,
  type ReadCleanupTargetArgs,
  type ReauthorizeCommandArgs,
  type RecordCleanupResultArgs,
} from './contracts'
import {
  cleanupResourceAuthorityMatches,
  readCurrentCleanupResourceAuthority,
  resolveCanonicalBusinessOwner,
  resolveProviderConnectionProvenance,
} from './authority'
export {
  cleanupResourceAuthorityMatches,
  readCurrentCleanupResourceAuthority,
  resolveCanonicalBusinessOwner,
  resolveProviderConnectionProvenance,
  resolveUniqueProviderConnectionGrant,
  type CanonicalActor,
} from './authority'
export {
  projectCommandResult,
  toDomain,
  toLeaseDomain,
  toLeaseRow,
  toRow,
} from './codecs'
import { projectCommandResult, toDomain, toRow } from './codecs'
export {
  advanceLeaseDrainHandler,
  enqueueCleanupWork,
  invalidateActiveLeases,
} from './cleanup'
import { invalidateActiveLeases } from './cleanup'

function createOptionalFields(args: AuthorityCommandArgs) {
  return Object.fromEntries(Object.entries({
    expiresAt: args.expiresAt,
    reasonCode: args.reasonCode,
  }).filter(([, value]) => value !== undefined))
}

export async function createHandler(ctx: MutationCtx, args: AuthorityCommandArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const now = Date.now()
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (actor === null) return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const provenance = await resolveProviderConnectionProvenance(
    ctx,
    actor,
    'install',
    [
      `connection-provider:capability-provider/${args.adapterId}`,
      `connection-provider:capability-provider/${args.adapterId}:${args.providerAccountRef}`,
      ...(args.credentialRef === null ? [] : [`secret:${args.credentialRef}`]),
    ],
    args.credentialRef,
  )
  if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const result = createProviderConnection({
    commandId: args.commandId,
    connectionRef: args.connectionRef,
    ...provenance,
    businessId: args.businessId,
    providerRef: args.providerRef,
    providerAccountRef: args.providerAccountRef,
    adapterId: args.adapterId,
    credentialRef: args.credentialRef,
    requestedScopes: args.requestedScopes,
    grantedScopes: args.grantedScopes,
    requestedResources: args.requestedResources,
    grantedResources: args.grantedResources,
    ...createOptionalFields(args),
    evidenceRefs: args.evidenceRefs,
  }, now, existing === null ? undefined : toDomain(existing))
  if (result.kind === 'refused') return result
  const connection = result.connection
  if (result.kind === 'duplicate') {
    if (existing === null
      || !providerConnectionAuthorityProvenanceIsValid(toDomain(existing))
      || existing.owningAccountRef !== actor.accountRef) {
      return { kind: 'refused' as const, code: 'invalid_transition' as const }
    }
    return projectCommandResult({ ...result, connection: toDomain(existing) })
  }
  await ctx.db.insert('capabilityProviderConnections', toRow(connection, args.commandId, result.commandDigest))
  return projectCommandResult({ ...result, connection })
}

export async function reauthorizeHandler(ctx: MutationCtx, args: ReauthorizeCommandArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(existing)
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (!providerConnectionAuthorityProvenanceIsValid(current)
    || actor === null || current.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const provenance = await resolveProviderConnectionProvenance(
    ctx, actor, 'refresh', [`connection:${current.connectionRef}`], args.credentialRef,
  )
  if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const result = reauthorizeProviderConnection(current, {
    commandId: args.commandId,
    connectionRef: args.connectionRef,
    ...provenance,
    businessId: args.businessId,
    providerRef: args.providerRef,
    providerAccountRef: args.providerAccountRef,
    adapterId: args.adapterId,
    credentialRef: args.credentialRef,
    requestedScopes: args.requestedScopes,
    grantedScopes: args.grantedScopes,
    requestedResources: args.requestedResources,
    grantedResources: args.grantedResources,
    ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
    expectedAuthorityGeneration: args.expectedAuthorityGeneration,
    expectedAuthorityDigest: args.expectedAuthorityDigest,
  }, now)
  if (result.kind === 'refused') return result
  if (result.kind === 'duplicate') return projectCommandResult({ ...result, connection: current })
  const connection = result.connection
  await ctx.db.replace(existing._id, toRow(connection, args.commandId, result.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  return projectCommandResult({ ...result, connection })
}

export async function beginRevocationHandler(ctx: MutationCtx, args: BeginRevocationArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(existing)
  const actor = await resolveCanonicalBusinessOwner(ctx, existing.businessId)
  if (!providerConnectionAuthorityProvenanceIsValid(current)
    || actor === null || current.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const result = beginProviderConnectionRevocation(current, args, now)
  if (result.kind === 'refused') return result
  const provenance = await resolveProviderConnectionProvenance(
    ctx, actor, 'revoke', [`connection:${current.connectionRef}`], current.credentialRef,
  )
  if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const rebound = withProviderConnectionAuthority(result.connection, provenance)
  const connection = {
    ...rebound,
    revocationRef: providerConnectionRevocationRef({
      connectionRef: rebound.connectionRef,
      expectedAuthorityGeneration: rebound.authorityGeneration,
      expectedAuthorityDigest: rebound.authorityDigest,
      adapterId: rebound.adapterId,
    }),
  }
  await ctx.db.replace(existing._id, toRow(connection, args.commandId, result.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', now, args.commandId)
  return projectCommandResult({ ...result, connection })
}

export async function recordCleanupResultHandler(ctx: MutationCtx, args: RecordCleanupResultArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(existing)
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, current)
  if (args.resourceAuthority === undefined
    || resourceAuthority === null
    || !cleanupResourceAuthorityMatches(resourceAuthority, args.resourceAuthority)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const result = recordProviderConnectionCleanupResult(current, args, Date.now())
  if (result.kind === 'applied') await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
  return projectCommandResult(result)
}

export async function readHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (row === null) return null
  const connection = toDomain(row)
  return connection.lifecycle !== 'active' || !providerConnectionAuthorityProvenanceIsValid(connection)
    ? null
    : toRow(connection, row.lastCommandId, row.lastCommandDigest)
}

export async function readCleanupTargetHandler(ctx: QueryCtx, args: ReadCleanupTargetArgs) {
  if (!Number.isSafeInteger(args.now) || args.now < 0) return null
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (row === null) return null
  const lifecycleMatches = ['revocation_pending', 'cleanup_required']
    .includes(row.lifecycle)
  const targetMatches = [
    lifecycleMatches, row.cleanupAttempt === args.cleanupAttempt,
    row.cleanupCommandId === args.commandId,
    row.cleanupRequestDigest === args.requestDigest,
    row.authorityGeneration === args.expectedAuthorityGeneration,
    row.authorityDigest === args.expectedAuthorityDigest,
  ].every(Boolean)
  if (!targetMatches) return null
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, toDomain(row), args.now)
  if (resourceAuthority === null) return null
  return {
    connectionRef: row.connectionRef,
    providerRef: row.providerRef,
    providerAccountRef: row.providerAccountRef,
    adapterId: row.adapterId,
    credentialRef: row.credentialRef === null ? null : 'redacted' as const,
    grantedScopes: row.grantedScopes,
    grantedResources: row.grantedResources,
    authorityGeneration: row.authorityGeneration,
    authorityDigest: row.authorityDigest,
    lifecycle: row.lifecycle,
    ...Object.fromEntries(Object.entries({
      revocationRef: row.revocationRef,
      cleanupAttempt: row.cleanupAttempt,
    }).filter(([, value]) => value !== undefined)),
    resourceAuthority,
  }
}

export async function listByBusinessLifecycleHandler(ctx: QueryCtx, args: ListByBusinessLifecycleArgs) {
  const rows = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_businessId_and_lifecycle', (query) => query.eq('businessId', args.businessId).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit))))
  return rows.flatMap((row) => providerConnectionAuthorityProvenanceIsValid(toDomain(row))
    ? [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)]
    : [])
}

export async function listByProviderLifecycleHandler(ctx: QueryCtx, args: ListByProviderLifecycleArgs) {
  const rows = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_providerRef_and_lifecycle', (query) => query.eq('providerRef', args.providerRef).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit))))
  return rows.flatMap((row) => providerConnectionAuthorityProvenanceIsValid(toDomain(row))
    ? [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)]
    : [])
}

export async function readAtGenerationHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef_and_authorityGeneration', (query) => query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)).unique()
  if (row === null) return null
  const connection = toDomain(row)
  return !providerConnectionAuthorityProvenanceIsValid(connection)
    ? null
    : toRow(connection, row.lastCommandId, row.lastCommandDigest)
}

export async function resolveCredentialRefHandler(
  _ctx: QueryCtx,
  _args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
): Promise<ProviderConnectionCredentialResolution> {
  return { kind: 'unavailable' as const, reason: 'inactive' as const }
}

export async function validateAuthorityHandler(
  _ctx: QueryCtx,
  _args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
): Promise<ProviderConnectionAuthorityValidation> {
  return { kind: 'unavailable' as const, reason: 'inactive' as const }
}
