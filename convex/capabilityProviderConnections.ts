import { customerRequestRouteWorkpool } from './customerRequestRouteWorkpool'
import type { WorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'
import {
  beginProviderConnectionRevocation,
  consumeProviderConnectionLease,
  createProviderConnection,
  createX402ProviderConnection,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  projectProviderConnectionOwner,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionRevocationRef,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  resolveProviderConnectionCredentialRef,
  resolveProviderConnectionCredentialRefForLease,
  validateProviderConnectionAuthority,
  validateProviderConnectionLeaseAuthority,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
  type ProviderConnectionInvocationLease,
  type ProviderConnectionLeaseApproval,
  type ProviderConnectionLeaseCommandResult,
} from '../src/modules/capability-supply/provider-connection'
import { validPublicHttpsEndpoint } from '../src/modules/capability-supply/public'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  isProviderApprovalDecisionIntegrityValid,
  type ProviderApprovalDecision,
} from '../src/modules/capability-supply/provider-approval'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

const lifecycle = v.union(
  v.literal('active'),
  v.literal('reauthorization_required'),
  v.literal('revocation_pending'),
  v.literal('revoked'),
  v.literal('cleanup_required'),
)
const connectionValue = v.object({
  connectionRef: v.string(),
  businessId: v.id('businesses'),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.string(), v.null()),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastCommandId: v.string(),
  lastCommandDigest: v.string(),
  revocationRef: v.optional(v.string()),
  cleanupAttempt: v.optional(v.number()),
  cleanupWorkId: v.optional(v.string()),
  cleanupWorkKind: v.optional(v.union(v.literal('lease_drain'), v.literal('cleanup'))),
  cleanupCommandId: v.optional(v.string()),
  cleanupRequestDigest: v.optional(v.string()),
  cleanupCallbackGraceUntil: v.optional(v.number()),
})
const authorityFields = {
  connectionRef: v.string(),
  businessId: v.id('businesses'),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.string(), v.null()),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  expiresAt: v.optional(v.number()),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
}
const cleanupTargetValue = v.object({
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  credentialRef: v.union(v.literal('redacted'), v.null()),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  revocationRef: v.optional(v.string()),
  cleanupAttempt: v.optional(v.number()),
})
const commandResult = v.union(
  v.object({ kind: v.literal('applied'), connection: connectionValue, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), connection: connectionValue, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_scope'),
      v.literal('invalid_resource'), v.literal('invalid_generation'), v.literal('invalid_digest'),
      v.literal('invalid_transition'), v.literal('command_identity_conflict'),
    ),
  }),
)
const credentialResolution = v.union(
  v.object({ kind: v.literal('resolved'), credentialRef: v.string() }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)
const connectionAuthorityValidation = v.union(
  v.object({ kind: v.literal('valid') }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)
const leaseState = v.union(
  v.literal('active'),
  v.literal('consumed'),
  v.literal('expired'),
  v.literal('invalidated'),
)
const leaseValue = v.object({
  leaseRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  approvalDecisionDigest: v.string(),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  state: leaseState,
  issuedAt: v.number(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  invalidatedAt: v.optional(v.number()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastCommandId: v.string(),
  lastCommandDigest: v.string(),
})
const leaseResult = v.union(
  v.object({ kind: v.literal('applied'), lease: leaseValue, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), lease: leaseValue, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_generation'),
      v.literal('invalid_digest'), v.literal('invalid_scope'), v.literal('invalid_resource'),
      v.literal('invalid_lease'), v.literal('invalid_transition'), v.literal('connection_not_found'),
      v.literal('connection_not_active'), v.literal('connection_expired'), v.literal('approval_missing'),
      v.literal('approval_refused'), v.literal('approval_stale'), v.literal('approval_scope_mismatch'),
      v.literal('approval_resource_mismatch'), v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'), v.literal('lease_scope_mismatch'),
      v.literal('lease_resource_mismatch'), v.literal('lease_identity_mismatch'), v.literal('lease_not_expired'),
      v.literal('command_identity_conflict'),
    ),
  }),
)
const leaseCredentialResolution = v.union(
  v.object({ kind: v.literal('resolved'), credentialRef: v.string() }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'),
      v.literal('lease_scope_mismatch'), v.literal('lease_resource_mismatch'),
      v.literal('lease_identity_mismatch'), v.literal('connection_not_found'),
      v.literal('connection_inactive'), v.literal('connection_expired'),
      v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('credential_unavailable'),
    ),
  }),
)
const leaseAuthorityValidation = v.union(
  v.object({ kind: v.literal('valid') }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'),
      v.literal('lease_scope_mismatch'), v.literal('lease_resource_mismatch'),
      v.literal('lease_identity_mismatch'), v.literal('connection_not_found'),
      v.literal('connection_inactive'), v.literal('connection_expired'),
      v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('credential_unavailable'),
    ),
  }),
)
const ownerProjection = v.object({
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
const ownerCommandResult = v.union(
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

function toDomain(row: {
  connectionRef: string
  businessId: Id<'businesses'>
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  grantedScopes: string[]
  grantedResources: string[]
  authorityGeneration: number
  authorityDigest: string
  lifecycle: ProviderConnection['lifecycle']
  observedAt: number
  expiresAt?: number
  revokedAt?: number
  reasonCode?: string
  evidenceRefs: string[]
  createdAt: number
  updatedAt: number
  lastCommandId: string
  lastCommandDigest: string
  revocationRef?: string
  cleanupAttempt?: number
  cleanupWorkId?: string
  cleanupWorkKind?: 'lease_drain' | 'cleanup'
  cleanupCommandId?: string
  cleanupRequestDigest?: string
  cleanupCallbackGraceUntil?: number
}): ProviderConnection {
  return row
}

function toRow(connection: ProviderConnection, commandId: string, commandDigest: string) {
  if (connection.lastCommandId === undefined || connection.lastCommandDigest === undefined) {
    throw new Error('provider_connection_command_receipt_missing')
  }
  return {
    connectionRef: connection.connectionRef,
    businessId: connection.businessId as Id<'businesses'>,
    providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef,
    adapterId: connection.adapterId,
    credentialRef: connection.credentialRef,
    grantedScopes: [...connection.grantedScopes],
    grantedResources: [...connection.grantedResources],
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    lifecycle: connection.lifecycle,
    observedAt: connection.observedAt,
    ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
    ...(connection.revocationRef === undefined ? {} : { revocationRef: connection.revocationRef }),
    ...(connection.cleanupAttempt === undefined ? {} : { cleanupAttempt: connection.cleanupAttempt }),
    ...(connection.cleanupWorkId === undefined ? {} : { cleanupWorkId: connection.cleanupWorkId }),
    ...(connection.cleanupWorkKind === undefined ? {} : { cleanupWorkKind: connection.cleanupWorkKind }),
    ...(connection.cleanupCommandId === undefined ? {} : { cleanupCommandId: connection.cleanupCommandId }),
    ...(connection.cleanupRequestDigest === undefined ? {} : { cleanupRequestDigest: connection.cleanupRequestDigest }),
    ...(connection.cleanupCallbackGraceUntil === undefined ? {} : { cleanupCallbackGraceUntil: connection.cleanupCallbackGraceUntil }),
    ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
    ...(connection.reasonCode === undefined ? {} : { reasonCode: connection.reasonCode }),
    evidenceRefs: [...connection.evidenceRefs],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    lastCommandId: connection.lastCommandId ?? commandId,
    lastCommandDigest: connection.lastCommandDigest ?? commandDigest,
  }
}

function projectCommandResult(result: ProviderConnectionCommandResult) {
  if (result.kind === 'refused') return result
  const connection = toRow(result.connection, result.connection.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}
function toLeaseDomain(row: {
  leaseRef: string
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  approvalDecisionRef: string
  approvalDecisionDigest: string
  readinessValidUntil: number
  readinessDigest?: string
  state: ProviderConnectionInvocationLease['state']
  issuedAt: number
  expiresAt: number
  consumedAt?: number
  invalidatedAt?: number
  evidenceRefs: string[]
  createdAt: number
  updatedAt: number
  lastCommandId: string
  lastCommandDigest: string
}): ProviderConnectionInvocationLease {
  return row
}
function toLeaseRow(lease: ProviderConnectionInvocationLease, commandId: string, commandDigest: string) {
  if (lease.lastCommandId === undefined || lease.lastCommandDigest === undefined) {
    throw new Error('provider_connection_lease_command_receipt_missing')
  }
  return {
    leaseRef: lease.leaseRef,
    invocationRef: lease.invocationRef,
    operationRef: lease.operationRef,
    connectionRef: lease.connectionRef,
    providerRef: lease.providerRef,
    providerAccountRef: lease.providerAccountRef,
    adapterId: lease.adapterId,
    authorityGeneration: lease.authorityGeneration,
    authorityDigest: lease.authorityDigest,
    grantedScopes: [...lease.grantedScopes],
    grantedResources: [...lease.grantedResources],
    approvalDecisionRef: lease.approvalDecisionRef,
    approvalDecisionDigest: lease.approvalDecisionDigest,
    readinessValidUntil: lease.readinessValidUntil,
    ...(lease.readinessDigest === undefined ? {} : { readinessDigest: lease.readinessDigest }),
    state: lease.state,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    ...(lease.consumedAt === undefined ? {} : { consumedAt: lease.consumedAt }),
    ...(lease.invalidatedAt === undefined ? {} : { invalidatedAt: lease.invalidatedAt }),
    evidenceRefs: [...lease.evidenceRefs],
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt,
    lastCommandId: lease.lastCommandId ?? commandId,
    lastCommandDigest: lease.lastCommandDigest ?? commandDigest,
  }
}
function projectLeaseResult(result: ProviderConnectionLeaseCommandResult) {
  if (result.kind === 'refused') return result
  const lease = toLeaseRow(result.lease, result.lease.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, lease, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, lease, commandDigest: result.commandDigest }
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
async function invalidateActiveLeases(
  ctx: MutationCtx,
  connectionRef: string,
  reasonCode: 'generation_changed' | 'revocation_started',
  now: number,
  commandPrefix: string,
): Promise<boolean> {
  const rows = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_connectionRef_and_state', (index) => (
      index.eq('connectionRef', connectionRef).eq('state', 'active')
    ))
    .take(1001)
  const batch = rows.slice(0, 1000)
  await Promise.all(batch.map(async (row) => {
    const result = invalidateProviderConnectionLease(toLeaseDomain(row), {
      commandId: `${commandPrefix}:lease:${row.leaseRef}`,
      leaseRef: row.leaseRef,
      reasonCode,
      evidenceRefs: [`provider_connection:${reasonCode}`],
    }, now)
    if (result.kind === 'applied') {
      await ctx.db.replace(row._id, toLeaseRow(result.lease, row.lastCommandId, result.commandDigest))
    }
  }))
  return rows.length > batch.length
}
const CLEANUP_CALLBACK_GRACE_MS = 10_000
type CleanupWorkKind = 'lease_drain' | 'cleanup'
type CleanupWorkContext = Readonly<{
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  workKind: CleanupWorkKind
}>

function cleanupOwnerCommandDigest(connectionRef: string, commandId: string): string {
  return canonicalDigest({ kind: 'provider_cleanup_owner_retry:v1', connectionRef, commandId })
}

async function enqueueCleanupWork(
  ctx: MutationCtx,
  rowId: Id<'capabilityProviderConnections'>,
  connection: ProviderConnection,
  context: Omit<CleanupWorkContext, 'workKind'> & { workKind: CleanupWorkKind },
  now: number,
): Promise<ProviderConnection> {
  const workId = await customerRequestRouteWorkpool.enqueueAction(
    ctx,
    internal.capabilityProviderConnectionCleanup.run,
    {
      connectionRef: connection.connectionRef,
      commandId: context.commandId,
      expectedAuthorityGeneration: context.expectedAuthorityGeneration,
      expectedAuthorityDigest: context.expectedAuthorityDigest,
      requestDigest: context.requestDigest,
      cleanupAttempt: context.cleanupAttempt,
      workKind: context.workKind,
    },
    {
      retry: false,
      onComplete: internal.capabilityProviderConnectionCleanup.completeWork,
      context,
    },
  )
  const next = {
    ...connection,
    cleanupAttempt: context.cleanupAttempt,
    cleanupWorkId: workId,
    cleanupWorkKind: context.workKind,
    cleanupCommandId: context.commandId,
    cleanupRequestDigest: context.requestDigest,
    cleanupCallbackGraceUntil: now + CLEANUP_CALLBACK_GRACE_MS,
    updatedAt: now,
  }
  await ctx.db.patch(rowId, toRow(next, context.commandId, canonicalDigest(context)))
  return next
}

async function cleanupWorkMatches(
  ctx: MutationCtx,
  args: Pick<CleanupWorkContext, 'connectionRef' | 'commandId' | 'expectedAuthorityGeneration' | 'expectedAuthorityDigest' | 'requestDigest' | 'cleanupAttempt'> & { workId: string },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  return row !== null
    && row.lifecycle === 'revocation_pending'
    && row.cleanupWorkId === args.workId
    && row.cleanupAttempt === args.cleanupAttempt
    && row.cleanupCommandId === args.commandId
    && row.cleanupRequestDigest === args.requestDigest
    && row.authorityGeneration === args.expectedAuthorityGeneration
    && row.authorityDigest === args.expectedAuthorityDigest
    ? row
    : null
}

export const advanceLeaseDrain = internalMutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    requestDigest: v.string(),
    cleanupAttempt: v.number(),
    workId: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await cleanupWorkMatches(ctx, args)
    if (row === null || row.cleanupWorkKind !== 'lease_drain') return null
    const connection = toDomain(row)
    const hasMore = await invalidateActiveLeases(
      ctx,
      args.connectionRef,
      'revocation_started',
      args.now,
      `${args.commandId}:drain:${args.cleanupAttempt}`,
    )
    const nextKind: CleanupWorkKind = hasMore ? 'lease_drain' : 'cleanup'
    await enqueueCleanupWork(ctx, row._id, connection, {
      connectionRef: args.connectionRef,
      commandId: args.commandId,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      requestDigest: args.requestDigest,
      cleanupAttempt: args.cleanupAttempt,
      workKind: nextKind,
    }, args.now)
    return null
  },
})

