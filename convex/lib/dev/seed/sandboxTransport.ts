import { degradeBackend } from '@/lib/observability/degrade-backend'
import { createX402ProviderConnection, isCanonicalCredentiallessX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Id } from '../../../_generated/dataModel'
import { env, type MutationCtx } from '../../../_generated/server'
import { toDomain, toRow } from '../../capabilitySupply/providerConnections/lifecycle'
import { DEV_SEED_CATALOG_GRANT_REF, DEV_SEED_CATALOG_PRINCIPAL_REF } from './authority'
import { SANDBOX_TESTNET_BUSINESS_SLUG, SANDBOX_TESTNET_CONNECTION_REF, SANDBOX_TESTNET_ORIGIN_ENV, SANDBOX_TESTNET_PROVIDER_REF, SANDBOX_TESTNET_ROUTE_PATH } from './sandboxTestnet'

export function readSeedEnvironmentValue(name: string): string | undefined {
  const value = (env as Readonly<Record<string, string | undefined>>)[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

export function sandboxTestnetEndpointUrl(): string | undefined {
  const origin = readSeedEnvironmentValue(SANDBOX_TESTNET_ORIGIN_ENV)
  if (origin === undefined) return undefined
  try {
    const url = new URL(SANDBOX_TESTNET_ROUTE_PATH, origin)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'sandboxTestnetEndpointUrl', reason: 'invalid_response' })
  }
}

/**
 * The credential-less x402 provider connection the binding's authority names.
 *
 * `x402-fetch:v2` never admits a keyless binding (transport-adapters.ts), so a
 * real x402 Tool needs a provider connection row exactly as facilitator
 * discovery mints one for a discovered x402 resource. Nothing secret is stored:
 * the connection carries the resource URL and the payee only.
 */
export async function ensureSandboxTestnetProviderConnection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  endpointUrl: string,
  payTo: string,
  now: number,
): Promise<void> {
  const providerAccountRef = `x402:${endpointUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', SANDBOX_TESTNET_CONNECTION_REF))
    .unique()
  if (existing !== null) {
    const connection = toDomain(existing)
    if (connection.lifecycle === 'active'
      && connection.businessId === String(businessId)
      && connection.providerRef === SANDBOX_TESTNET_PROVIDER_REF
      && connection.providerAccountRef === providerAccountRef
      && isCanonicalCredentiallessX402ProviderConnection(connection)) return
    // The fixture moved or was revoked. Say so instead of publishing a Tool
    // bound to authority that no longer describes the endpoint.
    throw new Error('dev_seed_sandbox_testnet_connection_stale')
  }
  const business = await ctx.db.get(businessId)
  if (business === null) throw new Error('dev_seed_sandbox_testnet_business_missing')
  const commandId = `dev-seed:sandbox-testnet-connection:${canonicalDigest({ endpointUrl, payTo }).slice(7)}`
  const created = createX402ProviderConnection({
    commandId,
    connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
    businessId: String(businessId),
    providerRef: SANDBOX_TESTNET_PROVIDER_REF,
    providerAccountRef,
    resourceUrl: endpointUrl,
    method: 'POST',
    payee: payTo,
    evidenceRefs: [`private:evidence:dev-seed:${SANDBOX_TESTNET_BUSINESS_SLUG}`],
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: DEV_SEED_CATALOG_PRINCIPAL_REF,
    authorityGrantRef: DEV_SEED_CATALOG_GRANT_REF,
    authorityGrantGeneration: 1,
  }, now)
  if (created.kind !== 'applied') {
    throw new Error(`dev_seed_sandbox_testnet_connection_${created.kind === 'refused' ? created.code : created.kind}`)
  }
  await ctx.db.insert(
    'capabilityProviderConnections',
    toRow(created.connection, commandId, created.commandDigest),
  )
}
