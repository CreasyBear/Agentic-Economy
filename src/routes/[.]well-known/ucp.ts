import { createFileRoute } from '@tanstack/react-router'

import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildSiteDiscoveryManifest } from '@/modules/discovery/public'

/**
 * Site-level agent entry point. `/{slug}/ucp` only helps an agent that already
 * knows a business; this is the document a cold agent reads first. It is a pure
 * projection of the route and contract lists that already govern llms.txt,
 * SKILL.md, and the developer discovery surface, so it needs no source read.
 */
export const Route = createFileRoute('/.well-known/ucp')({
  server: {
    handlers: {
      GET: ({ request }) => handleSiteDiscoveryManifestRequest(request),
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

export function handleSiteDiscoveryManifestRequest(request: Request): Response {
  return discoveryJsonResponse(
    buildSiteDiscoveryManifest({
      canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
      now: Date.now(),
    })
  )
}
