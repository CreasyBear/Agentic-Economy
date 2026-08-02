import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { registrySearchAction } from '@/modules/registry/registry.actions'
import { runRegistrySearchRequest } from './api.businesses'
export { optionalHasPrice, optionalMaxPriceMinor } from '@/lib/http/search-query'

export const Route = createFileRoute('/api/businesses/search')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableSearchBusinessesRequest(request)),
    },
  },
})

export async function handleDurableSearchBusinessesRequest(request: Request): Promise<Response> {
  return runRegistrySearchRequest(request, registrySearchAction)
}

