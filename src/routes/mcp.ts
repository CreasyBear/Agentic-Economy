import { createFileRoute } from '@tanstack/react-router'

import { handleMcpRouteRequest } from '@/lib/server/mcp-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: () => methodNotAllowed(['POST', 'DELETE']),
      POST: ({ request }) => handleMcpRouteRequest(request),
      DELETE: ({ request }) => handleMcpRouteRequest(request),
      PUT: () => methodNotAllowed(['POST', 'DELETE']),
      PATCH: () => methodNotAllowed(['POST', 'DELETE']),
      HEAD: () => methodNotAllowed(['POST', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['POST', 'DELETE']),
      TRACE: () => methodNotAllowed(['POST', 'DELETE']),
      CONNECT: () => methodNotAllowed(['POST', 'DELETE']),
    },
  },
})