export const create = internalMutation({
  args: { ...authorityFields, commandId: v.string(), now: v.number() },
  returns: commandResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    const result = createProviderConnection({
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
    }, args.now, existing === null ? undefined : toDomain(existing))
    if (result.kind === 'applied') await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, args.commandId, result.commandDigest))
    return projectCommandResult(result)
  },
})

export const reauthorize = internalMutation({
  args: { ...authorityFields, commandId: v.string(), expectedAuthorityGeneration: v.number(), expectedAuthorityDigest: v.string(), now: v.number() },
  returns: commandResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    const result = reauthorizeProviderConnection(existing === null ? undefined : toDomain(existing), {
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
    }, args.now)
    if (result.kind === 'applied' && existing !== null) {
      await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
      await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', args.now, args.commandId)
    }
    return projectCommandResult(result)
  },
})

export const beginRevocation = internalMutation({
  args: { connectionRef: v.string(), commandId: v.string(), expectedAuthorityGeneration: v.number(), expectedAuthorityDigest: v.string(), reasonCode: v.optional(v.string()), evidenceRefs: v.array(v.string()), now: v.number() },
  returns: commandResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    const result = beginProviderConnectionRevocation(existing === null ? undefined : toDomain(existing), args, args.now)
    if (result.kind === 'applied' && existing !== null) {
      await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
      await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', args.now, args.commandId)
    }
    return projectCommandResult(result)
  },
})

