import { resolveCanonicalBaseUrl } from '../../src/lib/server/canonical-url'
import { problem } from '../../src/lib/server/problem'
import { discoveryTextResponse, discoveryJsonResponse } from '../../src/lib/http/discovery-response'
import {
  buildLlmsTxt,
  buildSitemapXml,
  regenerateDiscoveryManifest,
  type DiscoveryManifestContract,
  type ReadCatalogDiscoveryManifestInput,
  type DiscoverySourceState,
} from '../../src/modules/discovery/public'
import {
  createFixtureDiscoverySourceState,
  testOnlyDiscoveryManifestAdapter,
} from './discovery-fixture-source-state'

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
  const input: ReadCatalogDiscoveryManifestInput = {
    slug,
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  }
  const result = regenerateDiscoveryManifest(
    state,
    { slug: input.slug },
    {
      canonicalBaseUrl: input.canonicalBaseUrl,
      now: input.now,
      adapter: testOnlyDiscoveryManifestAdapter,
    },
  )
  if (result.kind === 'error') {
    return result.code === 'discovery_manifest_not_public'
      ? problem({
          status: 404,
          kind: 'NOT_FOUND',
          code: 'discovery_manifest_not_found',
          detail: 'No public discovery manifest exists for this slug.',
        })
      : problem({
          kind: 'UNAVAILABLE',
          code: 'discovery_manifest_unavailable',
          detail: 'The discovery manifest could not be generated.',
          retryable: result.retryable,
        })
  }
  return discoveryJsonResponse(toPublicUcpManifest(result.manifest))
}

type PublicUcpManifest = Omit<DiscoveryManifestContract, 'businessId' | 'sourceHash'>

function toPublicUcpManifest(manifest: DiscoveryManifestContract): PublicUcpManifest {
  const { businessId: _businessId, sourceHash: _sourceHash, ...publicManifest } = manifest
  return publicManifest
}

