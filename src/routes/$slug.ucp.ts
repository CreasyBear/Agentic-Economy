import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import { readPublicCatalogDiscoveryManifest } from '@/modules/discovery/discovery.functions'
import {
  readFixtureCatalogDiscoveryManifest,
} from '@/modules/discovery/public'
import type {
  DiscoveryManifestContract,
} from '@/modules/discovery/public'

type PublicUcpManifest = Omit<DiscoveryManifestContract, 'businessId' | 'sourceHash'>

export const Route = createFileRoute('/$slug/ucp')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleDurableUcpManifestRequest(request, params.slug),
    },
  },
})

export async function handleDurableUcpManifestRequest(request: Request, slug: string): Promise<Response> {
  const result = await readPublicCatalogDiscoveryManifest({
    slug,
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return discoveryJsonResponse(
      {
        kind: 'not_found',
        code: 'discovery_manifest_not_found',
        reason: 'No public discovery manifest exists for this slug.',
      },
      { status: 404 }
    )
  }

  return discoveryJsonResponse(toPublicUcpManifest(result.manifest))
}

export function handleUcpManifestRequest(request: Request, slug: string): Response {
  const result = readFixtureCatalogDiscoveryManifest({
    slug,
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return discoveryJsonResponse(
      {
        kind: 'not_found',
        code: 'discovery_manifest_not_found',
        reason: 'No public discovery manifest exists for this slug.',
      },
      { status: 404 }
    )
  }

  return discoveryJsonResponse(toPublicUcpManifest(result.manifest))
}

function toPublicUcpManifest(manifest: DiscoveryManifestContract): PublicUcpManifest {
  const { businessId: _businessId, sourceHash: _sourceHash, ...publicManifest } = manifest
  return publicManifest
}

