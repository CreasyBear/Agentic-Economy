import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { handleMcpRequest } from '@/lib/server/mcp-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: () => methodNotAllowed(['POST', 'DELETE']),
      POST: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      DELETE: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      PUT: () => methodNotAllowed(['POST', 'DELETE']),
      PATCH: () => methodNotAllowed(['POST', 'DELETE']),
      HEAD: () => methodNotAllowed(['POST', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['POST', 'DELETE']),
      TRACE: () => methodNotAllowed(['POST', 'DELETE']),
      CONNECT: () => methodNotAllowed(['POST', 'DELETE']),
    },
  },
})