export const recordCleanupResult = internalMutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    cleanupAttempt: v.number(),
    workId: v.string(),
    requestDigest: v.string(),
    outcome: v.union(
      v.literal('detached'),
      v.literal('revoked'),
      v.literal('already_revoked'),
      v.literal('unsupported'),
      v.literal('provider_refused'),
      v.literal('outcome_unknown'),
    ),
    responseDigest: v.optional(v.string()),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
    now: v.number(),
  },
  returns: commandResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    const result = recordProviderConnectionCleanupResult(existing === null ? undefined : toDomain(existing), args, args.now)
    if (result.kind === 'applied' && existing !== null) await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
    return projectCommandResult(result)
  },
})

export const read = internalQuery({
  args: { connectionRef: v.string() },
  returns: v.union(connectionValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    return row === null ? null : toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)
  },
})

export const readCleanupTarget = internalQuery({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    requestDigest: v.string(),
    cleanupAttempt: v.number(),
  },
  returns: v.union(cleanupTargetValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    if (
      row === null
      || (row.lifecycle !== 'revocation_pending' && row.lifecycle !== 'cleanup_required')
      || row.cleanupAttempt !== args.cleanupAttempt
      || row.cleanupCommandId !== args.commandId
      || row.cleanupRequestDigest !== args.requestDigest
      || row.authorityGeneration !== args.expectedAuthorityGeneration
      || row.authorityDigest !== args.expectedAuthorityDigest
    ) return null
    return row === null ? null : {
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
      ...(row.revocationRef === undefined ? {} : { revocationRef: row.revocationRef }),
      ...(row.cleanupAttempt === undefined ? {} : { cleanupAttempt: row.cleanupAttempt }),
    }
  },
})

