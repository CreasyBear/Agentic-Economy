import { v, type ObjectType } from 'convex/values'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { sourceWriteArgs } from '../../../sourceWriteAdmission'
import { requireOAuthSourceWrite, sameStringArray } from './shared'

const client = v.object({
  clientId: v.string(), clientName: v.string(), redirectUris: v.array(v.string()),
  grantTypes: v.array(v.union(v.literal('authorization_code'), v.literal('urn:ietf:params:oauth:grant-type:device_code'), v.literal('refresh_token'))),
  tokenEndpointAuthMethod: v.literal('none'), createdAt: v.number(), lastUsedAt: v.optional(v.number()),
})

export const insertClientArgs = { client, operationKey: v.string(), correlationId: v.string(), ...sourceWriteArgs }
export const insertClientResult = v.null()
export async function insertClientHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof insertClientArgs>,
) {
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
}

export const getClientArgs = { clientId: v.string() }
export const getClientResult = v.union(client, v.null())
export async function getClientHandler(
  ctx: QueryCtx,
  args: ObjectType<typeof getClientArgs>,
) {
  const row = await ctx.db
    .query('agentAccessOAuthClients')
    .withIndex('by_clientId', (query) => query.eq('clientId', args.clientId))
    .unique()
  return row === null ? null : clientFromDocument(row)
}

type OAuthClientMaterial = Omit<Doc<'agentAccessOAuthClients'>, '_id' | '_creationTime'>

function sameClientMaterial(left: OAuthClientMaterial, right: OAuthClientMaterial): boolean {
  return left.clientId === right.clientId
    && left.clientName === right.clientName
    && sameStringArray(left.redirectUris, right.redirectUris)
    && sameStringArray(left.grantTypes, right.grantTypes)
    && left.tokenEndpointAuthMethod === right.tokenEndpointAuthMethod
    && left.createdAt === right.createdAt
    && left.lastUsedAt === right.lastUsedAt
}

function clientFromDocument(row: Doc<'agentAccessOAuthClients'>) {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}
