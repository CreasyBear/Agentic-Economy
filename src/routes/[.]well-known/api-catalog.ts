import { createFileRoute } from '@tanstack/react-router'

import { discoveryLinksetJsonResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildApiCatalogDocument } from '@/modules/discovery/public'

/**
 * RFC 9727 machine-readable api-catalog linkset. Like `/.well-known/ucp`,
 * this is a pure projection of the route and contract lists that already
 * govern the site manifest, llms.txt, SKILL.md, and the developer discovery
 * surface, so it needs no source read.
 */
export const Route = createFileRoute('/.well-known/api-catalog')({
  server: {
    handlers: {
      GET: ({ request }) => handleApiCatalogRequest(request),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: ({ request }) => {
        const response = handleApiCatalogRequest(request)
        return new Response(null, { status: response.status, headers: response.headers })
      },
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export function handleApiCatalogRequest(request: Request): Response {
  const response = discoveryLinksetJsonResponse(
    buildApiCatalogDocument({ canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl }),
  )
  response.headers.set('Link', '</.well-known/api-catalog>; rel="api-catalog"')
  return response
}