export const listByBusinessLifecycle = internalQuery({
  args: { businessId: v.id('businesses'), lifecycle, limit: v.number() },
  returns: v.array(connectionValue),
  handler: async (ctx, args) => (await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_businessId_and_lifecycle', (query) => query.eq('businessId', args.businessId).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit)))))
    .map((row) => toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)),
})

export const listByProviderLifecycle = internalQuery({
  args: { providerRef: v.string(), lifecycle, limit: v.number() },
  returns: v.array(connectionValue),
  handler: async (ctx, args) => (await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_providerRef_and_lifecycle', (query) => query.eq('providerRef', args.providerRef).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit)))))
    .map((row) => toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)),
})

export const readAtGeneration = internalQuery({
  args: { connectionRef: v.string(), authorityGeneration: v.number() },
  returns: v.union(connectionValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef_and_authorityGeneration', (query) => query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)).unique()
    return row === null ? null : toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)
  },
})

export const resolveCredentialRef = internalQuery({
  args: { connectionRef: v.string(), expectedAuthorityGeneration: v.number(), expectedAuthorityDigest: v.string(), now: v.number() },
  returns: credentialResolution,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    return resolveProviderConnectionCredentialRef(row === null ? undefined : toDomain(row), args.expectedAuthorityGeneration, args.expectedAuthorityDigest, args.now)
  },
})
export const validateAuthority = internalQuery({
  args: {
    connectionRef: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    now: v.number(),
  },
  returns: connectionAuthorityValidation,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
    return validateProviderConnectionAuthority(
      row === null ? undefined : toDomain(row),
      args.expectedAuthorityGeneration,
      args.expectedAuthorityDigest,
      args.now,
    )
  },
})
const leaseIssueFields = {
  commandId: v.string(),
  leaseRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  leaseMs: v.number(),
  evidenceRefs: v.array(v.string()),
}

