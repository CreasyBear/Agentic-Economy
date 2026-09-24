import { FACILITATOR_DISCOVERY_PUBLISHER_REF, parseFacilitatorDiscoverySourceImport, sourceRouteRef } from '@/modules/capability-supply/convex'
import { isRecord } from '@/modules/common/is-record'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { FacilitatorDiscoveryAdmissionItem } from './contracts'

/** Adopt an existing discovery identity only after exact transport/payment agreement. */
export async function preservePublicationIdentity(ctx: MutationCtx, draft: FacilitatorDiscoveryAdmissionItem): Promise<FacilitatorDiscoveryAdmissionItem> {
  const source = parseFacilitatorDiscoverySourceImport(draft.sourceImportJson)
  if (source === undefined || !isRecord(source.resource)) return draft
  const route = routeIdentity(source)
  if (route === undefined) return draft
  const ref = sourceRouteRef({ sourceKind: 'x402', sourceSelector: { resourceUrl: route.resourceUrl }, sourceDescriptorJson: JSON.stringify(source.resource), endpointUrl: route.resourceUrl })
  if (ref === undefined) return draft
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_sourceRouteRef_and_disposition', (q) => q.eq('sourceRouteRef', ref).eq('disposition', 'current')).take(16)
  const matches = []
  for (const publication of publications) {
    if (publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF || publication.authorityMode !== 'observed_external') continue
    const binding = await ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId)).unique()
    if (binding === null || binding.endpointUrl !== route.resourceUrl) continue
    let config: unknown
    try { config = JSON.parse(binding.configJson) } catch (cause) { degradeBackend(cause, undefined, { site: 'preservePublicationIdentity', reason: 'invalid_response' }); continue }
    if (!isRecord(config) || config.method !== route.method || config.network !== source.resource.network
      || typeof config.asset !== 'string' || typeof source.resource.asset !== 'string'
      || config.asset.toLowerCase() !== source.resource.asset.toLowerCase()) continue
    matches.push(publication)
  }
  const existing = matches.length === 1 ? matches[0] : undefined
  if (existing === undefined || existing.publicationRef === draft.offering.offeringId) return draft
  return {
    ...draft,
    offering: { ...draft.offering, offeringId: existing.publicationRef },
    binding: { ...draft.binding, bindingId: existing.bindingId },
    sourceImportJson: JSON.stringify({
      ...source,
      contract: { ...source.contract, capabilityId: existing.capabilityId, version: existing.version },
      commercial: { ...source.commercial, offering: { ...source.commercial.offering, offeringId: existing.publicationRef }, bindingId: existing.bindingId },
    }),
  }
}

export function facilitatorRuntimeEnvironment(
  sourceImport: Readonly<{ resource: unknown }>,
): 'sandbox' | 'production' | undefined {
  const resource = isRecord(sourceImport.resource) ? sourceImport.resource : undefined
  if (resource?.network === 'eip155:8453') return 'production'
  if (resource?.network === 'eip155:84532') return 'sandbox'
  return undefined
}

export function routeIdentity(
  sourceImport: Readonly<{ resource: unknown }>,
): Readonly<{
  host: string
  resourceUrl: string
  method: 'GET' | 'POST'
  payee: string
}> | undefined {
  const resource = isRecord(sourceImport.resource) ? sourceImport.resource : undefined
  const rawUrl = typeof resource?.resourceUrl === 'string' ? resource.resourceUrl : undefined
  const method = resource?.method
  const payee = resource?.payTo
  if (rawUrl === undefined
    || (method !== 'GET' && method !== 'POST')
    || typeof payee !== 'string'
    || !/^0x[0-9a-f]{40}$/iu.test(payee)) return undefined
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '') return undefined
    return { host: parsed.host.toLowerCase(), resourceUrl: parsed.toString(), method, payee }
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'routeIdentity', reason: 'invalid_response' })
  }
}

export type RouteIdentity = NonNullable<ReturnType<typeof routeIdentity>>
