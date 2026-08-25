import { ConvexError, v } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'
import { internal } from './_generated/api'
import { internalMutation, mutation, query } from './_generated/server'
import type { DataModel, Doc } from './_generated/dataModel'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { sourceWriteCommandDigest, verifySourceWriteAdmission, type SourceWriteAdmission, type SourceWriteAdmissionRequest } from '../src/modules/security/source-write-admission'
import { isRecord } from '../src/modules/common/is-record'

const OAUTH_SOURCE_WRITE_SCOPE = 'agent_identity' as const
const flow = v.union(v.literal('device_code'), v.literal('authorization_code'))
const status = v.union(
  v.literal('pending'), v.literal('approved'), v.literal('denied'),
  v.literal('delivery_claimed'), v.literal('consumed'), v.literal('expired'),
)
const OAUTH_GRANT_STATUSES = ['pending', 'approved', 'denied', 'delivery_claimed', 'consumed', 'expired'] as const
const requestedAccessAmount = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const requestedAccess = v.object({
  environment: v.union(v.literal('sandbox'), v.literal('production')),
  maximumSpendPerInvocation: v.optional(requestedAccessAmount),
  maximumDailySpend: v.optional(requestedAccessAmount),
  maximumMonthlySpend: v.optional(requestedAccessAmount),
  maximumConcurrentInvocations: v.optional(v.number()),
  maximumCallsPerMinute: v.optional(v.number()),
  maximumCallsPerHour: v.optional(v.number()),
  expiresInSeconds: v.number(),
})
const grant = v.object({
  grantRef: v.string(), flow, clientId: v.string(), redirectUri: v.optional(v.string()),
  requestedScopes: v.array(v.string()), requestedAccess, codeChallenge: v.optional(v.string()), codeChallengeMethod: v.optional(v.literal('S256')),
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
const oauthGrantCleanupResult = v.object({
  deleted: v.number(),
  cutoff: v.number(),
  rescheduled: v.boolean(),
})

export const cleanupExpiredOAuthGrants = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: oauthGrantCleanupResult,
  handler: async (ctx, args) => {
    const effectiveNow = args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()
    const cutoff = effectiveNow - 60 * 60 * 1_000
    const batchSize = args.batchSize === undefined || !Number.isFinite(args.batchSize)
      ? 100
      : Math.min(Math.max(Math.floor(args.batchSize), 1), 200)

    let deleted = 0
    for (const status of OAUTH_GRANT_STATUSES) {
      const remaining = batchSize - deleted
      if (remaining === 0) break
      const expired = await ctx.db
        .query('agentAccessOAuthGrants')
        .withIndex('by_status_and_expiresAt', (query) => query.eq('status', status).lt('expiresAt', cutoff))
        .take(remaining)
      for (const row of expired) {
        await ctx.db.delete(row._id)
        deleted += 1
      }
    }

    const rescheduled = deleted === batchSize
    if (rescheduled) {
      await ctx.scheduler.runAfter(0, internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
        now: effectiveNow,
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
    const existing = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grant.grantRef))
      .unique()
    if (existing !== null && !sameGrantMaterial(existing, args.grant)) {
      throw new Error('agent_access_oauth_grant_conflict')
    }
    await assertGrantHashesAvailable(ctx.db, args.grant, existing?._id)
    if (existing === null) {
      await ctx.db.insert('agentAccessOAuthGrants', args.grant)
    }
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
    const row = args.kind === 'device'
      ? await ctx.db.query('agentAccessOAuthGrants')
        .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', args.hash))
        .unique()
      : args.kind === 'user'
        ? await ctx.db.query('agentAccessOAuthGrants')
          .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', args.hash))
          .unique()
        : await ctx.db.query('agentAccessOAuthGrants')
          .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', args.hash))
          .unique()
    return row === null ? null : grantFromDocument(row)
  },
})

export const getGrantByRef = query({
  args: { grantRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceRead(args)
    const row = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
      .unique()
    return row === null ? null : grantFromDocument(row)
  },
})

export const updateGrant = mutation({
  args: { grantRef: v.string(), expectedStatus: status, patch: grantPatch, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const existing = await ctx.db
      .query('agentAccessOAuthGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
      .unique()
    if (existing === null || existing.status !== args.expectedStatus) return null

    await assertGrantHashesAvailable(ctx.db, args.patch, existing._id)
    const update = grantPatchDocument(args.patch)
    await ctx.db.patch(existing._id, update)
    const updated = await ctx.db.get(existing._id)
    return updated === null ? null : grantFromDocument(updated)
  },
})

export const insertClient = mutation({
  args: { client, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    const existing = await ctx.db
      .query('agentAccessOAuthClients')
      .withIndex('by_clientId', (query) => query.eq('clientId', args.client.clientId))
      .unique()
    if (existing !== null && !sameClientMaterial(existing, args.client)) {
      throw new Error('agent_access_oauth_client_conflict')
    }
    if (existing === null) {
      await ctx.db.insert('agentAccessOAuthClients', args.client)
    }
    return null
  },
})

export const getClient = query({
  args: { clientId: v.string() },
  returns: v.union(client, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('agentAccessOAuthClients')
      .withIndex('by_clientId', (query) => query.eq('clientId', args.clientId))
      .unique()
    return row === null ? null : clientFromDocument(row)
  },
})

type OAuthGrantMaterial = Omit<Doc<'agentAccessOAuthGrants'>, '_id' | '_creationTime'>
type OAuthClientMaterial = Omit<Doc<'agentAccessOAuthClients'>, '_id' | '_creationTime'>
type OAuthDatabaseReader = GenericDatabaseReader<DataModel>

async function assertGrantHashesAvailable(
  db: OAuthDatabaseReader,
  candidate: Pick<OAuthGrantMaterial, 'deviceCodeHash' | 'userCodeHash' | 'authorizationCodeHash'>,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  if (candidate.deviceCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'device', candidate.deviceCodeHash, allowedId)
  }
  if (candidate.userCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'user', candidate.userCodeHash, allowedId)
  }
  if (candidate.authorizationCodeHash !== undefined) {
    await assertGrantHashAvailable(db, 'authorization', candidate.authorizationCodeHash, allowedId)
  }
}

