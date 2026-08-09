import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { handleMcpRequest } from '@/lib/server/mcp-api'
import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      POST: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      DELETE: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      PUT: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
      PATCH: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
      HEAD: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
      OPTIONS: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
      TRACE: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
      CONNECT: () => methodNotAllowed(['GET', 'POST', 'DELETE']),
    },
  },
})
