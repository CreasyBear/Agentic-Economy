import { ConvexError, v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
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
  handler: async (_ctx, args) => ({
    deleted: 0,
    cutoff: (args.now !== undefined && Number.isFinite(args.now) ? args.now : Date.now()) - 60 * 60 * 1_000,
    rescheduled: false,
  }),
})

export const insertGrant = mutation({
  args: { grant, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
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
  handler: async (_ctx, args) => {
    await requireOAuthSourceRead(args)
    return null
  },
})

export const getGrantByRef = query({
  args: { grantRef: v.string(), operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (_ctx, args) => {
    await requireOAuthSourceRead(args)
    return null
  },
})

export const updateGrant = mutation({
  args: { grantRef: v.string(), expectedStatus: status, patch: grantPatch, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    return null
  },
})

export const insertClient = mutation({
  args: { client, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOAuthSourceWrite(ctx, args)
    return null
  },
})

export const getClient = query({
  args: { clientId: v.string() },
  returns: v.union(client, v.null()),
  handler: async () => null,
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