export const issueLease = internalMutation({
  args: { ...leaseIssueFields, now: v.number() },
  returns: leaseResult,
  handler: async (ctx, args) => {
    const [connectionRow, approvalRow, existingLeaseRow] = await Promise.all([
      ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
      ctx.db.query('capabilityProviderApprovals')
        .withIndex('by_decisionRef', (index) => index.eq('decisionRef', args.approvalDecisionRef)).unique(),
      ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    ])
    if (approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)) {
      return { kind: 'refused' as const, code: 'approval_missing' as const }
    }
    const result = issueProviderConnectionLease(
      connectionRow === null ? undefined : toDomain(connectionRow),
      {
        commandId: args.commandId,
        leaseRef: args.leaseRef,
        invocationRef: args.invocationRef,
        operationRef: args.operationRef,
        connectionRef: args.connectionRef,
        providerRef: args.providerRef,
        providerAccountRef: args.providerAccountRef,
        adapterId: args.adapterId,
        expectedAuthorityGeneration: args.expectedAuthorityGeneration,
        expectedAuthorityDigest: args.expectedAuthorityDigest,
        requestedScopes: args.requestedScopes,
        grantedScopes: args.grantedScopes,
        requestedResources: args.requestedResources,
        grantedResources: args.grantedResources,
        approval: approvalRow,
        readinessValidUntil: args.readinessValidUntil,
        ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
        leaseMs: args.leaseMs,
        evidenceRefs: args.evidenceRefs,
      },
      args.now,
      existingLeaseRow === null ? undefined : toLeaseDomain(existingLeaseRow),
    )
    if (result.kind === 'applied') {
      await ctx.db.insert(
        'capabilityProviderConnectionLeases',
        toLeaseRow(result.lease, args.commandId, result.commandDigest),
      )
    }
    return projectLeaseResult(result)
  },
})

