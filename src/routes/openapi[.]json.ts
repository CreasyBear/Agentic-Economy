import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { buildOpenApiDocument } from '@/modules/discovery/public'

/**
 * OpenAPI 3.1 document for the public HTTP surface (Well 8 Lane E). Like
 * `/.well-known/api-catalog` and `/.well-known/ucp`, this is a pure
 * projection of contract lists that already govern other public surfaces -
 * no source read, so the same deterministic-given-origin shape a public
 * discovery file gets.
 */
export const Route = createFileRoute('/openapi.json')({
  server: {
    handlers: {
      GET: ({ request }) => handleOpenApiDocumentRequest(request),
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

export function handleOpenApiDocumentRequest(request: Request): Response {
  const document = buildOpenApiDocument({ canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl })
  return Response.json(document, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}
