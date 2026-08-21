import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registryServicesSearchAction } from '@/modules/registry/registry.actions'
import { runRegistrySearchRequest } from './api.businesses'

export const Route = createFileRoute('/api/v1/services/search')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableSearchServicesRequest(request)),
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

export async function handleDurableSearchServicesRequest(request: Request): Promise<Response> {
  return runRegistrySearchRequest(request, registryServicesSearchAction)
}
