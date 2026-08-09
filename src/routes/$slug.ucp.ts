import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import { readPublicOfferingDiscoveryManifest } from '@/modules/discovery/discovery.functions'
import {
  readFixtureCatalogDiscoveryManifest,
} from '@/modules/discovery/public'
import type {
  DiscoveryManifestContract,
  OfferingDiscoveryManifestContract,
} from '@/modules/discovery/public'

type PublicUcpManifest = Omit<DiscoveryManifestContract, 'businessId' | 'sourceHash'>
type PublicOfferingUcpManifest = Omit<OfferingDiscoveryManifestContract, 'businessId'>

export const Route = createFileRoute('/$slug/ucp')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleDurableUcpManifestRequest(request, params.slug),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export async function handleDurableUcpManifestRequest(request: Request, slug: string): Promise<Response> {
  const result = await readPublicOfferingDiscoveryManifest({
    slug,
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return problem({
      status: 404,
      kind: 'NOT_FOUND',
      code: 'discovery_manifest_not_found',
      detail: 'No public discovery manifest exists for this slug.',
    })
  }

  return discoveryJsonResponse(toPublicOfferingUcpManifest(result.manifest))
}

export function handleUcpManifestRequest(request: Request, slug: string): Response {
  const result = readFixtureCatalogDiscoveryManifest({
    slug,
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return problem({
      status: 404,
      kind: 'NOT_FOUND',
      code: 'discovery_manifest_not_found',
      detail: 'No public discovery manifest exists for this slug.',
    })
  }

  return discoveryJsonResponse(toPublicUcpManifest(result.manifest))
}

function toPublicUcpManifest(manifest: DiscoveryManifestContract): PublicUcpManifest {
  const { businessId: _businessId, sourceHash: _sourceHash, ...publicManifest } = manifest
  return publicManifest
}

function toPublicOfferingUcpManifest(manifest: OfferingDiscoveryManifestContract): PublicOfferingUcpManifest {
  const { businessId: _businessId, ...publicManifest } = manifest
  return publicManifest
}
