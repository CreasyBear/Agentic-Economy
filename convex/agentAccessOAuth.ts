import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { sourceWriteCommandDigest, verifySourceWriteAdmission, type SourceWriteAdmission, type SourceWriteAdmissionRequest } from '../src/modules/security/source-write-admission'
import { isRecord } from '../src/modules/common/is-record'

const OAUTH_SOURCE_WRITE_SCOPE = 'agent_identity' as const
const flow = v.union(v.literal('device_code'), v.literal('authorization_code'))
const status = v.union(
  v.literal('pending'), v.literal('approved'), v.literal('denied'),
  v.literal('delivery_claimed'), v.literal('consumed'), v.literal('expired'),
)
const grant = v.object({
  grantRef: v.string(), flow, clientId: v.string(), redirectUri: v.optional(v.string()),
  requestedScopes: v.array(v.string()), codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  status, ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.number(), expiresAt: v.number(),
  approvedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), displayName: v.string(), denialReason: v.optional(v.literal('access_denied')),
})
const grantPatch = v.object({
  status: v.optional(status), redirectUri: v.optional(v.string()), requestedScopes: v.optional(v.array(v.string())),
  codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
  deviceCodeHash: v.optional(v.string()), userCodeHash: v.optional(v.string()), authorizationCodeHash: v.optional(v.string()),
  ownerId: v.optional(v.string()), keyId: v.optional(v.string()), createdAt: v.optional(v.number()), expiresAt: v.optional(v.number()),
  approvedAt: v.optional(v.number()), consumedAt: v.optional(v.number()), nextPollAt: v.optional(v.number()),
  deliveryClaimToken: v.optional(v.string()), displayName: v.optional(v.string()), denialReason: v.optional(v.literal('access_denied')),
})
const client = v.object({
  clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()),
  grantTypes: v.array(v.union(v.literal('authorization_code'), v.literal('urn:ietf:params:oauth:grant-type:device_code'))),
  tokenEndpointAuthMethod: v.literal('none'), createdAt: v.number(), lastUsedAt: v.optional(v.number()),
})
type GrantRow = Doc<'agentAccessOAuthGrants'>
type GrantHashKind = 'device' | 'user' | 'authorization'
type ClientRow = Doc<'agentAccessOAuthClients'>
const oauthGrantCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

const OAUTH_GRANT_RETENTION_GRACE_MS = 60 * 60 * 1_000
const OAUTH_GRANT_CLEANUP_BATCH_SIZE = 100
const OAUTH_GRANT_CLEANUP_MAX_BATCH_SIZE = 500

export const cleanupExpiredOAuthGrants = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: oauthGrantCleanupResult,
  handler: async (ctx, args) => {
    const now = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
    const cutoff = now - OAUTH_GRANT_RETENTION_GRACE_MS
    const batchSize =
      args.batchSize !== undefined && Number.isFinite(args.batchSize)
        ? Math.min(Math.max(Math.floor(args.batchSize), 1), OAUTH_GRANT_CLEANUP_MAX_BATCH_SIZE)
        : OAUTH_GRANT_CLEANUP_BATCH_SIZE

    const expiredGrants = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_expiresAt', (query) => query.lt('expiresAt', cutoff))
      .take(batchSize)

    await Promise.all(expiredGrants.map(({ _id }) => ctx.db.delete(_id)))

    const deleted = expiredGrants.length
    const rescheduled = deleted >= batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
        now,
        batchSize,
      })
    }

    return { deleted, cutoff, rescheduled }
  },
})

