import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { handleMcpRequest } from '@/lib/server/mcp-api'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      POST: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
      DELETE: ({ request }) => withHttpRateLimit(request, 'public-read', () => handleMcpRequest(request)),
    },
  },
})
