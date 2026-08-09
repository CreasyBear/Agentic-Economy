import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registrySearchAction } from '@/modules/registry/registry.actions'
import { runRegistrySearchRequest } from './api.businesses'
export { optionalHasPrice, optionalMaxPrice } from '@/lib/http/search-query'

export const Route = createFileRoute('/api/businesses/search')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableSearchBusinessesRequest(request)),
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

export async function handleDurableSearchBusinessesRequest(request: Request): Promise<Response> {
  return runRegistrySearchRequest(request, registrySearchAction)
}