export const readLease = internalQuery({
  args: { leaseRef: v.string() },
  returns: v.union(leaseValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
    return row === null ? null : toLeaseRow(toLeaseDomain(row), row.lastCommandId, row.lastCommandDigest)
  },
})

export const readLeaseByInvocation = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(leaseValue, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_invocationRef', (index) => index.eq('invocationRef', args.invocationRef)).order('desc').first()
    return row === null ? null : toLeaseRow(toLeaseDomain(row), row.lastCommandId, row.lastCommandDigest)
  },
})

export const resolveLeaseCredentialRef = internalQuery({
  args: {
    leaseRef: v.string(),
    connectionRef: v.string(),
    invocationRef: v.string(),
    operationRef: v.string(),
    providerRef: v.string(),
    providerAccountRef: v.string(),
    adapterId: v.string(),
    authorityGeneration: v.number(),
    authorityDigest: v.string(),
    grantedScopes: v.array(v.string()),
    grantedResources: v.array(v.string()),
    readinessValidUntil: v.number(),
    readinessDigest: v.optional(v.string()),
    now: v.number(),
  },
  returns: leaseCredentialResolution,
  handler: async (ctx, args) => {
    const [connectionRow, leaseRow] = await Promise.all([
      ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
      ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    ])
    const approvalRow = leaseRow === null
      ? null
      : await ctx.db.query('capabilityProviderApprovals')
        .withIndex('by_decisionRef', (index) => index.eq('decisionRef', leaseRow.approvalDecisionRef)).unique()
    const currentApproval: ProviderConnectionLeaseApproval | null =
      approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)
        ? null
        : {
            decisionRef: approvalRow.decisionRef,
            decisionDigest: approvalRow.decisionDigest,
            providerRef: approvalRow.providerRef,
            providerAccountRef: approvalRow.providerAccountRef,
            connectionRef: approvalRow.connectionRef,
            authorityGeneration: approvalRow.authorityGeneration,
            connectionAuthorityDigest: approvalRow.connectionAuthorityDigest,
            decision: approvalRow.decision,
            grantedScopes: approvalRow.grantedScopes,
            grantedResources: approvalRow.grantedResources,
          }
    return resolveProviderConnectionCredentialRefForLease(
      connectionRow === null ? undefined : toDomain(connectionRow),
      leaseRow === null ? undefined : toLeaseDomain(leaseRow),
      {
        leaseRef: args.leaseRef,
        invocationRef: args.invocationRef,
        operationRef: args.operationRef,
        connectionRef: args.connectionRef,
        providerRef: args.providerRef,
        providerAccountRef: args.providerAccountRef,
        adapterId: args.adapterId,
        authorityGeneration: args.authorityGeneration,
        authorityDigest: args.authorityDigest,
        grantedScopes: args.grantedScopes,
        grantedResources: args.grantedResources,
        readinessValidUntil: args.readinessValidUntil,
        ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
      },
      args.now,
      currentApproval,
    )
  },
})
export const validateLeaseAuthority = internalQuery({
  args: {
    leaseRef: v.string(),
    connectionRef: v.string(),
    invocationRef: v.string(),
    operationRef: v.string(),
    providerRef: v.string(),
    adapterId: v.string(),
    authorityGeneration: v.number(),
    authorityDigest: v.string(),
    grantedScopes: v.array(v.string()),
    grantedResources: v.array(v.string()),
    readinessValidUntil: v.number(),
    readinessDigest: v.optional(v.string()),
    now: v.number(),
  },
  returns: leaseAuthorityValidation,
  handler: async (ctx, args) => {
    const [connectionRow, leaseRow] = await Promise.all([
      ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
      ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    ])
    const lease = leaseRow === null ? undefined : toLeaseDomain(leaseRow)
    const approvalRow = leaseRow === null
      ? null
      : await ctx.db.query('capabilityProviderApprovals')
        .withIndex('by_decisionRef', (index) => index.eq('decisionRef', leaseRow.approvalDecisionRef)).unique()
    const currentApproval: ProviderConnectionLeaseApproval | null =
      approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)
        ? null
        : {
            decisionRef: approvalRow.decisionRef,
            decisionDigest: approvalRow.decisionDigest,
            providerRef: approvalRow.providerRef,
            providerAccountRef: approvalRow.providerAccountRef,
            connectionRef: approvalRow.connectionRef,
            authorityGeneration: approvalRow.authorityGeneration,
            connectionAuthorityDigest: approvalRow.connectionAuthorityDigest,
            decision: approvalRow.decision,
            grantedScopes: approvalRow.grantedScopes,
            grantedResources: approvalRow.grantedResources,
          }
    return validateProviderConnectionLeaseAuthority(
      connectionRow === null ? undefined : toDomain(connectionRow),
      lease,
      {
        leaseRef: args.leaseRef,
        invocationRef: args.invocationRef,
        operationRef: args.operationRef,
        connectionRef: args.connectionRef,
        providerRef: args.providerRef,
        providerAccountRef: lease?.providerAccountRef ?? '',
        adapterId: args.adapterId,
        authorityGeneration: args.authorityGeneration,
        authorityDigest: args.authorityDigest,
        grantedScopes: args.grantedScopes,
        grantedResources: args.grantedResources,
        readinessValidUntil: args.readinessValidUntil,
        ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
      },
      args.now,
      currentApproval,
    )
  },
})