async function assertGrantHashAvailable(
  db: OAuthDatabaseReader,
  kind: 'device' | 'user' | 'authorization',
  hash: string,
  allowedId: Doc<'agentAccessOAuthGrants'>['_id'] | undefined,
): Promise<void> {
  const existing = kind === 'device'
    ? await db.query('agentAccessOAuthGrants')
      .withIndex('by_deviceCodeHash', (query) => query.eq('deviceCodeHash', hash))
      .unique()
    : kind === 'user'
      ? await db.query('agentAccessOAuthGrants')
        .withIndex('by_userCodeHash', (query) => query.eq('userCodeHash', hash))
        .unique()
      : await db.query('agentAccessOAuthGrants')
        .withIndex('by_authorizationCodeHash', (query) => query.eq('authorizationCodeHash', hash))
        .unique()
  if (existing !== null && existing._id !== allowedId) {
    throw new Error('agent_access_oauth_grant_conflict')
  }
}

function sameGrantMaterial(left: OAuthGrantMaterial, right: OAuthGrantMaterial): boolean {
  return left.grantRef === right.grantRef
    && left.flow === right.flow
    && left.clientId === right.clientId
    && left.redirectUri === right.redirectUri
    && sameStringArray(left.requestedScopes, right.requestedScopes)
    && sameRequestedAccess(left.requestedAccess, right.requestedAccess)
    && left.codeChallenge === right.codeChallenge
    && left.codeChallengeMethod === right.codeChallengeMethod
    && left.deviceCodeHash === right.deviceCodeHash
    && left.userCodeHash === right.userCodeHash
    && left.authorizationCodeHash === right.authorizationCodeHash
    && left.status === right.status
    && left.ownerId === right.ownerId
    && left.keyId === right.keyId
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.approvedAt === right.approvedAt
    && left.consumedAt === right.consumedAt
    && left.nextPollAt === right.nextPollAt
    && left.deliveryClaimToken === right.deliveryClaimToken
    && left.displayName === right.displayName
    && left.denialReason === right.denialReason
}

function sameClientMaterial(left: OAuthClientMaterial, right: OAuthClientMaterial): boolean {
  return left.clientId === right.clientId
    && left.clientName === right.clientName
    && sameStringArray(left.redirectUris, right.redirectUris)
    && sameStringArray(left.grantTypes, right.grantTypes)
    && left.tokenEndpointAuthMethod === right.tokenEndpointAuthMethod
    && left.createdAt === right.createdAt
    && left.lastUsedAt === right.lastUsedAt
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

type OAuthRequestedAccessMaterial = OAuthGrantMaterial['requestedAccess']

function sameRequestedAccess(
  left: OAuthRequestedAccessMaterial,
  right: OAuthRequestedAccessMaterial,
): boolean {
  const sameAmount = (
    leftAmount: OAuthRequestedAccessMaterial['maximumSpendPerInvocation'],
    rightAmount: OAuthRequestedAccessMaterial['maximumSpendPerInvocation'],
  ): boolean => leftAmount === undefined || rightAmount === undefined
    ? leftAmount === rightAmount
    : leftAmount.currency === rightAmount.currency
      && leftAmount.units === rightAmount.units
      && leftAmount.exponent === rightAmount.exponent
  return left.environment === right.environment
    && sameAmount(left.maximumSpendPerInvocation, right.maximumSpendPerInvocation)
    && sameAmount(left.maximumDailySpend, right.maximumDailySpend)
    && sameAmount(left.maximumMonthlySpend, right.maximumMonthlySpend)
    && left.maximumConcurrentInvocations === right.maximumConcurrentInvocations
    && left.maximumCallsPerMinute === right.maximumCallsPerMinute
    && left.maximumCallsPerHour === right.maximumCallsPerHour
    && left.expiresInSeconds === right.expiresInSeconds
}

function grantPatchDocument(patch: Partial<OAuthGrantMaterial>): Partial<OAuthGrantMaterial> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<OAuthGrantMaterial>
}

function grantFromDocument(row: Doc<'agentAccessOAuthGrants'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

function clientFromDocument(row: Doc<'agentAccessOAuthClients'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

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
