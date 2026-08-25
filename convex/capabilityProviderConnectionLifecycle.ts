import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import { v } from 'convex/values'
import {
  beginProviderConnectionRevocation,
  createProviderConnection,
  invalidateProviderConnectionLease,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  resolveProviderConnectionCredentialRef,
  validateProviderConnectionAuthority,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
  type ProviderConnectionInvocationLease,
} from '../src/modules/capability-supply/provider-connection'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

export const lifecycle = v.union(
  v.literal('active'),
  v.literal('reauthorization_required'),
  v.literal('revocation_pending'),
  v.literal('revoked'),
  v.literal('cleanup_required'),
)
export const connectionValue = v.object({
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
export const authorityFields = {
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
} as const
export const cleanupTargetValue = v.object({
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
export const commandResult = v.union(
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
export const credentialResolution = v.union(
  v.object({ kind: v.literal('resolved'), credentialRef: v.string() }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)
export const connectionAuthorityValidation = v.union(
  v.object({ kind: v.literal('valid') }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('not_found'), v.literal('inactive'), v.literal('stale_generation'),
      v.literal('expired'), v.literal('digest_mismatch'), v.literal('credential_unavailable'),
    ),
  }),
)

export const createArgs = {
  ...authorityFields,
  commandId: v.string(),
  now: v.number(),
} as const
export const reauthorizeArgs = {
  ...authorityFields,
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const
export const beginRevocationArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
} as const
export const advanceLeaseDrainArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
  workId: v.string(),
  now: v.number(),
} as const
export const recordCleanupResultArgs = {
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
} as const
export const readArgs = {
  connectionRef: v.string(),
} as const
export const readCleanupTargetArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestDigest: v.string(),
  cleanupAttempt: v.number(),
} as const
export const listByBusinessLifecycleArgs = {
  businessId: v.id('businesses'),
  lifecycle,
  limit: v.number(),
} as const
export const listByProviderLifecycleArgs = {
  providerRef: v.string(),
  lifecycle,
  limit: v.number(),
} as const
export const readAtGenerationArgs = {
  connectionRef: v.string(),
  authorityGeneration: v.number(),
} as const
export const resolveCredentialRefArgs = {
  connectionRef: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const
export const validateAuthorityArgs = {
  connectionRef: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  now: v.number(),
} as const

export type CleanupWorkKind = 'lease_drain' | 'cleanup'
export type CleanupWorkContext = Readonly<{
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  workKind: CleanupWorkKind
}>

type ProviderConnectionRow = {
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
  cleanupWorkKind?: CleanupWorkKind
  cleanupCommandId?: string
  cleanupRequestDigest?: string
  cleanupCallbackGraceUntil?: number
}

type ProviderConnectionLeaseRow = {
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
}

type AuthorityCommandArgs = {
  connectionRef: string
  businessId: Id<'businesses'>
  providerRef: string
  providerAccountRef: string
  adapterId: string
  credentialRef: string | null
  requestedScopes: string[]
  grantedScopes: string[]
  requestedResources: string[]
  grantedResources: string[]
  expiresAt?: number
  reasonCode?: string
  evidenceRefs: string[]
  commandId: string
  now: number
}

type ReauthorizeCommandArgs = AuthorityCommandArgs & {
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
}

type BeginRevocationArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
  now: number
}

type AdvanceLeaseDrainArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
  workId: string
  now: number
}

type RecordCleanupResultArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  cleanupAttempt: number
  workId: string
  requestDigest: string
  outcome: 'detached' | 'revoked' | 'already_revoked' | 'unsupported' | 'provider_refused' | 'outcome_unknown'
  responseDigest?: string
  reasonCode?: string
  evidenceRefs: string[]
  now: number
}

type ReadCleanupTargetArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestDigest: string
  cleanupAttempt: number
}

type ListByBusinessLifecycleArgs = {
  businessId: Id<'businesses'>
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}

type ListByProviderLifecycleArgs = {
  providerRef: string
  lifecycle: ProviderConnection['lifecycle']
  limit: number
}

const CLEANUP_CALLBACK_GRACE_MS = 10_000

export function toDomain(row: ProviderConnectionRow): ProviderConnection {
  return row
}

export function toRow(connection: ProviderConnection, commandId: string, commandDigest: string) {
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

export function toLeaseDomain(row: ProviderConnectionLeaseRow): ProviderConnectionInvocationLease {
  return row
}

export function toLeaseRow(lease: ProviderConnectionInvocationLease, commandId: string, commandDigest: string) {
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

export async function invalidateActiveLeases(
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

export async function enqueueCleanupWork(
  ctx: MutationCtx,
  rowId: Id<'capabilityProviderConnections'>,
  connection: ProviderConnection,
  context: Omit<CleanupWorkContext, 'workKind'> & { workKind: CleanupWorkKind },
  now: number,
): Promise<ProviderConnection> {
  const workId = await marketDispatchWorkpool.enqueueAction(
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

export async function advanceLeaseDrainHandler(ctx: MutationCtx, args: AdvanceLeaseDrainArgs) {
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
}

export async function createHandler(ctx: MutationCtx, args: AuthorityCommandArgs) {
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
}

export async function reauthorizeHandler(ctx: MutationCtx, args: ReauthorizeCommandArgs) {
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
}

export async function beginRevocationHandler(ctx: MutationCtx, args: BeginRevocationArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const result = beginProviderConnectionRevocation(existing === null ? undefined : toDomain(existing), args, args.now)
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
    await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', args.now, args.commandId)
  }
  return projectCommandResult(result)
}

export async function recordCleanupResultHandler(ctx: MutationCtx, args: RecordCleanupResultArgs) {
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  const result = recordProviderConnectionCleanupResult(existing === null ? undefined : toDomain(existing), args, args.now)
  if (result.kind === 'applied' && existing !== null) await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
  return projectCommandResult(result)
}

export async function readHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  return row === null ? null : toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)
}

export async function readCleanupTargetHandler(ctx: QueryCtx, args: ReadCleanupTargetArgs) {
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
}

export async function listByBusinessLifecycleHandler(ctx: QueryCtx, args: ListByBusinessLifecycleArgs) {
  return (await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_businessId_and_lifecycle', (query) => query.eq('businessId', args.businessId).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit)))))
    .map((row) => toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest))
}

export async function listByProviderLifecycleHandler(ctx: QueryCtx, args: ListByProviderLifecycleArgs) {
  return (await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_providerRef_and_lifecycle', (query) => query.eq('providerRef', args.providerRef).eq('lifecycle', args.lifecycle))
    .take(Math.max(1, Math.min(100, Math.trunc(args.limit)))))
    .map((row) => toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest))
}

export async function readAtGenerationHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef_and_authorityGeneration', (query) => query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)).unique()
  return row === null ? null : toRow(toDomain(row), row.lastCommandId, row.lastCommandDigest)
}

export async function resolveCredentialRefHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  return resolveProviderConnectionCredentialRef(row === null ? undefined : toDomain(row), args.expectedAuthorityGeneration, args.expectedAuthorityDigest, args.now)
}

export async function validateAuthorityHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; expectedAuthorityGeneration: number; expectedAuthorityDigest: string; now: number },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  return validateProviderConnectionAuthority(
    row === null ? undefined : toDomain(row),
    args.expectedAuthorityGeneration,
    args.expectedAuthorityDigest,
    args.now,
  )
}