export const consumeLease = internalMutation({
  args: {
    leaseRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    readinessValidUntil: v.number(),
    readinessDigest: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
    now: v.number(),
  },
  returns: leaseResult,
  handler: async (ctx, args) => {
    const [leaseRow, connectionRow] = await Promise.all([
      ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
      leaseRowForConnection(ctx, args.leaseRef),
    ])
    const currentConnection = connectionRow === null ? undefined : toDomain(connectionRow)
    const result = consumeProviderConnectionLease(
      leaseRow === null ? undefined : toLeaseDomain(leaseRow),
      currentConnection,
      {
        commandId: args.commandId,
        leaseRef: args.leaseRef,
        expectedAuthorityGeneration: args.expectedAuthorityGeneration,
        expectedAuthorityDigest: args.expectedAuthorityDigest,
        readinessValidUntil: args.readinessValidUntil,
        ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
        evidenceRefs: args.evidenceRefs,
      },
      args.now,
    )
    if (result.kind === 'applied' && leaseRow !== null) {
      await ctx.db.replace(leaseRow._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
    }
    return projectLeaseResult(result)
  },
})

export const expireLease = internalMutation({
  args: { leaseRef: v.string(), commandId: v.string(), evidenceRefs: v.array(v.string()), now: v.number() },
  returns: leaseResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
    const result = expireProviderConnectionLease(existing === null ? undefined : toLeaseDomain(existing), args, args.now)
    if (result.kind === 'applied' && existing !== null) {
      await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
    }
    return projectLeaseResult(result)
  },
})

