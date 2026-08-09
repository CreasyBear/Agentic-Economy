import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/sandbox/providers/route-resolver')({
  server: {
    handlers: {
      GET: ({ request }) => readSandboxRouteProviderDiscovery('resolver', request),
      POST: ({ request }) => handleSandboxRouteProviderRequest('resolver', request),
      PUT: () => methodNotAllowed(['GET', 'POST']),
      PATCH: () => methodNotAllowed(['GET', 'POST']),
      DELETE: () => methodNotAllowed(['GET', 'POST']),
      HEAD: () => methodNotAllowed(['GET', 'POST']),
      OPTIONS: () => methodNotAllowed(['GET', 'POST']),
      TRACE: () => methodNotAllowed(['GET', 'POST']),
      CONNECT: () => methodNotAllowed(['GET', 'POST']),
    },
  },
})
