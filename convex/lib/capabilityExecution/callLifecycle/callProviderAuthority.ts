import type { QueryCtx } from '../../../_generated/server'
import {
  isCanonicalCredentiallessX402ProviderConnection,
  validateProviderConnectionAuthority,
  type ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import { validPublicHttpsEndpoint } from '@/modules/capability-supply/public'

export async function readProviderLeaseAuthorityHandler(
  ctx: QueryCtx,
  args: { connectionRef: string; authorityGeneration: number },
) {
  const [connection, approval] = await Promise.all([
    ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
      .unique(),
    ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_connectionRef_and_authorityGeneration', (query) => (
        query.eq('connectionRef', args.connectionRef).eq('authorityGeneration', args.authorityGeneration)
      ))
      .unique(),
  ])
  if (
    connection === null
    || approval === null
    || connection.lifecycle !== 'active'
    || connection.authorityGeneration !== args.authorityGeneration
    || approval.decision !== 'granted'
  ) return null
  return {
    connectionRef: connection.connectionRef,
    providerRef: connection.providerRef,
    providerAccountRef: connection.providerAccountRef,
    adapterId: connection.adapterId,
    authorityGeneration: connection.authorityGeneration,
    authorityDigest: connection.authorityDigest,
    grantedScopes: connection.grantedScopes,
    grantedResources: connection.grantedResources,
    approvalDecisionRef: approval.decisionRef,
    approvalDecisionDigest: approval.decisionDigest,
  }
}

export async function readCurrentProviderConnectionAuthorityHandler(
  ctx: QueryCtx,
  args: Readonly<{
    connectionRef: string
    providerRef: string
    adapterId: string
    authorityGeneration: number
    authorityDigest: string
    resourceUrl: string
    now: number
  }>,
) {
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef))
    .unique()
  if (connection === null) return null
  const current: ProviderConnection = {
    ...connection,
    businessId: String(connection.businessId),
  }
  const exactAuthority = [
    current.connectionRef === args.connectionRef,
    current.providerRef === args.providerRef,
    current.adapterId === args.adapterId,
    validateProviderConnectionAuthority(
      current,
      args.authorityGeneration,
      args.authorityDigest,
      args.now,
    ).kind === 'valid',
  ].every(Boolean)
  if (!exactAuthority) return null
  if (!isCanonicalCredentiallessX402ProviderConnection(current)) {
    return { kind: 'credentialed' as const }
  }
  const resource = validPublicHttpsEndpoint(args.resourceUrl)
  return [
    resource !== undefined,
    resource?.hash === '',
    current.grantedResources.length === 1,
    current.grantedResources[0] === resource?.toString(),
  ].every(Boolean)
    ? { kind: 'credentialless_x402' as const }
    : null
}