export const invalidateLease = internalMutation({
  args: {
    leaseRef: v.string(),
    commandId: v.string(),
    reasonCode: v.union(
      v.literal('generation_changed'),
      v.literal('revocation_started'),
      v.literal('readiness_expired'),
      v.literal('invocation_aborted'),
    ),
    evidenceRefs: v.array(v.string()),
    now: v.number(),
  },
  returns: leaseResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
    const result = invalidateProviderConnectionLease(existing === null ? undefined : toLeaseDomain(existing), args, args.now)
    if (result.kind === 'applied' && existing !== null) {
      await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
    }
    return projectLeaseResult(result)
  },
})

async function leaseRowForConnection(ctx: MutationCtx, leaseRef: string) {
  const lease = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', leaseRef)).unique()
  if (lease === null) return null
  return await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', lease.connectionRef)).unique()
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


export const readOwner = query({
  args: { connectionRef: v.string() },
  returns: v.union(ownerProjection, v.null()),
  handler: async (ctx, args) => {
    const row = await readOwnedConnection(ctx, args.connectionRef)
    return row === null ? null : projectOwnerProjection(toDomain(row), Date.now())
  },
})

export const listOwner = query({
  args: {},
  returns: v.array(ownerProjection),
  handler: async (ctx) => {
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
  },
})

export const revokeOwner = mutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
  },
  returns: ownerCommandResult,
  handler: async (ctx, args) => {
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
  },
})
export const retryOwnerCleanup = mutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
  },
  returns: ownerCommandResult,
  handler: async (ctx, args) => {
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
        const status = await customerRequestRouteWorkpool.status(ctx, row.cleanupWorkId as WorkId)
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
  },
})

async function reauthorizeOwnerConnection(
  ctx: MutationCtx,
  args: {
    connectionRef: string
    commandId: string
    expectedAuthorityGeneration: number
    expectedAuthorityDigest: string
    reasonCode?: string
    evidenceRefs: string[]
  },
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

export const rotateOwner = mutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
  },
  returns: ownerCommandResult,
  handler: async (ctx, args) => projectOwnerResult(await reauthorizeOwnerConnection(ctx, args, Date.now()), Date.now()),
})

export const reconnectOwner = mutation({
  args: {
    connectionRef: v.string(),
    commandId: v.string(),
    expectedAuthorityGeneration: v.number(),
    expectedAuthorityDigest: v.string(),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
  },
  returns: ownerCommandResult,
  handler: async (ctx, args) => projectOwnerResult(await reauthorizeOwnerConnection(ctx, args, Date.now()), Date.now()),
})
export const connectX402Owner = mutation({
  args: {
    businessId: v.id('businesses'),
    resourceUrl: v.string(),
    commandId: v.string(),
    evidenceRefs: v.array(v.string()),
  },
  returns: ownerCommandResult,
  handler: async (ctx, args) => {
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
  },
})
