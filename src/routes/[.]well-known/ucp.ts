import { createFileRoute } from '@tanstack/react-router'

import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildSiteDiscoveryManifest, projectCompactSiteDiscoveryManifest } from '@/modules/discovery/public'

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
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: ({ request }) => handleSiteDiscoveryManifestRequest(request, true),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export function handleSiteDiscoveryManifestRequest(request: Request, head = false): Response {
  const manifest = buildSiteDiscoveryManifest({
      canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
      now: Date.now(),
    })
  const body = new URL(request.url).searchParams.get('technical') === '1'
    ? manifest
    : projectCompactSiteDiscoveryManifest(manifest)
  const response = discoveryJsonResponse(body)
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}
