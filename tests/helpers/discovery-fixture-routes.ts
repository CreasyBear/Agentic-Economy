import { resolveCanonicalBaseUrl } from '../../src/lib/server/canonical-url'
import { problem } from '../../src/lib/server/problem'
import { discoveryTextResponse, discoveryJsonResponse } from '../../src/lib/http/discovery-response'
import {
  buildOfferingDiscoveryManifest,
  buildLlmsTxt,
  buildSitemapXml,
  type OfferingDiscoveryManifestContract,
  type DiscoverySourceState,
} from '../../src/modules/discovery/public'
import { getPublicBusinessCatalog } from '../../src/modules/catalog/public'
import { readCatalogHealth } from '../../src/modules/registry/public'
import { createFixtureDiscoverySourceState } from './discovery-fixture-source-state'

export function handleLlmsTxtRequest(request: Request): Response {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const result = buildLlmsTxt(createFixtureDiscoverySourceState(), {
    canonicalBaseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || canonicalBaseUrl,
  })
  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

export function handleSitemapXmlRequest(request: Request): Response {
  const result = buildSitemapXml(createFixtureDiscoverySourceState(), {
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })
  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

export function handleUcpManifestRequest(request: Request, slug: string, state: DiscoverySourceState): Response {
  const business = state.businesses.find((candidate) => candidate.slug === slug)
  const catalog = business === undefined
    ? undefined
    : getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: readCatalogHealth(state, business.businessId).indexStatus,
        discoveryStatus: 'available',
      })
  const result = buildOfferingDiscoveryManifest({
    ...(catalog?.kind === 'available' ? { business: catalog.catalog } : {}),
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })
  if (result.kind === 'hidden') return problem({
    status: 404,
    kind: 'NOT_FOUND',
    code: 'discovery_manifest_not_found',
    detail: 'No public discovery manifest exists for this slug.',
  })
  return discoveryJsonResponse(toPublicUcpManifest(result.manifest))
}

type PublicUcpManifest = Omit<OfferingDiscoveryManifestContract, 'businessId'>

function toPublicUcpManifest(manifest: OfferingDiscoveryManifestContract): PublicUcpManifest {
  const { businessId: _businessId, ...publicManifest } = manifest
  return publicManifest
}
