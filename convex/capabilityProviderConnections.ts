import { v } from 'convex/values'

import {
  beginProviderConnectionRevocation,
  createProviderConnection,
  recordProviderConnectionCleanupResult,
  reauthorizeProviderConnection,
  resolveProviderConnectionCredentialRef,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../src/modules/capability-supply/provider-connection'
import { internalMutation, internalQuery } from './_generated/server'
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
  return {
    kind: result.kind,
    connection: toRow(result.connection, result.connection.lastCommandId ?? '', result.commandDigest),
    commandDigest: result.commandDigest,
  }
}

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
    if (result.kind === 'applied' && existing !== null) await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
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
    if (result.kind === 'applied' && existing !== null) await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
    return projectCommandResult(result)
  },
})

export const recordCleanupResult = internalMutation({
  args: { connectionRef: v.string(), commandId: v.string(), expectedAuthorityGeneration: v.number(), expectedAuthorityDigest: v.string(), outcome: v.union(v.literal('succeeded'), v.literal('failed')), reasonCode: v.optional(v.string()), evidenceRefs: v.array(v.string()), now: v.number() },
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
