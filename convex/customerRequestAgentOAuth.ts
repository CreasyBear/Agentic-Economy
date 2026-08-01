import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc } from './_generated/dataModel'

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
type GrantRow = Doc<'customerRequestAgentOAuthGrants'>
type GrantHashKind = 'device' | 'user' | 'authorization'
type ClientRow = Doc<'customerRequestAgentOAuthClients'>

export const insertGrant = mutation({
  args: { grant },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grant.grantRef)).unique()
    if (existing === null) await ctx.db.insert('customerRequestAgentOAuthGrants', args.grant)
    return null
  },
})

export const getGrantByHash = query({
  args: { kind: v.union(v.literal('device'), v.literal('user'), v.literal('authorization')), hash: v.string() },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    const hashIndex: GrantHashKind = args.kind
    const row = hashIndex === 'device'
      ? await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_deviceCodeHash', (q) => q.eq('deviceCodeHash', args.hash)).unique()
      : hashIndex === 'user'
        ? await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_userCodeHash', (q) => q.eq('userCodeHash', args.hash)).unique()
        : await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_authorizationCodeHash', (q) => q.eq('authorizationCodeHash', args.hash)).unique()
    return row === null ? null : withoutSystemFields(row)
  },
})

export const getGrantByRef = query({
  args: { grantRef: v.string() },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grantRef)).unique()
    return row === null ? null : withoutSystemFields(row)
  },
})

export const updateGrant = mutation({
  args: { grantRef: v.string(), expectedStatus: status, patch: grantPatch },
  returns: v.union(grant, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestAgentOAuthGrants').withIndex('by_grantRef', (q) => q.eq('grantRef', args.grantRef)).unique()
    if (row === null || row.status !== args.expectedStatus) return null
    await ctx.db.patch(row._id, args.patch)
    return withoutSystemFields({ ...row, ...args.patch })
  },
})

export const insertClient = mutation({
  args: { client },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('customerRequestAgentOAuthClients').withIndex('by_clientId', (q) => q.eq('clientId', args.client.clientId)).unique()
    if (existing === null) await ctx.db.insert('customerRequestAgentOAuthClients', args.client)
    return null
  },
})

export const getClient = query({
  args: { clientId: v.string() },
  returns: v.union(client, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('customerRequestAgentOAuthClients').withIndex('by_clientId', (q) => q.eq('clientId', args.clientId)).unique()
    return row === null ? null : withoutClientSystemFields(row)
  },
})

function withoutSystemFields(row: GrantRow): Omit<GrantRow, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}

function withoutClientSystemFields(row: ClientRow): Omit<ClientRow, '_id' | '_creationTime'> {
  const { _id, _creationTime, ...value } = row
  return value
}
