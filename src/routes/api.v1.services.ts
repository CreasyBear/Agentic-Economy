import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { registryServicesListAction } from '@/modules/registry/registry.actions'
import { runRegistryListRequest } from './api.businesses'


export const Route = createFileRoute('/api/v1/services')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleDurableListServicesRequest(request)),
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

export async function handleDurableListServicesRequest(request: Request): Promise<Response> {
  return runRegistryListRequest(request, { collection: 'services', action: registryServicesListAction })
}
