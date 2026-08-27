import {
  beginProviderConnectionRevocation,
  canonicalProviderConnectionProjection,
  canonicalProviderConnectionProjectionIsCurrent,
  createProviderConnection,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
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
  readCanonicalConnectionForProjection,
  readCurrentCleanupResourceAuthority,
  resolveCanonicalBusinessOwner,
} from './authority'
export {
  canonicalConnectionActionContext,
  cleanupResourceAuthorityMatches,
  createCanonicalConnectionLifecycleService,
  failClosedCanonicalLifecycleError,
  readCanonicalConnectionForProjection,
  readCurrentCleanupResourceAuthority,
  resolveCanonicalBusinessOwner,
  resolveUniqueCanonicalGrant,
  type CanonicalActor,
} from './authority'
export {
  installCanonicalProviderConnection,
  shareCanonicalProviderConnection,
  transitionCanonicalProviderConnection,
} from './persistence'
import {
  installCanonicalProviderConnection,
  transitionCanonicalProviderConnection,
} from './persistence'
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
  const legacyResult = createProviderConnection({
    commandId: args.commandId,
    connectionRef: args.connectionRef,
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
  if (legacyResult.kind === 'refused') return legacyResult
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (actor === null) return { kind: 'refused' as const, code: 'invalid_identity' as const }
  const canonical = await installCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    providerNamespace: `capability-provider/${args.adapterId}`,
    providerLocator: args.providerAccountRef,
    credentialRef: args.credentialRef,
  })
  if (canonical === null || canonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  if (legacyResult.kind === 'duplicate') {
    const duplicateMatches = [
      canonicalProviderConnectionProjectionIsCurrent(projected, canonical),
      existing !== null,
      existing !== null && canonicalProviderConnectionProjectionIsCurrent(
        toDomain(existing), canonical,
      ),
    ].every(Boolean)
    if (!duplicateMatches || existing === null) {
      return { kind: 'refused' as const, code: 'invalid_transition' as const }
    }
    return projectCommandResult({ ...legacyResult, connection: toDomain(existing) })
  }
  await ctx.db.insert('capabilityProviderConnections', toRow(projected, args.commandId, legacyResult.commandDigest))
  return projectCommandResult({ ...legacyResult, connection: projected })
}

export async function reauthorizeHandler(ctx: MutationCtx, args: ReauthorizeCommandArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const currentLegacy = toDomain(existing)
  const currentCanonical = await readCanonicalConnectionForProjection(ctx, currentLegacy, true)
  const actor = await resolveCanonicalBusinessOwner(ctx, args.businessId)
  if (currentCanonical === null || actor === null || currentCanonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const legacyResult = reauthorizeProviderConnection(currentLegacy, {
    commandId: args.commandId,
    connectionRef: args.connectionRef,
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
  if (legacyResult.kind === 'refused') return legacyResult
  if (legacyResult.kind === 'duplicate') return projectCommandResult({ ...legacyResult, connection: currentLegacy })
  const canonical = await transitionCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    connection: currentCanonical,
    operation: 'refresh',
    externalState: { kind: 'known', value: 'ready' },
  })
  if (canonical === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  await ctx.db.replace(existing._id, toRow(projected, args.commandId, legacyResult.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  return projectCommandResult({ ...legacyResult, connection: projected })
}

export async function beginRevocationHandler(ctx: MutationCtx, args: BeginRevocationArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const currentLegacy = toDomain(existing)
  const currentCanonical = await readCanonicalConnectionForProjection(ctx, currentLegacy, true)
  const actor = await resolveCanonicalBusinessOwner(ctx, existing.businessId)
  if (currentCanonical === null || actor === null || currentCanonical.owningAccountRef !== actor.accountRef) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const now = Date.now()
  const legacyResult = beginProviderConnectionRevocation(currentLegacy, args, now)
  if (legacyResult.kind === 'refused') return legacyResult
  const canonical = await transitionCanonicalProviderConnection(ctx, {
    actor,
    commandId: args.commandId,
    connection: currentCanonical,
    operation: 'revoke',
    externalState: { kind: 'unknown', value: 'revocation_pending' },
  })
  if (canonical === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const projected = canonicalProviderConnectionProjection(legacyResult.connection, canonical)
  await ctx.db.replace(existing._id, toRow(projected, args.commandId, legacyResult.commandDigest))
  await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', now, args.commandId)
  return projectCommandResult({ ...legacyResult, connection: projected })
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
  const legacy = toDomain(row)
  return await readCanonicalConnectionForProjection(ctx, legacy, true) === null
    ? null
    : toRow(legacy, row.lastCommandId, row.lastCommandDigest)
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
  const current = await Promise.all(rows.map(async (row) => await readCanonicalConnectionForProjection(ctx, toDomain(row), args.lifecycle === 'active')))
  return rows.flatMap((row, index) => current[index] === null ? [] : [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)])
}

export async function listByProviderLifecycleHandler(ctx: QueryCtx, args: ListByProviderLifecycleArgs) {
  const rows = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_providerRef_and_lifecycle', (query) => query.eq('providerRef', args.providerRef).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit))))
  const current = await Promise.all(rows.map(async (row) => await readCanonicalConnectionForProjection(ctx, toDomain(row), args.lifecycle === 'active')))
  return rows.flatMap((row, index) => current[index] === null ? [] : [toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)])
}

export async function readAtGenerationHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef_and_authorityGeneration', (query) => query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)).unique()
  if (row === null) return null
  const legacy = toDomain(row)
  return await readCanonicalConnectionForProjection(ctx, legacy, true) === null
    ? null
    : toRow(legacy, row.lastCommandId, row.lastCommandDigest)
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
