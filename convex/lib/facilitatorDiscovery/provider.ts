import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createX402ProviderConnection, isCanonicalCredentiallessX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { FACILITATOR_DISCOVERY_PUBLISHER_REF } from '@/modules/capability-supply/convex'
import type { Id } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { toDomain, toRow } from '../providerConnections/lifecycle'
import { SYSTEM_WORKLOAD_ACCOUNT_REF } from '../workloadCron/context'
import { providerRouteabilityIsFrozen } from '../providerOffboardingFreeze'
import { BUSINESS_SOURCE_KIND, SOURCE_EVIDENCE } from './contracts'
import type { RouteIdentity } from './identity'

export async function ensureProviderBusiness(
  ctx: MutationCtx,
  host: string,
  now: number,
): Promise<Readonly<{ businessId: Id<'businesses'>; created: boolean; activated: boolean }> | undefined> {
  const businessSlug = providerBusinessSlug(host)
  const existingBusiness = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', businessSlug)).unique()
  if (existingBusiness !== null) {
    if (existingBusiness.suppressedAt !== undefined) return undefined
    if (existingBusiness.businessContext.kind !== 'programmable_provider'
      || existingBusiness.businessContext.providerIdentifier !== `provider:x402:${host}`) return undefined
    if (await providerRouteabilityIsFrozen(ctx, existingBusiness._id)) {
      return { businessId: existingBusiness._id, created: false, activated: false }
    }
    const activated = existingBusiness.publicStatus !== 'published'
    if (activated) await ctx.db.patch(existingBusiness._id, { publicStatus: 'published', updatedAt: now })
    return { businessId: existingBusiness._id, created: false, activated }
  }
  const sourceHash = canonicalDigest({ kind: BUSINESS_SOURCE_KIND, host })
  const businessId = await ctx.db.insert('businesses', {
    owningAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    slug: businessSlug,
    name: `x402 ${host}`,
    normalizedName: `x402 ${host}`.toLowerCase(),
    category: 'programmable provider',
    businessContext: {
      kind: 'programmable_provider',
      website: `https://${host}`,
      providerIdentifier: `provider:x402:${host}`,
    },
    publicStatus: 'published',
    trustTier: 'registry_verified',
    sourceHash,
    createdAt: now,
    updatedAt: now,
  })
  return { businessId, created: true, activated: false }
}

function providerBusinessSlug(host: string): string {
  const token = host.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase()
  return `x402-${(token || 'provider').slice(0, 160)}-${canonicalDigest(host).slice(7, 19)}`
}

export async function ensureProviderConnection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  route: RouteIdentity,
  now: number,
) {
  const { resourceUrl, method, payee } = route
  const parsed = new URL(resourceUrl)
  const identity = { businessId: String(businessId), resourceUrl }
  const connectionRef = `connection:x402:${canonicalDigest(identity)}`
  const providerRef = `provider:x402:${parsed.host.toLowerCase()}`
  const providerAccountRef = `x402:${resourceUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  if (existing !== null) {
    const connection = toDomain(existing)
    return connection.lifecycle === 'active'
      && connection.businessId === String(businessId)
      && connection.providerRef === providerRef
      && connection.providerAccountRef === providerAccountRef
      && isCanonicalCredentiallessX402ProviderConnection(connection)
      ? connection
      : undefined
  }
  const business = await ctx.db.get(businessId)
  if (business === null) return undefined
  const commandId = `facilitator-discovery:connection:${canonicalDigest(identity).slice(7)}`
  const result = createX402ProviderConnection({
    commandId,
    connectionRef,
    businessId: String(businessId),
    providerRef,
    providerAccountRef,
    resourceUrl,
    method,
    payee,
    evidenceRefs: [SOURCE_EVIDENCE],
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
    authorityGrantRef: `observed:${FACILITATOR_DISCOVERY_PUBLISHER_REF}`,
    authorityGrantGeneration: 1,
  }, now)
  if (result.kind !== 'applied') return undefined
  await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, commandId, result.commandDigest))
  return result.connection
}
