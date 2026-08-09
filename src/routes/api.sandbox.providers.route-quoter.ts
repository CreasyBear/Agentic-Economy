import { createFileRoute } from '@tanstack/react-router'

import {
  handleSandboxRouteProviderRequest,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/sandbox/providers/route-quoter')({
  server: {
    handlers: {
      GET: ({ request }) => readSandboxRouteProviderDiscovery('quoter', request),
      POST: ({ request }) => handleSandboxRouteProviderRequest('quoter', request),
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