export const insertGrant = mutation({
  args: { grant, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const existing = await ctx.db.query('agentAccessOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grant.grantRef)).unique()
    if (existing === null) await ctx.db.insert('agentAccessOAuthGrants', args.grant)
    return null
  },
})

export const getGrantByHash = query({
  args: {
    kind: v.union(v.literal('device'), v.literal('user'), v.literal('authorization')),
    hash: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
  },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceRead(args)
    const hashIndex: GrantHashKind = args.kind
    const row = hashIndex === 'device'
      ? await ctx.db.query('agentAccessOAuthGrants').withIndex('by_deviceCodeHash', (q) => q.eq('deviceCodeHash', args.hash)).unique()
      : hashIndex === 'user'
        ? await ctx.db.query('agentAccessOAuthGrants').withIndex('by_userCodeHash', (q) => q.eq('userCodeHash', args.hash)).unique()
        : await ctx.db.query('agentAccessOAuthGrants').withIndex('by_authorizationCodeHash', (q) => q.eq('authorizationCodeHash', args.hash)).unique()
    return row === null ? null : withoutSystemFields(row)
  },
})

export const getGrantByRef = query({
  args: { grantRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceRead(args)
    const row = await ctx.db.query('agentAccessOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grantRef)).unique()
    return row === null ? null : withoutSystemFields(row)
  },
})

export const updateGrant = mutation({
  args: { grantRef: v.string(), expectedStatus: status, patch: grantPatch, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const row = await ctx.db.query('agentAccessOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grantRef)).unique()
    if (row === null || row.status !== args.expectedStatus) return null
    if (
      row.status !== 'pending'
      && (Object.hasOwn(args.patch, 'ownerId') || Object.hasOwn(args.patch, 'keyId') || Object.hasOwn(args.patch, 'requestedScopes'))
    ) {
      throw new ConvexError({ code: 'oauth_grant_immutable_after_approval' })
    }
    await ctx.db.patch(row._id, args.patch)
    return withoutSystemFields({ ...row, ...args.patch })
  },
})

export const insertClient = mutation({
  args: { client, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const existing = await ctx.db.query('agentAccessOAuthClients').withIndex('by_clientId', (q) => q.eq('clientId', args.client.clientId)).unique()
    if (existing === null) await ctx.db.insert('agentAccessOAuthClients', args.client)
    return null
  },
})

export const getClient = query({
  args: { clientId: v.string() },
  returns: v.union(client, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('agentAccessOAuthClients').withIndex('by_clientId', (q) => q.eq('clientId', args.clientId)).unique()
    return row === null ? null : withoutClientSystemFields(row)
  },
})

async function requireOAuthSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const admitted = await requireSourceWrite(ctx, args, OAUTH_SOURCE_WRITE_SCOPE)
  if (admitted.kind === 'rejected') {
    throw new Error(`agent_access_oauth_source_write_rejected:${admitted.reason}`)
  }
}

async function requireOAuthSourceRead(
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const admission = args.sourceWrite as SourceWriteAdmission | undefined
  const sourceWriteRequest = args.sourceWriteRequest
  if (!isSourceWriteRequest(sourceWriteRequest)) {
    throw new ConvexError({ code: 'oauth_source_read_rejected', reason: 'missing_source_write_request' })
  }
  const verification = await verifySourceWriteAdmission({
    ...(admission === undefined ? {} : { admission }),
    expected: {
      scope: OAUTH_SOURCE_WRITE_SCOPE,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest: sourceWriteCommandDigest(args),
      request: sourceWriteRequest,
    },
  })
  if (verification.kind === 'rejected') {
    throw new ConvexError({ code: 'oauth_source_read_rejected', reason: verification.reason })
  }
}

function isSourceWriteRequest(value: unknown): value is SourceWriteAdmissionRequest {
  return isRecord(value)
    && typeof value.method === 'string'
    && typeof value.initiatorOrigin === 'string'
    && typeof value.targetOrigin === 'string'
    && typeof value.targetPath === 'string'
    && typeof value.targetQuery === 'string'
    && typeof value.bodyDigest === 'string'
}

function withoutSystemFields(row: GrantRow): Omit<GrantRow, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}

function withoutClientSystemFields(row: ClientRow): Omit<ClientRow, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}
